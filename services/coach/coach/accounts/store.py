"""Store accounts in Postgres when hosted, or in a local SQLite file on the laptop."""
import os
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import Column, MetaData, Table, Text, create_engine, insert, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.pool import NullPool

# The laptop database, kept out of Git beside the service.
_LOCAL_DATABASE = Path(__file__).resolve().parents[2] / '.data' / 'accounts.sqlite'
# The Postgres driver this service installs; Render's connection string does not name one.
_POSTGRES_DRIVER = 'postgresql+psycopg://'
_METADATA = MetaData()
# One row per person: a random id, the normalised email, the argon2id hash and an ISO-8601 UTC time.
ACCOUNTS = Table(
    'accounts', _METADATA,
    Column('id', Text, primary_key=True),
    Column('email', Text, unique=True, nullable=False),
    Column('password_hash', Text, nullable=False),
    Column('created_at', Text, nullable=False),
)
# The one open engine, keyed by its URL so a changed setting opens a new one.
_OPEN = {}
# Route handlers run on several threads, and only one of them may create the table.
_LOCK = threading.Lock()


class DuplicateEmail(Exception):
    """Report that an account with this email already exists."""


def driver_url(url):
    """Return a database URL that names the installed Postgres driver."""
    for prefix in ('postgres://', 'postgresql://'):
        if url.startswith(prefix):
            return _POSTGRES_DRIVER + url[len(prefix):]
    return url


def _database_url():
    """Return the configured database URL, or the local SQLite file when none is set."""
    configured = os.getenv('DATABASE_URL', '').strip()
    if configured:
        return driver_url(configured)
    _LOCAL_DATABASE.parent.mkdir(exist_ok=True)
    return f'sqlite:///{_LOCAL_DATABASE.as_posix()}'


def _open_engine(url):
    """Return a new engine for this URL with the accounts table created."""
    # SQLite reopens its file for each use; Postgres keeps a pool and checks a connection before reusing it.
    if url.startswith('sqlite'):
        opened = create_engine(url, poolclass=NullPool)
    else:
        opened = create_engine(url, pool_pre_ping=True)
    _METADATA.create_all(opened)
    return opened


def engine():
    """
    Return the engine for the configured database, creating the table on first use.

    The setting is read on each call, so the service starts without a database
    and a test can point at its own temporary file.
    """
    url = _database_url()
    with _LOCK:
        if url not in _OPEN:
            _OPEN.clear()
            _OPEN[url] = _open_engine(url)
        return _OPEN[url]


def create_account(email, password_hash):
    """
    Store a new account and return its id and email.

    The unique email column decides a race between two sign-ups, so the loser
    is reported as a duplicate instead of both being stored.
    """
    account = {'id': str(uuid.uuid4()), 'email': email}
    created_at = datetime.now(timezone.utc).isoformat()
    try:
        with engine().begin() as connection:
            connection.execute(insert(ACCOUNTS).values(**account, password_hash=password_hash, created_at=created_at))
    except IntegrityError:
        raise DuplicateEmail(email) from None
    return account


def _find(condition):
    """Return the one account row matching this condition as a dictionary, or None."""
    with engine().connect() as connection:
        row = connection.execute(select(ACCOUNTS).where(condition)).mappings().first()
    return dict(row) if row else None


def find_by_email(email):
    """Return the account with this normalised email, or None."""
    return _find(ACCOUNTS.c.email == email)


def find_by_id(account_id):
    """Return the account with this id, or None."""
    return _find(ACCOUNTS.c.id == account_id)


def replace_password_hash(account_id, password_hash):
    """Store a newer hash of the same password for this account."""
    with engine().begin() as connection:
        connection.execute(update(ACCOUNTS).where(ACCOUNTS.c.id == account_id).values(password_hash=password_hash))
