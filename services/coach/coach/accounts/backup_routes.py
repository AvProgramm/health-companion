"""
Serve saving, reading and deleting the signed-in account's diary backup.

The backup is opaque here: it is checked to be a JSON object, stored and
returned, and never interpreted, logged or sent to a model.
"""
import json

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from ..http_policy import check_json
from . import backups
from .routes import current_account

# The largest request body accepted, 5 MB; a text diary of several years fits well inside it.
MAXIMUM_BACKUP_BYTES = 5 * 1024 * 1024
# Every reply here concerns one person's diary, so no browser or proxy may keep a copy.
NO_STORE = {'Cache-Control': 'no-store'}
# What an oversize save says, naming the limit and the way out that still works.
TOO_LARGE = 'This backup is larger than the 5 MB an account can hold. Download a backup file instead.'
# What a save says when the body is not exactly one backup object.
NOT_A_BACKUP = 'Send only the backup this app exported.'
# What a read says when nothing was saved; the app shows this as a state, not a fault.
NO_BACKUP = 'No backup is saved for this account yet.'
router = APIRouter(prefix='/api/account/backup')


def refusal(status_code, detail):
    """Return an uncacheable error reply with a sentence the person can act on."""
    return HTTPException(status_code, detail, headers=NO_STORE)


def signed_in_account_id(request: Request):
    """
    Return the id of the account the session cookie names, or refuse a visitor without one.

    This is the only place an account id comes from, so a body can never choose
    whose backup is read or written.
    """
    account = current_account(request)
    # Ignore a missing, forged or expired token, or one for an account that no longer exists, because nothing may be stored for it.
    if account is None:
        raise refusal(401, 'Sign in to continue.')
    return account['id']


def check_declared_length(request):
    """Refuse a body whose declared length is over the limit, before any of it is read."""
    declared = request.headers.get('content-length', '')
    if declared.isdigit() and int(declared) > MAXIMUM_BACKUP_BYTES:
        raise refusal(413, TOO_LARGE)


async def read_limited_body(request):
    """
    Return the request body, refusing it as soon as more than the limit has arrived.

    The declared length is only a claim, so the bytes are counted as they come in
    and an oversize body is never held in full.
    """
    received = bytearray()
    async for chunk in request.stream():
        received.extend(chunk)
        if len(received) > MAXIMUM_BACKUP_BYTES:
            raise refusal(413, TOO_LARGE)
    return bytes(received)


def refuse_constant(name):
    """Refuse NaN and Infinity, which are not JSON and could not be sent back to the app."""
    raise ValueError(name)


def backup_text(body):
    """
    Return the backup inside a request body as compact JSON text, or refuse a body of another shape.

    The body must be an object with the one field 'backup', itself an object.
    """
    # Ignore unreadable or too deeply nested JSON because it cannot be a backup.
    try:
        parsed = json.loads(body, parse_constant=refuse_constant)
    except (ValueError, RecursionError):
        raise refusal(422, NOT_A_BACKUP) from None

    # Ignore extra fields because the account must come from the session alone.
    if not isinstance(parsed, dict) or set(parsed) != {'backup'} or not isinstance(parsed['backup'], dict):
        raise refusal(422, NOT_A_BACKUP)
    return json.dumps(parsed['backup'], separators=(',', ':'))


@router.put('', dependencies=[Depends(check_json)])
async def save(request: Request, account_id: str = Depends(signed_in_account_id)):
    """Store the sent backup as this account's only copy and return when it was saved and its size."""
    # Check the size before parsing, first as declared and then as received.
    check_declared_length(request)
    content = backup_text(await read_limited_body(request))

    # Write on a worker thread because the database call would block every other request.
    status = await run_in_threadpool(backups.save_backup, account_id, content)
    return JSONResponse(status, headers=NO_STORE)


@router.get('')
def load(account_id: str = Depends(signed_in_account_id)):
    """Return this account's backup with when it was saved and its size."""
    found = backups.read_backup(account_id)
    if found is None:
        raise refusal(404, NO_BACKUP)
    content = found.pop('content')
    return JSONResponse({**found, 'backup': json.loads(content)}, headers=NO_STORE)


@router.get('/status')
def status(account_id: str = Depends(signed_in_account_id)):
    """Return when this account's backup was saved and its size, without the diary."""
    found = backups.read_backup_status(account_id)
    if found is None:
        raise refusal(404, NO_BACKUP)
    return JSONResponse(found, headers=NO_STORE)


@router.delete('', status_code=204)
def remove(account_id: str = Depends(signed_in_account_id)):
    """Remove this account's backup; this succeeds whether or not one was saved."""
    backups.delete_backup(account_id)
    return Response(status_code=204, headers=NO_STORE)
