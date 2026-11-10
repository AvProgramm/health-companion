"""Check exact deployment allowlists and a credential-free readiness endpoint."""
import os
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from coach.app import app

# Clear only deployment inputs, never load or inspect real credentials.
EMPTY = {'COACH_ALLOWED_HOSTS': '', 'COACH_ALLOWED_ORIGINS': '', 'RENDER_EXTERNAL_HOSTNAME': ''}


class HealthTests(unittest.TestCase):
    def test_health_needs_no_key_or_model_call(self):
        """Report service startup without disclosing configuration."""
        response = TestClient(app).get('/api/health')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok'})
        self.assertEqual(response.headers['cache-control'], 'no-store')


class PolicyTests(unittest.TestCase):
    def policy(self, **values):
        """Read only the fictional deployment settings for this case."""
        from coach.http_policy import read_http_policy
        with patch.dict(os.environ, {**EMPTY, **values}):
            return read_http_policy()

    def test_local_defaults_stay_exact(self):
        """Keep the laptop and test client working without new configuration."""
        hosts, origins = self.policy()
        self.assertEqual(hosts, ('127.0.0.1', 'localhost', 'testserver'))
        self.assertEqual(origins, ('http://localhost:4173', 'http://127.0.0.1:4173',
                                   'http://localhost:5173', 'http://127.0.0.1:5173'))

    def test_adds_only_the_named_deployment_hosts_and_origins(self):
        """Accept one Render service and one authorised frontend, not a suffix wildcard."""
        hosts, origins = self.policy(RENDER_EXTERNAL_HOSTNAME='fictional-coach.onrender.com',
                                     COACH_ALLOWED_ORIGINS='https://fictional-app.vercel.app/')
        self.assertIn('fictional-coach.onrender.com', hosts)
        self.assertIn('https://fictional-app.vercel.app', origins)
        self.assertNotIn('*', hosts)
        self.assertNotIn('https://other-app.vercel.app', origins)

    def test_rejects_unsafe_host_patterns(self):
        """Refuse broad or malformed host settings instead of weakening protection."""
        for host in ('*', '*.onrender.com', 'https://example.org', 'example.org/path', 'example.org:443'):
            with self.subTest(host=host), self.assertRaises(ValueError):
                self.policy(COACH_ALLOWED_HOSTS=host)

    def test_rejects_non_origin_urls(self):
        """Require HTTPS and a bare origin for deployed frontend entries."""
        for origin in ('*', 'http://example.org', 'https://example.org/path',
                       'https://user:password@example.org', 'https://example.org?secret=x'):
            with self.subTest(origin=origin), self.assertRaises(ValueError):
                self.policy(COACH_ALLOWED_ORIGINS=origin)

    def test_configured_origin_passes_but_another_origin_is_refused(self):
        """Check the real request boundary without calling an external provider."""
        with patch('coach.app.ALLOWED_ORIGINS', ('https://fictional-app.vercel.app',)):
            client = TestClient(app)
            self.assertEqual(client.post('/api/firebase/account', json={}, headers={'origin': 'https://fictional-app.vercel.app'}).status_code, 401)
            self.assertEqual(client.post('/api/firebase/account', json={}, headers={'origin': 'https://other-app.vercel.app'}).status_code, 403)
