"""Hash and verify passwords with argon2id; a password is never stored, logged or returned."""
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

# The library's default argon2id settings; each hash records its own settings and salt.
_HASHER = PasswordHasher()
# A hash of a random password nobody knows, verified when an email has no account so both cases take equal work.
DUMMY_HASH = _HASHER.hash(secrets.token_urlsafe(16))


def hash_password(password):
    """Return a salted argon2id hash of this password."""
    return _HASHER.hash(password)


def verify_password(stored_hash, password):
    """Return whether this password matches the stored hash."""
    try:
        return _HASHER.verify(stored_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def needs_rehash(stored_hash):
    """Return whether this hash was made with settings older than the current ones."""
    return _HASHER.check_needs_rehash(stored_hash)
