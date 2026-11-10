"""Check Firebase account boundaries without contacting a real project."""
import unittest
import base64
import json
import time
import httpx
from unittest.mock import patch
from fastapi.testclient import TestClient
from coach.app import app

# Fictional public Firebase settings; model credentials must never enter the response.
SETTINGS = {'FIREBASE_API_KEY': 'fictional-web-key', 'FIREBASE_PROJECT_ID': 'fictional-project',
            'FIREBASE_AUTH_DOMAIN': 'fictional-project.firebaseapp.com', 'FIREBASE_APP_ID': 'fictional-app',
            'GROQ_API_KEY': 'fictional-private-key'}


class FirebaseAccountTests(unittest.TestCase):
    def test_config_exposes_only_the_web_allowlist(self):
        """Return the web configuration without copying the service environment."""
        with patch.dict('os.environ', SETTINGS):
            response = TestClient(app).get('/api/firebase/config')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'apiKey': 'fictional-web-key', 'projectId': 'fictional-project',
                                          'authDomain': 'fictional-project.firebaseapp.com', 'appId': 'fictional-app'})
        self.assertIn('no-store', response.headers['cache-control'])

    def test_missing_config_is_actionable(self):
        """Leave local use available when Firebase has not been set up."""
        with patch.dict('os.environ', {'FIREBASE_PROJECT_ID': ''}):
            response = TestClient(app).get('/api/firebase/config')
        self.assertEqual(response.status_code, 503)

    def test_account_requires_a_bearer_token(self):
        """Refuse anonymous account access instead of accepting a caller's user ID."""
        response = TestClient(app).post('/api/firebase/account', json={})
        self.assertEqual(response.status_code, 401)

    def test_other_sites_cannot_use_the_account_endpoint(self):
        """Reject unrelated browser origins before any Firebase request."""
        response = TestClient(app).post('/api/firebase/account', json={}, headers={'origin': 'https://example.org'})
        self.assertEqual(response.status_code, 403)


# A fictional token is accepted only by the mocked Firebase endpoint in these tests.
def token_for(**changes):
    """Build claims for a fake token without using a real credential."""
    claims = {'aud': 'fictional-project', 'iss': 'https://securetoken.google.com/fictional-project',
              'sub': 'fictional-user', 'exp': int(time.time()) + 600, 'auth_time': 100,
              'firebase': {'sign_in_provider': 'google.com'}}
    claims.update(changes)
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip('=')
    return f'fictional.{payload}.fictional'


class SessionTests(unittest.TestCase):
    def request(self, token, user=None, status=200):
        """Answer only the Firebase lookup with a fictional account."""
        original = httpx.AsyncClient
        user = user or {'localId': 'fictional-user', 'displayName': 'Fictional Person', 'validSince': '0'}
        self.sent = []
        def respond(request):
            """Capture the outgoing token request without logging it."""
            self.sent.append(json.loads(request.content))
            return httpx.Response(status, json={'users': [user]})
        with patch.dict('os.environ', SETTINGS), patch('coach.cloud.session.httpx.AsyncClient',
                side_effect=lambda **kwargs: original(**kwargs, transport=httpx.MockTransport(respond))):
            return TestClient(app).post('/api/firebase/account', json={'uid': 'someone-else'},
                                       headers={'Authorization': f'Bearer {token}'})

    def test_verified_account_ignores_a_client_supplied_owner(self):
        """Derive ownership only from the validated token and account."""
        token = token_for()
        response = self.request(token)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'uid': 'fictional-user', 'displayName': 'Fictional Person'})
        self.assertEqual(self.sent, [{'idToken': token}])
        self.assertIn('no-store', response.headers['cache-control'])

    def test_firebase_rejection_is_not_treated_as_a_session(self):
        """Delegate signature verification to Firebase and honour its refusal."""
        self.assertEqual(self.request(token_for(), status=400).status_code, 401)

    def test_other_project_and_expired_tokens_are_refused(self):
        """Keep the configured project's audience and current expiry mandatory."""
        for changes in ({'aud': 'other-project'}, {'iss': 'https://example.org'}, {'exp': 1}):
            with self.subTest(changes=changes):
                self.assertEqual(self.request(token_for(**changes)).status_code, 401)

    def test_disabled_revoked_or_mismatched_accounts_are_refused(self):
        """Check account state and ownership even after Firebase answers."""
        for user in ({'localId': 'fictional-user', 'disabled': True},
                     {'localId': 'fictional-user', 'validSince': '200'}, {'localId': 'someone-else'}):
            with self.subTest(user=user):
                self.assertEqual(self.request(token_for(), user=user).status_code, 401)
