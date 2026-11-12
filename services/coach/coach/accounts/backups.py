"""Store one diary backup per account, beside the accounts in the same database."""
from datetime import datetime, timezone

from sqlalchemy import Column, Integer, Table, Text, delete, insert, select, update
from sqlalchemy.exc import IntegrityError

from .store import _METADATA, engine

# One row per account: its latest backup as the JSON text the app sent, an ISO-8601 UTC time and the size in bytes.
ACCOUNT_BACKUPS = Table(
    'account_backups', _METADATA,
    Column('account_id', Text, primary_key=True),
    Column('saved_at', Text, nullable=False),
    Column('size_bytes', Integer, nullable=False),
    Column('content', Text, nullable=False),
)
# The columns that describe a backup without carrying the diary itself.
_STATUS_COLUMNS = (ACCOUNT_BACKUPS.c.saved_at, ACCOUNT_BACKUPS.c.size_bytes)


def save_backup(account_id, content):
    """
    Store this JSON text as the account's only backup and return when it was saved and its size.

    An update is tried first and an insert second, so a second save replaces
    the first instead of adding a row.
    """
    values = {'saved_at': datetime.now(timezone.utc).isoformat(), 'size_bytes': len(content.encode('utf-8')), 'content': content}
    replace = update(ACCOUNT_BACKUPS).where(ACCOUNT_BACKUPS.c.account_id == account_id).values(**values)

    # Replace the earlier copy when there is one.
    with engine().begin() as connection:
        replaced = connection.execute(replace).rowcount > 0
    if replaced:
        return _status(values)

    # Add the first copy; the primary key decides a race between two first saves, and the loser replaces instead.
    try:
        with engine().begin() as connection:
            connection.execute(insert(ACCOUNT_BACKUPS).values(account_id=account_id, **values))
    except IntegrityError:
        with engine().begin() as connection:
            connection.execute(replace)
    return _status(values)


def read_backup_status(account_id):
    """Return when this account's backup was saved and its size, or None when it has none."""
    row = _find(account_id, _STATUS_COLUMNS)
    return _status(row) if row else None


def read_backup(account_id):
    """Return this account's backup status with its JSON text under 'content', or None when it has none."""
    row = _find(account_id, (*_STATUS_COLUMNS, ACCOUNT_BACKUPS.c.content))
    return {**_status(row), 'content': row['content']} if row else None


def delete_backup(account_id):
    """Remove this account's backup; removing one that is not there changes nothing."""
    with engine().begin() as connection:
        connection.execute(delete(ACCOUNT_BACKUPS).where(ACCOUNT_BACKUPS.c.account_id == account_id))


def _find(account_id, columns):
    """Return these columns of the account's backup row as a dictionary, or None."""
    with engine().connect() as connection:
        row = connection.execute(select(*columns).where(ACCOUNT_BACKUPS.c.account_id == account_id)).mappings().first()
    return dict(row) if row else None


def _status(row):
    """Return the saved time and size of a row under the names the app reads."""
    return {'savedAt': row['saved_at'], 'sizeBytes': row['size_bytes']}
