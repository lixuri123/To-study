import time

from fastapi import HTTPException, Request
from sqlalchemy import case, delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from .models import AuthRateLimit
from .security import digest

WINDOW_SECONDS = 300
ACCOUNT_LIMIT = 5
IP_LIMIT = 30


def throttle(db: Session, request: Request, action: str, username: str):
    """Atomic database counters shared across workers; never trust forwarded IP headers here."""
    now = int(time.time())
    ip = request.client.host if request.client else "unknown"
    insert = sqlite_insert if db.bind.dialect.name == "sqlite" else pg_insert
    table = AuthRateLimit
    db.execute(delete(table).where(table.window_started <= now - WINDOW_SECONDS))
    retry_after = 0
    for category, value, limit in [
        ("ip", ip, IP_LIMIT),
        ("account", username.lower(), ACCOUNT_LIMIT),
    ]:
        key = digest(f"{action}:{category}:{value}")
        expired = table.window_started <= now - WINDOW_SECONDS
        statement = insert(table).values(key=key, window_started=now, attempts=1)
        statement = statement.on_conflict_do_update(
            index_elements=[table.key],
            set_={
                "window_started": case((expired, now), else_=table.window_started),
                "attempts": case((expired, 1), else_=table.attempts + 1),
            },
        ).returning(table.attempts, table.window_started)
        attempts, started = db.execute(statement).one()
        if attempts > limit:
            retry_after = max(retry_after, started + WINDOW_SECONDS - now)
    db.commit()
    if retry_after:
        raise HTTPException(
            429, "尝试过于频繁，请稍后重试。", headers={"Retry-After": str(retry_after)}
        )
