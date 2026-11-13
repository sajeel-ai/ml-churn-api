import hashlib
import hmac
import re
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import settings

_hasher: PasswordHasher | None = None


def _get_hasher() -> PasswordHasher:
    global _hasher
    if _hasher is None:
        _hasher = PasswordHasher(
            time_cost=settings.argon2_time_cost,
            memory_cost=settings.argon2_memory_cost,
            parallelism=settings.argon2_parallelism,
        )
    return _hasher


def hash_password(password: str) -> str:
    return _get_hasher().hash(password)


# Verified against a dummy hash for unknown emails so response time does not
# reveal whether an account exists.
_DUMMY_HASH: str | None = None


def verify_password(password: str, password_hash: str | None) -> bool:
    global _DUMMY_HASH
    if password_hash is None:
        if _DUMMY_HASH is None:
            _DUMMY_HASH = hash_password("dummy-password-for-timing")
        try:
            _get_hasher().verify(_DUMMY_HASH, password)
        except Exception:
            pass
        return False
    try:
        return _get_hasher().verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    return _get_hasher().check_needs_rehash(password_hash)


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


COMMON_PASSWORDS = {
    "password", "password1", "password123", "123456789", "1234567890", "qwerty123",
    "qwertyuiop", "iloveyou1", "admin12345", "welcome123", "letmein123", "abc123456",
    "11111111", "12345678", "123123123", "passw0rd123", "changeme123",
}


def password_problems(password: str, email: str = "", name: str = "") -> list[str]:
    """Return a list of human-readable problems (empty list = acceptable)."""
    problems = []
    if len(password) < 10:
        problems.append("Use at least 10 characters.")
    if len(password) > 128:
        problems.append("Use at most 128 characters.")
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        problems.append("Include at least one letter and one number.")
    def norm(x: str) -> str:
        return re.sub(r"[^a-z0-9]", "", x.lower())

    low = password.lower()
    if low in COMMON_PASSWORDS:
        problems.append("This password is too common.")
    local = norm(email.split("@")[0]) if email else ""
    if len(local) >= 4 and local in norm(password):
        problems.append("Do not include your email address in the password.")
    full_name = norm(name)
    if len(full_name) >= 4 and full_name in norm(password):
        problems.append("Do not include your name in the password.")
    return problems
