"""Check saving, reading and deleting an account's diary backup through the HTTP boundary."""
import json

from fastapi.testclient import TestClient

from accounts_case import AccountsCase
from coach.accounts.backup_routes import MAXIMUM_BACKUP_BYTES
from coach.app import app

# The backup routes as (method, path), for checks that apply to all of them
BACKUP_ROUTES = (('PUT', '/api/account/backup'), ('GET', '/api/account/backup'),
                 ('GET', '/api/account/backup/status'), ('DELETE', '/api/account/backup'))
# A fictional backup; the service never reads its meaning, so a small nested object is enough
BACKUP = {'format': 'health-companion-backup', 'formatVersion': 1, 'exportedAt': '2026-11-09T10:00:00.000Z',
          'foods': [{'id': 'fictional-oats', 'name': 'Fictional oats café', 'fibre': None}], 'meals': []}
# A second fictional backup, to tell a replacement from the first
NEWER_BACKUP = {**BACKUP, 'exportedAt': '2026-11-10T10:00:00.000Z', 'meals': [{'id': 'fictional-lunch'}]}


class BackupCase(AccountsCase):
    def save(self, backup=BACKUP, client=None):
        """Return the reply to saving this backup for the client's account."""
        return (client or self.client).put('/api/account/backup', json={'backup': backup})

    def other_person(self):
        """Return a client signed in as a second fictional person."""
        client = TestClient(app)
        self.assertEqual(self.sign_up(client, email='grace@example.org').status_code, 201)
        return client


class SessionRequiredTests(BackupCase):
    def test_every_route_is_refused_without_a_session(self):
        """Ask a visitor without a session to sign in before anything is read or written."""
        for method, path in BACKUP_ROUTES:
            with self.subTest(method=method, path=path):
                response = self.client.request(method, path, json={'backup': BACKUP} if method == 'PUT' else None)
                self.assertEqual(response.status_code, 401)
                self.assertEqual(response.json(), {'detail': 'Sign in to continue.'})
                self.assertEqual(response.headers['cache-control'], 'no-store')

    def test_a_forged_cookie_is_refused(self):
        """Accept only a token this service signed."""
        self.client.cookies.set('hc_session', 'fictional.forged.token')
        self.assertEqual(self.client.get('/api/account/backup').status_code, 401)

    def test_another_site_is_refused_on_every_route(self):
        """Keep the same browser origin boundary as the other account routes."""
        self.sign_up()
        self.save()
        for method, path in BACKUP_ROUTES:
            with self.subTest(method=method, path=path):
                response = self.client.request(method, path, json={'backup': NEWER_BACKUP} if method == 'PUT' else None,
                                               headers={'origin': 'https://example.org'})
                self.assertEqual(response.status_code, 403)
        # Check the refused write and delete left the saved copy alone.
        self.assertEqual(self.client.get('/api/account/backup').json()['backup'], BACKUP)


class SaveAndReadTests(BackupCase):
    def test_a_saved_backup_reads_back_exactly(self):
        """Return the same object the app sent, with when it was saved and how large it is."""
        self.sign_up()
        saved = self.save()
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(set(saved.json()), {'savedAt', 'sizeBytes'})
        self.assertTrue(saved.json()['savedAt'].endswith('+00:00'))
        self.assertEqual(saved.json()['sizeBytes'], len(json.dumps(BACKUP, separators=(',', ':'))))
        self.assertEqual(saved.headers['cache-control'], 'no-store')

        loaded = self.client.get('/api/account/backup')
        self.assertEqual(loaded.status_code, 200)
        self.assertEqual(loaded.json(), {**saved.json(), 'backup': BACKUP})
        self.assertEqual(loaded.headers['cache-control'], 'no-store')

    def test_a_second_save_replaces_the_first(self):
        """Keep one latest backup per account."""
        self.sign_up()
        self.save()
        self.assertEqual(self.save(NEWER_BACKUP).status_code, 200)
        self.assertEqual(self.client.get('/api/account/backup').json()['backup'], NEWER_BACKUP)

    def test_status_reports_the_save_without_its_content(self):
        """Tell the Me page when a backup was saved without sending the diary."""
        self.sign_up()
        missing = self.client.get('/api/account/backup/status')
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(missing.json(), {'detail': 'No backup is saved for this account yet.'})

        saved = self.save().json()
        status = self.client.get('/api/account/backup/status')
        self.assertEqual(status.status_code, 200)
        self.assertEqual(status.json(), saved)
        self.assertNotIn('backup', status.json())
        self.assertNotIn('Fictional oats', status.text)
        self.assertEqual(status.headers['cache-control'], 'no-store')

    def test_reading_before_any_save_finds_nothing(self):
        """Say plainly that this account has no backup."""
        self.sign_up()
        response = self.client.get('/api/account/backup')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {'detail': 'No backup is saved for this account yet.'})

    def test_delete_removes_the_backup_and_can_be_repeated(self):
        """Answer 204 whether or not a backup was there."""
        self.sign_up()
        self.save()
        for _attempt in range(2):
            response = self.client.delete('/api/account/backup')
            self.assertEqual(response.status_code, 204)
            self.assertEqual(response.content, b'')
        self.assertEqual(self.client.get('/api/account/backup').status_code, 404)
        self.assertEqual(self.client.get('/api/account/backup/status').status_code, 404)


class OwnershipTests(BackupCase):
    def test_one_account_never_reads_replaces_or_deletes_another(self):
        """Take the account from the session only, so each person reaches only their own copy."""
        self.sign_up()
        self.save()
        grace = self.other_person()

        # Check the second person starts with nothing, even with the first person's backup stored.
        self.assertEqual(grace.get('/api/account/backup').status_code, 404)
        self.assertEqual(grace.get('/api/account/backup/status').status_code, 404)

        # Check her save and delete leave the first person's copy as it was.
        self.assertEqual(self.save(NEWER_BACKUP, grace).status_code, 200)
        self.assertEqual(self.client.get('/api/account/backup').json()['backup'], BACKUP)
        self.assertEqual(grace.delete('/api/account/backup').status_code, 204)
        self.assertEqual(self.client.get('/api/account/backup').json()['backup'], BACKUP)

    def test_an_account_named_in_the_body_is_refused(self):
        """Refuse a body that tries to choose whose backup is written."""
        first = self.sign_up().json()
        self.save()
        grace = self.other_person()
        for extra in ('accountId', 'account_id', 'id'):
            with self.subTest(extra=extra):
                response = grace.put('/api/account/backup', json={'backup': NEWER_BACKUP, extra: first['id']})
                self.assertEqual(response.status_code, 422)
        self.assertEqual(self.client.get('/api/account/backup').json()['backup'], BACKUP)
        self.assertEqual(grace.get('/api/account/backup').status_code, 404)


class RefusedBodyTests(BackupCase):
    def put_raw(self, content, **headers):
        """Return the reply to a PUT with this exact body, declared as JSON."""
        return self.client.put('/api/account/backup', content=content, headers={'content-type': 'application/json', **headers})

    def test_an_oversize_backup_is_refused_with_a_way_out(self):
        """Refuse more than 5 MB with a sentence the person can act on, storing nothing."""
        self.sign_up()
        response = self.save({'notes': 'x' * MAXIMUM_BACKUP_BYTES})
        self.assertEqual(response.status_code, 413)
        self.assertIn('5 MB', response.json()['detail'])
        self.assertIn('Download a backup file', response.json()['detail'])
        self.assertEqual(self.client.get('/api/account/backup/status').status_code, 404)

    def test_an_understated_content_length_does_not_pass_the_limit(self):
        """Count the bytes that arrive, because the declared length is only a claim."""
        self.sign_up()

        def chunks():
            """Yield a body of just over the limit in pieces, so no Content-Length is sent."""
            yield b'{"backup": {"notes": "'
            yield b'x' * MAXIMUM_BACKUP_BYTES
            yield b'"}}'
        self.assertEqual(self.put_raw(chunks()).status_code, 413)
        self.assertEqual(self.client.get('/api/account/backup/status').status_code, 404)

    def test_a_body_at_the_limit_is_accepted(self):
        """Allow a backup of exactly the largest size."""
        self.sign_up()
        frame = len('{"backup":{"notes":""}}')
        body = '{"backup":{"notes":"' + 'x' * (MAXIMUM_BACKUP_BYTES - frame) + '"}}'
        self.assertEqual(len(body), MAXIMUM_BACKUP_BYTES)
        self.assertEqual(self.put_raw(body).status_code, 200)

    def test_a_backup_that_is_not_an_object_is_refused(self):
        """Accept only a JSON object as the backup."""
        self.sign_up()
        for backup in ([BACKUP], 'text', 5, None, True):
            with self.subTest(backup=type(backup).__name__):
                self.assertEqual(self.save(backup).status_code, 422)
        self.assertEqual(self.client.get('/api/account/backup/status').status_code, 404)

    def test_a_malformed_body_is_refused(self):
        """Refuse a missing backup, unreadable JSON, a non-finite number and a body that is not an object."""
        self.sign_up()
        for content in ('{}', '{"backup": ', '[]', '{"backup": {"energy": NaN}}', '', b'\xff\xfe', '[' * 100_000):
            with self.subTest(content=content[:20]):
                response = self.put_raw(content)
                self.assertEqual(response.status_code, 422)
                self.assertEqual(response.headers['cache-control'], 'no-store')
        self.assertEqual(self.client.get('/api/account/backup/status').status_code, 404)

    def test_extra_top_level_fields_are_refused(self):
        """Send only the backup this screen asks for."""
        self.sign_up()
        response = self.client.put('/api/account/backup', json={'backup': BACKUP, 'note': 'fictional'})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.client.get('/api/account/backup/status').status_code, 404)

    def test_a_write_that_is_not_json_is_refused(self):
        """Refuse a plain form body, which a browser can send across sites without a preflight."""
        self.sign_up()
        response = self.client.put('/api/account/backup', content='backup=fictional',
                                   headers={'content-type': 'application/x-www-form-urlencoded'})
        self.assertEqual(response.status_code, 415)
