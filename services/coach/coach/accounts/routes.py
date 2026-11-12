"""Serve sign-up, sign-in, session and sign-out for email and password accounts."""
import re

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import Field

from ..http_policy import check_json, is_local_host
from ..models import StrictModel
from . import store
from .limits import AttemptLimiter
from .passwords import DUMMY_HASH, hash_password, needs_rehash, verify_password
from .tokens import SESSION_SECONDS, issue_token, read_account_id, read_secret

# The cookie that carries the session token; scripts on the page cannot read it.
SESSION_COOKIE = 'hc_session'
# Every account route lives under this path, and the cookie is sent only to /api.
ACCOUNTS_PATH = '/api/auth/'
# The longest address the email standard allows.
MAXIMUM_EMAIL_LENGTH = 254
# One @ with text before it and a dotted domain after it, and no spaces anywhere.
_EMAIL_SHAPE = re.compile(r'[^@\s]+@[^@\s.]+(\.[^@\s.]+)+')
# Length is the only password rule: long enough to resist guessing, short enough to bound hashing work.
MINIMUM_PASSWORD_LENGTH, MAXIMUM_PASSWORD_LENGTH = 10, 128
# Five failed sign-ins for one visitor and email inside 15 minutes lock that pair out.
SIGNIN_FAILURES = AttemptLimiter(5, 15 * 60)
# Ten sign-ups from one visitor inside an hour, so one address cannot fill the database.
SIGNUPS = AttemptLimiter(10, 60 * 60)
# The same reply for either limiter, giving no detail about what was counted.
TOO_MANY_ATTEMPTS = 'Too many attempts. Wait a few minutes and try again.'
router = APIRouter(prefix='/api/auth')


class Credentials(StrictModel):
    """Accept only an email and a password; the caps bound the body before the real rules run."""
    email: str = Field(max_length=1024)
    password: str = Field(max_length=1024)


async def mark_accounts_no_store(request, call_next):
    """Return the next handler's response, marked uncacheable when it is for an account route."""
    response = await call_next(request)
    if request.url.path.startswith(ACCOUNTS_PATH):
        response.headers['Cache-Control'] = 'no-store'
    return response


def normalised_email(email):
    """Return the trimmed, lower-case email, or refuse one that is not shaped like an address."""
    email = email.strip().lower()
    if len(email) > MAXIMUM_EMAIL_LENGTH or _EMAIL_SHAPE.fullmatch(email) is None:
        raise HTTPException(422, 'Enter an email address such as name@example.org.')
    return email


def check_new_password(password):
    """Refuse a new password outside the allowed length, saying which limit it missed."""
    if len(password) < MINIMUM_PASSWORD_LENGTH:
        raise HTTPException(422, f'Use a password of at least {MINIMUM_PASSWORD_LENGTH} characters.')
    if len(password) > MAXIMUM_PASSWORD_LENGTH:
        raise HTTPException(422, f'Use a password of at most {MAXIMUM_PASSWORD_LENGTH} characters.')


def session_secret():
    """Return the signing secret, or answer unavailable when a hosted service has none."""
    secret = read_secret()
    if secret is None:
        raise HTTPException(503, 'Sign-in is not set up on this service yet.')
    return secret


def visitor_address(request):
    """Return the network address a request came from, for counting attempts."""
    return request.client.host if request.client else 'unknown'


def cookie_settings(request):
    """
    Return the cookie attributes shared by setting and clearing the session.

    Secure is left off only on the laptop, where the preview is served over
    plain HTTP and a Secure cookie would never be sent back.
    """
    return {'path': '/api', 'httponly': True, 'samesite': 'strict', 'secure': not is_local_host(request.url.hostname)}


def signed_in(account, request, secret, status_code):
    """Return the account's public fields with a fresh session cookie; the token stays out of the body."""
    response = JSONResponse({'id': account['id'], 'email': account['email']}, status_code=status_code)
    response.set_cookie(SESSION_COOKIE, issue_token(account['id'], secret), max_age=SESSION_SECONDS, **cookie_settings(request))
    return response


@router.post('/signup', dependencies=[Depends(check_json)])
def sign_up(request: Request, item: Credentials):
    """Create an account and start its session; hashing runs on a worker thread, not the event loop."""
    # Check the typed values before any counting or hashing.
    email = normalised_email(item.email)
    check_new_password(item.password)
    secret = session_secret()

    # Count this visitor's sign-ups because each one costs a hash and a stored row.
    visitor = visitor_address(request)
    if SIGNUPS.is_blocked(visitor):
        raise HTTPException(429, TOO_MANY_ATTEMPTS)
    SIGNUPS.record(visitor)

    try:
        account = store.create_account(email, hash_password(item.password))
    except store.DuplicateEmail:
        raise HTTPException(409, 'An account with this email already exists. Sign in instead.') from None
    return signed_in(account, request, secret, 201)


@router.post('/signin', dependencies=[Depends(check_json)])
def sign_in(request: Request, item: Credentials):
    """Start a session for a matching email and password, with one reply for every mismatch."""
    email = normalised_email(item.email)
    secret = session_secret()

    # Ignore even a correct password while this visitor and email are locked out, because guessing must not pay off.
    attempt = (visitor_address(request), email)
    if SIGNIN_FAILURES.is_blocked(attempt):
        raise HTTPException(429, TOO_MANY_ATTEMPTS)

    # Verify against a dummy hash when there is no account, so both cases take the same time.
    account = store.find_by_email(email)
    stored_hash = account['password_hash'] if account else DUMMY_HASH
    matches = verify_password(stored_hash, item.password)
    if account is None or not matches:
        SIGNIN_FAILURES.record(attempt)
        raise HTTPException(401, 'Email or password is incorrect.')

    # Forgive earlier failures, and upgrade a hash made with older settings while the password is known.
    SIGNIN_FAILURES.reset(attempt)
    if needs_rehash(stored_hash):
        store.replace_password_hash(account['id'], hash_password(item.password))
    return signed_in(account, request, secret, 200)


@router.get('/session')
def session(request: Request):
    """Return the signed-in account when the cookie's token is valid and the account still exists."""
    account_id = read_account_id(request.cookies.get(SESSION_COOKIE), session_secret())
    account = store.find_by_id(account_id) if account_id else None
    if account is None:
        raise HTTPException(401, 'Sign in to continue.')
    return {'id': account['id'], 'email': account['email']}


@router.post('/signout', status_code=204, dependencies=[Depends(check_json)])
def sign_out(request: Request):
    """Clear the session cookie; this succeeds whether or not anyone was signed in."""
    response = Response(status_code=204)
    response.delete_cookie(SESSION_COOKIE, **cookie_settings(request))
    return response
