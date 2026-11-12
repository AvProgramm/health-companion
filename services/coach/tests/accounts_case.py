"""Give every account test its own empty database, secret and attempt limiters."""
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from coach.accounts import routes
from coach.accounts.limits import AttemptLimiter
from coach.app import app

# A fictional signing secret, long enough to pass the 32-character rule
SECRET = 'fictional-signing-secret-for-tests-only-0001'
# A fictional person, used wherever a test needs one valid account
ADA = {'email': 'ada@example.org', 'password': 'correct horse battery'}
# The four account routes as (method, path), for checks that apply to all of them
ROUTES = (('POST', '/api/auth/signup'), ('POST', '/api/auth/signin'),
          ('GET', '/api/auth/session'), ('POST', '/api/auth/signout'))


class AccountsCase(unittest.TestCase):
    def setUp(self):
        """Start each test with an empty temporary database and unused limiters."""
        # Create the folder first so it is removed last, after the environment is restored.
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        database = Path(folder.name, 'accounts.sqlite').as_posix()

        # Point the store and the token signer at fictional settings, as a laptop would have them.
        environment = patch.dict(os.environ, {'DATABASE_URL': f'sqlite:///{database}', 'AUTH_SECRET': SECRET})
        environment.start()
        self.addCleanup(environment.stop)
        os.environ.pop('RENDER', None)

        # Replace both limiters because attempts counted by one test must not lock out the next.
        for name in ('SIGNIN_FAILURES', 'SIGNUPS'):
            limiter = getattr(routes, name)
            fresh = patch.object(routes, name, AttemptLimiter(limiter.max_attempts, limiter.window_seconds))
            fresh.start()
            self.addCleanup(fresh.stop)
        self.client = TestClient(app)

    def sign_up(self, client=None, **changes):
        """Return the reply to a sign-up for the fictional person, with any changed fields."""
        return (client or self.client).post('/api/auth/signup', json={**ADA, **changes})

    def sign_in(self, client=None, **changes):
        """Return the reply to a sign-in for the fictional person, with any changed fields."""
        return (client or self.client).post('/api/auth/signin', json={**ADA, **changes})
