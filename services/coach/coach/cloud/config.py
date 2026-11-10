"""Expose only Firebase's public web configuration."""
import os
from fastapi import HTTPException

# These identify the web app; service credentials and model keys are never copied.
_WEB_FIELDS = {'apiKey': 'FIREBASE_API_KEY', 'projectId': 'FIREBASE_PROJECT_ID',
               'authDomain': 'FIREBASE_AUTH_DOMAIN', 'appId': 'FIREBASE_APP_ID'}


def web_config():
    """Return the configured public fields or an actionable setup error."""
    values = {field: os.getenv(setting, '').strip() for field, setting in _WEB_FIELDS.items()}
    # Ignore incomplete setup because an app must never silently target another project.
    if not all(values.values()):
        raise HTTPException(503, 'Complete the Firebase web settings in the laptop .env, then restart the service.')
    return values
