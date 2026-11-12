"""Sign and read the session token that the browser holds in a cookie."""
import os
import secrets
import time

import jwt

# A session lasts 30 days, in seconds; the cookie and the token share this lifetime.
SESSION_SECONDS = 30 * 24 * 60 * 60
# HS256 needs a secret of at least 256 bits; 32 characters is the shortest setting accepted.
MINIMUM_SECRET_LENGTH = 32
# The only signing algorithm issued or accepted, so a token cannot choose a weaker one.
_ALGORITHM = 'HS256'
# A random secret for a laptop with no AUTH_SECRET; it changes on restart, which ends local sessions.
_LOCAL_SECRET = secrets.token_urlsafe(48)


def read_secret():
    """
    Return the signing secret, or None when a hosted service has none configured.

    A laptop falls back to a per-process random secret so local development
    works. A hosted service must not, because a restart would sign everyone out
    and several instances would not accept each other's sessions.
    """
    secret = os.getenv('AUTH_SECRET', '')
    if not secret:
        return None if os.getenv('RENDER') else _LOCAL_SECRET
    # Ignore a short secret because it could be guessed and used to forge any session.
    if len(secret) < MINIMUM_SECRET_LENGTH:
        raise ValueError(f'Set AUTH_SECRET to at least {MINIMUM_SECRET_LENGTH} random characters.')
    return secret


def issue_token(account_id, secret):
    """Return a signed token naming this account, valid for one session lifetime."""
    issued_at = int(time.time())
    claims = {'sub': account_id, 'iat': issued_at, 'exp': issued_at + SESSION_SECONDS}
    return jwt.encode(claims, secret, algorithm=_ALGORITHM)


def read_account_id(token, secret):
    """Return the account a token names, or None when it is missing, forged, altered or expired."""
    if not token:
        return None
    try:
        claims = jwt.decode(token, secret, algorithms=[_ALGORITHM], options={'require': ['exp', 'sub']})
    except jwt.InvalidTokenError:
        return None
    return claims['sub']
