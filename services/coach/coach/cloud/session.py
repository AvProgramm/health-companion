"""Validate a user's Firebase session without an administrator credential."""
import base64
import json
import math
import re
import time
from dataclasses import dataclass, field
import httpx
from fastapi import HTTPException
from .config import web_config

# Firebase verifies the submitted ID token before returning its owning account.
_LOOKUP = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup'
# Bound token input before decoding or making a remote request.
_MAX_TOKEN_LENGTH = 20000


@dataclass(frozen=True)
class Session:
    """Carry the verified owner and token to user-scoped cloud requests."""
    uid: str
    display_name: str
    token: str = field(repr=False)


def claims_of(token):
    """Read claims for extra checks after Firebase has verified the token."""
    try:
        parts = token.split('.')
        if len(parts) != 3:
            raise ValueError('Invalid token shape.')
        claims = json.loads(base64.urlsafe_b64decode(parts[1] + '=' * (-len(parts[1]) % 4)))
        if not isinstance(claims, dict):
            raise ValueError('Invalid claims shape.')
        return claims
    except (ValueError, UnicodeError):
        raise HTTPException(401, 'Sign in with Google again.') from None


async def verify_session(authorization):
    """Verify the token with Firebase, then bind the request to its account."""
    # Ignore missing or oversized credentials because no owner can be established.
    if not authorization or not authorization.startswith('Bearer ') or len(authorization) > _MAX_TOKEN_LENGTH:
        raise HTTPException(401, 'Sign in with Google to use your cloud account.')
    token = authorization[7:]
    config = web_config()
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.post(_LOOKUP, params={'key': config['apiKey']}, json={'idToken': token})
        if response.status_code in (400, 401, 403):
            raise HTTPException(401, 'Sign in with Google again.')
        response.raise_for_status()
        users = response.json().get('users', [])
        if len(users) != 1 or not isinstance(users[0], dict):
            raise ValueError('No single account returned.')
        user = users[0]
    except (httpx.HTTPError, ValueError, TypeError, AttributeError):
        raise HTTPException(503, 'Firebase could not verify your account. Try signing in again shortly.') from None

    # Check project, expiry and revocation against the verified account, never a request UID.
    claims = claims_of(token)
    uid = claims.get('sub')
    expiry, authenticated = claims.get('exp'), claims.get('auth_time')
    valid_times = all(type(value) in (int, float) and math.isfinite(value) for value in (expiry, authenticated))
    try:
        revoked_before = int(user.get('validSince', 0))
    except (ValueError, TypeError):
        raise HTTPException(401, 'Sign in with Google again.') from None
    if (not isinstance(uid, str) or not re.fullmatch(r'[A-Za-z0-9:_-]{1,128}', uid)
            or uid != user.get('localId') or user.get('disabled', False)
            or claims.get('aud') != config['projectId']
            or claims.get('iss') != f"https://securetoken.google.com/{config['projectId']}"
            or not valid_times or expiry <= time.time() or authenticated < revoked_before):
        raise HTTPException(401, 'Sign in with Google again.')
    name = user.get('displayName', '')
    return Session(uid, name[:100] if isinstance(name, str) else '', token)
