import hashlib
import secrets

from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from .models import SessionToken

passwords = PasswordHash.recommended()
DUMMY_HASH = passwords.hash("invalid-account-timing-placeholder")


def digest(token: str):
    return hashlib.sha256(token.encode()).hexdigest()


def issue_token(db: Session, user_id: str):
    token = secrets.token_urlsafe(32)
    db.add(SessionToken(token_hash=digest(token), user_id=user_id, expires_at=0))
    # The caller owns the transaction so account + session commit atomically.
    return token
