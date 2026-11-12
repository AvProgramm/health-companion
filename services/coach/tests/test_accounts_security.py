"""Check forged tokens, lockouts, stored hashes and settings for accounts, with fictional people."""
import os
import time
import unittest
import warnings
from unittest.mock import patch

import jwt
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import delete, inspect, select

from accounts_case import ADA, ROUTES, SECRET, AccountsCase
from coach.accounts import routes, store
from coach.accounts.limits import AttemptLimiter
from coach.accounts.tokens import read_secret
from coach.app import app


class TokenTests(AccountsCase):
    def session_with(self, token):
        """Return the session reply for a visitor who presents this token as their cookie."""
        visitor = TestClient(app)
        visitor.cookies.set('hc_session', token)
        return visitor.get('/api/auth/session')

    def claims(self, **changes):
        """Return valid claims for the signed-up fictional person, with any changed claims."""
        now = int(time.time())
        return {'sub': self.account_id, 'iat': now, 'exp': now + 600, **changes}

    def setUp(self):
        """Sign the fictional person up so forged tokens can name a real account."""
        super().setUp()
        self.account_id = self.sign_up().json()['id']

    def test_a_token_signed_like_ours_is_accepted(self):
        """Confirm the forged-token helpers would pass if nothing were wrong with the token."""
        self.assertEqual(self.session_with(jwt.encode(self.claims(), SECRET, algorithm='HS256')).status_code, 200)

    def test_a_tampered_token_is_refused(self):
        """Refuse a token whose signature no longer matches its claims."""
        token = self.client.cookies['hc_session']
        header, payload, signature = token.split('.')
        flipped = signature[:-2] + ('AA' if not signature.endswith('AA') else 'BB')
        for forged in ('.'.join((header, payload, flipped)), token[:-10], 'not-a-token', ''):
            with self.subTest(forged=forged[-12:]):
                response = self.session_with(forged)
                self.assertEqual(response.status_code, 401)
                self.assertEqual(response.json(), {'detail': 'Sign in to continue.'})

    def test_an_expired_token_is_refused(self):
        """End a session after its expiry time."""
        expired = jwt.encode(self.claims(iat=int(time.time()) - 1200, exp=int(time.time()) - 600), SECRET, algorithm='HS256')
        self.assertEqual(self.session_with(expired).status_code, 401)

    def test_a_token_from_another_secret_or_algorithm_is_refused(self):
        """Accept only HS256 tokens signed with this service's secret."""
        other_secret = jwt.encode(self.claims(), 'another-fictional-secret-of-enough-length-0002', algorithm='HS256')
        unsigned = jwt.encode(self.claims(), None, algorithm='none')
        # Ignore the library's key-length advice because this forgery reuses our secret on purpose.
        with warnings.catch_warnings():
            warnings.simplefilter('ignore')
            longer_hash = jwt.encode(self.claims(), SECRET, algorithm='HS512')
        for forged in (other_secret, unsigned, longer_hash):
            with self.subTest(forged=forged[:20]):
                self.assertEqual(self.session_with(forged).status_code, 401)

    def test_a_token_without_an_expiry_or_owner_is_refused(self):
        """Require both claims so no token lasts for ever or belongs to nobody."""
        for missing in ('exp', 'sub'):
            with self.subTest(missing=missing):
                claims = self.claims()
                del claims[missing]
                self.assertEqual(self.session_with(jwt.encode(claims, SECRET, algorithm='HS256')).status_code, 401)

    def test_a_deleted_account_has_no_session(self):
        """Refuse a still-valid token once its account is gone."""
        with store.engine().begin() as connection:
            connection.execute(delete(store.ACCOUNTS).where(store.ACCOUNTS.c.id == self.account_id))
        self.assertEqual(self.client.get('/api/auth/session').status_code, 401)


class LockoutTests(AccountsCase):
    def test_the_sixth_failed_sign_in_is_locked_out_even_with_the_right_password(self):
        """Stop guessing after five failures for one visitor and email."""
        self.sign_up()
        visitor = TestClient(app)
        for _attempt in range(5):
            self.assertEqual(self.sign_in(visitor, password='not the password').status_code, 401)
        for password in ('not the password', ADA['password']):
            with self.subTest(password=password):
                response = self.sign_in(visitor, password=password)
                self.assertEqual(response.status_code, 429)
                self.assertEqual(response.json(), {'detail': 'Too many attempts. Wait a few minutes and try again.'})
                self.assertNotIn('set-cookie', response.headers)

        # Another email from the same visitor is counted separately.
        self.assertEqual(self.sign_in(visitor, email='grace@example.org').status_code, 401)

    def test_a_success_resets_the_failures_for_that_email(self):
        """Forgive earlier mistakes once the person gets in."""
        self.sign_up()
        for _round in range(2):
            for _attempt in range(4):
                self.assertEqual(self.sign_in(password='not the password').status_code, 401)
            self.assertEqual(self.sign_in().status_code, 200)

    def test_sign_ups_from_one_visitor_are_capped(self):
        """Allow ten sign-ups an hour from one address."""
        for number in range(10):
            self.assertEqual(self.sign_up(email=f'person{number}@example.org').status_code, 201)
        response = self.sign_up(email='person10@example.org')
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.json(), {'detail': 'Too many attempts. Wait a few minutes and try again.'})

    def test_old_attempts_expire_and_memory_stays_bounded(self):
        """Forget attempts outside the window and drop the oldest key once the limiter is full."""
        limiter = AttemptLimiter(2, 60)
        with patch('coach.accounts.limits.time.monotonic', return_value=1000.0):
            limiter.record('first')
            self.assertFalse(limiter.is_blocked('first'))
            limiter.record('first')
            self.assertTrue(limiter.is_blocked('first'))
        with patch('coach.accounts.limits.time.monotonic', return_value=1061.0):
            self.assertFalse(limiter.is_blocked('first'))

        # Fill a three-key limiter with blocked keys, then add one more.
        with patch('coach.accounts.limits.MAX_KEYS', 3), patch('coach.accounts.limits.time.monotonic', return_value=2000.0):
            for key in ('second', 'third', 'fourth', 'fifth'):
                limiter.record(key)
                limiter.record(key)
            self.assertFalse(limiter.is_blocked('second'))
            self.assertTrue(limiter.is_blocked('fifth'))


class StoreTests(AccountsCase):
    def stored_rows(self):
        """Return every stored account row as a dictionary."""
        with store.engine().connect() as connection:
            return [dict(row) for row in connection.execute(select(store.ACCOUNTS)).mappings()]

    def test_the_stored_hash_is_argon2id_and_never_the_password(self):
        """Keep only a salted argon2id hash and an ISO-8601 UTC creation time."""
        self.sign_up()
        (row,) = self.stored_rows()
        self.assertTrue(row['password_hash'].startswith('$argon2id$'))
        self.assertNotIn(ADA['password'], ''.join(str(value) for value in row.values()))
        self.assertTrue(row['created_at'].endswith('+00:00'))

    def test_an_outdated_hash_is_replaced_on_sign_in(self):
        """Upgrade a hash made with weaker settings once the password is known to be right."""
        from argon2 import PasswordHasher
        self.sign_up()
        weaker = PasswordHasher(time_cost=1, memory_cost=8, parallelism=1).hash(ADA['password'])
        (row,) = self.stored_rows()
        store.replace_password_hash(row['id'], weaker)
        self.assertEqual(self.sign_in().status_code, 200)
        (row,) = self.stored_rows()
        self.assertNotEqual(row['password_hash'], weaker)
        self.assertEqual(self.sign_in().status_code, 200)

    def test_an_injection_shaped_email_is_refused_or_stored_inertly(self):
        """Treat every email as data, never as part of a statement."""
        refused = self.sign_up(email="ada@example.org'; DROP TABLE accounts;--")
        self.assertEqual(refused.status_code, 422)
        inert = "ada'--@example.org"
        self.assertEqual(self.sign_up(email=inert).status_code, 201)
        self.assertEqual(self.sign_in(email="'OR'1'='1'--@example.org").status_code, 401)
        self.assertTrue(inspect(store.engine()).has_table('accounts'))
        self.assertEqual([row['email'] for row in self.stored_rows()], [inert])

    def test_a_render_postgres_url_uses_the_psycopg_driver(self):
        """Rewrite both Postgres spellings and leave other databases alone."""
        cases = {
            'postgres://ada:fictional@db.example.org:5432/diary': 'postgresql+psycopg://ada:fictional@db.example.org:5432/diary',
            'postgresql://ada:fictional@db.example.org/diary': 'postgresql+psycopg://ada:fictional@db.example.org/diary',
            'postgresql+psycopg://ada:fictional@db.example.org/diary': 'postgresql+psycopg://ada:fictional@db.example.org/diary',
            'sqlite:///fictional.sqlite': 'sqlite:///fictional.sqlite',
        }
        for given, expected in cases.items():
            with self.subTest(given=given):
                self.assertEqual(store.driver_url(given), expected)


class SettingsTests(AccountsCase):
    def test_the_cookie_is_secure_on_a_deployed_host(self):
        """Send the cookie only over HTTPS anywhere but the laptop."""
        # Serve the same routes from a fictional host because the main app refuses unknown hosts.
        hosted = FastAPI()
        hosted.include_router(routes.router)
        response = TestClient(hosted, base_url='https://fictional-coach.example.org').post('/api/auth/signup', json=ADA)
        self.assertEqual(response.status_code, 201)
        self.assertIn('secure', response.headers['set-cookie'].lower())
        local = TestClient(hosted, base_url='http://localhost:8000').post('/api/auth/signin', json=ADA)
        self.assertNotIn('secure', local.headers['set-cookie'].lower())

    def test_a_hosted_service_without_a_secret_answers_unavailable(self):
        """Refuse to sign sessions with a throwaway secret once deployed."""
        with patch.dict(os.environ, {'RENDER': 'true', 'AUTH_SECRET': ''}):
            for method, path in ROUTES[:3]:
                with self.subTest(path=path):
                    response = self.client.request(method, path, json=ADA if method == 'POST' else None)
                    self.assertEqual(response.status_code, 503)
                    self.assertEqual(response.json(), {'detail': 'Sign-in is not set up on this service yet.'})
            self.assertEqual(self.client.post('/api/auth/signout', json={}).status_code, 204)

    def test_a_laptop_without_a_secret_still_signs_in(self):
        """Use one random secret for the life of the process when none is configured."""
        with patch.dict(os.environ, {'AUTH_SECRET': ''}):
            self.assertEqual(self.sign_up().status_code, 201)
            self.assertEqual(self.client.get('/api/auth/session').status_code, 200)
            self.assertEqual(read_secret(), read_secret())
            self.assertGreaterEqual(len(read_secret()), 32)

    def test_a_short_secret_is_refused(self):
        """Stop with a clear message instead of signing with a guessable secret."""
        with patch.dict(os.environ, {'AUTH_SECRET': 'too-short'}):
            with self.assertRaisesRegex(ValueError, 'at least 32'):
                read_secret()


if __name__ == '__main__':
    unittest.main()
