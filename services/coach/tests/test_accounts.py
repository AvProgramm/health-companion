"""Check sign-up, sign-in, session and sign-out through the HTTP boundary with fictional people."""
import uuid

from fastapi.testclient import TestClient

from accounts_case import ADA, ROUTES, AccountsCase
from coach.app import app


class SignUpTests(AccountsCase):
    def test_sign_up_returns_the_account_and_sets_a_guarded_cookie(self):
        """Keep the session token in an HttpOnly cookie and out of the JSON body."""
        response = self.sign_up(email='  Ada@Example.org ')
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(set(body), {'id', 'email'})
        self.assertEqual(body['email'], 'ada@example.org')
        self.assertEqual(str(uuid.UUID(body['id'])), body['id'])

        # Read the raw header because the client hides the cookie's attributes.
        cookie = response.headers['set-cookie']
        self.assertTrue(cookie.startswith('hc_session='))
        lowered = cookie.lower()
        for attribute in ('httponly', 'samesite=strict', 'path=/api', 'max-age=2592000'):
            self.assertIn(attribute, lowered)
        self.assertNotIn('secure', lowered)
        self.assertNotIn(response.cookies['hc_session'], response.text)
        self.assertEqual(response.headers['cache-control'], 'no-store')

    def test_a_duplicate_email_is_refused_in_any_letter_case(self):
        """Treat one address as one account however it is capitalised."""
        self.assertEqual(self.sign_up().status_code, 201)
        for email in ('ada@example.org', 'ADA@EXAMPLE.ORG'):
            with self.subTest(email=email):
                response = self.sign_up(email=email)
                self.assertEqual(response.status_code, 409)
                self.assertEqual(response.json(), {'detail': 'An account with this email already exists. Sign in instead.'})

    def test_a_weak_or_overlong_password_is_refused_with_a_reason(self):
        """Accept 10 to 128 characters and say which limit was missed."""
        for password in ('short', 'x' * 9, 'x' * 129):
            with self.subTest(length=len(password)):
                response = self.sign_up(password=password)
                self.assertEqual(response.status_code, 422)
                self.assertIn('password', response.json()['detail'].lower())
                self.assertNotIn(password, response.text)
        for password in ('x' * 10, 'x' * 128):
            with self.subTest(length=len(password)):
                self.assertEqual(self.sign_up(email=f'ada{len(password)}@example.org', password=password).status_code, 201)

    def test_a_malformed_email_is_refused(self):
        """Require one @, a dot in the domain, no spaces and at most 254 characters."""
        for email in ('ada', 'ada@example', 'ada@@example.org', 'ada lovelace@example.org', '@example.org',
                      'a' * 250 + '@example.org', ''):
            with self.subTest(email=email):
                response = self.sign_up(email=email)
                self.assertEqual(response.status_code, 422)
                self.assertIn('email', response.json()['detail'].lower())

    def test_extra_or_wrongly_typed_fields_are_refused(self):
        """Send only the email and password this screen asks for."""
        for body in ({**ADA, 'role': 'admin'}, {'email': ADA['email']}, {**ADA, 'password': 1234567890}):
            with self.subTest(body=sorted(body)):
                response = self.client.post('/api/auth/signup', json=body)
                self.assertEqual(response.status_code, 422)
                self.assertNotIn('set-cookie', response.headers)


class SignInTests(AccountsCase):
    def test_sign_in_returns_the_same_account_and_a_cookie(self):
        """Open a session on another device with the same email and password."""
        created = self.sign_up().json()
        response = self.sign_in(TestClient(app), email='ADA@example.org')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), created)
        self.assertIn('httponly', response.headers['set-cookie'].lower())
        self.assertNotIn(response.cookies['hc_session'], response.text)
        self.assertEqual(response.headers['cache-control'], 'no-store')

    def test_a_wrong_password_and_an_unknown_email_look_the_same(self):
        """Give no hint about which addresses have an account."""
        self.sign_up()
        wrong_password = self.sign_in(TestClient(app), password='not the password')
        unknown_email = self.sign_in(TestClient(app), email='grace@example.org')
        for response in (wrong_password, unknown_email):
            self.assertEqual(response.status_code, 401)
            self.assertEqual(response.json(), {'detail': 'Email or password is incorrect.'})
            self.assertNotIn('set-cookie', response.headers)
        self.assertEqual(wrong_password.content, unknown_email.content)


class SessionTests(AccountsCase):
    def test_a_valid_cookie_returns_the_account(self):
        """Recognise the person on reload without sending the password again."""
        created = self.sign_up().json()
        response = self.client.get('/api/auth/session')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), created)
        self.assertEqual(response.headers['cache-control'], 'no-store')

    def test_no_cookie_is_refused(self):
        """Ask a visitor without a session to sign in."""
        response = self.client.get('/api/auth/session')
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json(), {'detail': 'Sign in to continue.'})
        self.assertEqual(response.headers['cache-control'], 'no-store')

    def test_sign_out_clears_the_cookie_and_ends_the_session(self):
        """Remove the cookie so the next session check is refused."""
        self.sign_up()
        response = self.client.post('/api/auth/signout', json={})
        self.assertEqual(response.status_code, 204)
        self.assertEqual(response.content, b'')
        cleared = response.headers['set-cookie'].lower()
        self.assertTrue(cleared.startswith('hc_session=""') or cleared.startswith('hc_session=;'))
        self.assertIn('max-age=0', cleared)
        self.assertIn('path=/api', cleared)
        self.assertEqual(self.client.get('/api/auth/session').status_code, 401)

    def test_sign_out_succeeds_without_a_session(self):
        """Let sign-out be repeated safely."""
        self.assertEqual(self.client.post('/api/auth/signout', json={}).status_code, 204)


class BoundaryTests(AccountsCase):
    def test_another_site_is_refused_on_every_route(self):
        """Keep the same browser origin boundary as the other coach routes."""
        self.sign_up()
        for method, path in ROUTES:
            with self.subTest(path=path):
                response = self.client.request(method, path, json=ADA if method == 'POST' else None,
                                               headers={'origin': 'https://example.org'})
                self.assertEqual(response.status_code, 403)
                self.assertNotIn('set-cookie', response.headers)
                self.assertEqual(response.headers['cache-control'], 'no-store')

    def test_an_allowed_origin_is_accepted(self):
        """Serve the local preview that the phone opens."""
        response = self.client.post('/api/auth/signup', json=ADA, headers={'origin': 'http://localhost:4173'})
        self.assertEqual(response.status_code, 201)

    def test_a_post_that_is_not_json_is_refused(self):
        """Refuse a plain form post, which a browser can send across sites without a preflight."""
        for method, path in ROUTES:
            if method != 'POST':
                continue
            with self.subTest(path=path):
                response = self.client.post(path, content='email=ada@example.org&password=correct horse battery',
                                            headers={'content-type': 'application/x-www-form-urlencoded'})
                self.assertEqual(response.status_code, 415)
                self.assertNotIn('set-cookie', response.headers)
