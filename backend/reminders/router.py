import hashlib
import json
import time
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth.models import User
from ..auth.sessions import current_user
from ..affairs.models import Affair
from ..common.models import identifier
from ..database import db_session
from .models import Delivery

router = APIRouter(prefix="/api/reminders", tags=["reminders"])
DB = Annotated[Session, Depends(db_session)]
Account = Annotated[User, Depends(current_user)]


class Claim(BaseModel):
    device_id: str = Field(min_length=8, max_length=100, pattern=r"^[a-zA-Z0-9_-]+$")


class Ack(Claim):
    lease_token: str
    success: bool
    error: str = Field(default="", max_length=500)


@router.post("/claim")
def claim(data: Claim, db: DB, user: Account):
    now = int(time.time())
    result = []
    for affair in db.scalars(select(Affair).where(Affair.user_id == user.id)):
        if affair.payload.get("status") in {"completed", "cancelled"}:
            continue
        for reminder in affair.payload.get("reminders", []):
            if reminder.get("acknowledged"):
                continue
            at = datetime.fromisoformat(reminder["at"].replace("Z", "+00:00"))
            if at.timestamp() > now:
                continue
            repeat = reminder.get("repeat_minutes", 0)
            occurrence = min(int((now - at.timestamp()) // (repeat * 60)), reminder.get("repeat_limit", 3) - 1) if repeat else 0
            parts = [user.id, data.device_id, affair.id, reminder["at"], reminder.get("label", "提醒")]
            if occurrence:
                parts.append(occurrence)
            fingerprint = json.dumps(parts, ensure_ascii=False)
            delivery_id = hashlib.sha256(fingerprint.encode()).hexdigest()
            row = db.get(Delivery, delivery_id)
            if not row:
                try:
                    with db.begin_nested():
                        row = Delivery(id=delivery_id, user_id=user.id, device_id=data.device_id, affair_id=affair.id, label=reminder.get("label", "提醒"), updated_at=now)
                        db.add(row)
                        db.flush()
                except IntegrityError:
                    row = db.get(Delivery, delivery_id)
            token = identifier()
            changed = db.execute(update(Delivery).where(Delivery.id == delivery_id, Delivery.state != "sent", Delivery.next_attempt <= now).values(state="sending", attempts=Delivery.attempts + 1, lease_token=token, next_attempt=now + 120, updated_at=now))
            if changed.rowcount:
                result.append({"id": delivery_id, "lease_token": token, "affair_id": affair.id, "title": affair.payload["title"], "body": reminder.get("label", "提醒") + " · " + reminder["at"] + (" · 截止 " + affair.payload["ends_at"] if affair.payload.get("ends_at") else "") + "。请从托盘打开青笺查看。"})
            if len(result) >= 3:
                break
        if len(result) >= 3:
            break
    db.commit()
    return {"deliveries": result}


@router.post("/{delivery_id}/ack")
def acknowledge(delivery_id: str, data: Ack, db: DB, user: Account):
    row = db.get(Delivery, delivery_id)
    if not row or row.user_id != user.id or row.device_id != data.device_id:
        raise HTTPException(404, "发送记录不存在")
    now = int(time.time())
    changed = db.execute(update(Delivery).where(Delivery.id == delivery_id, Delivery.lease_token == data.lease_token, Delivery.state == "sending").values(state="sent" if data.success else "failed", error="" if data.success else data.error, updated_at=now, next_attempt=now + min(3600, 30 * 2 ** min(row.attempts, 6))))
    if not changed.rowcount:
        raise HTTPException(409, "发送回执已过期")
    db.commit()
    return {"recorded": True}


@router.get("/history")
def history(db: DB, user: Account):
    rows = db.scalars(select(Delivery).where(Delivery.user_id == user.id).order_by(Delivery.updated_at.desc()).limit(20)).all()
    return [{"affair_id": row.affair_id, "device_id": row.device_id, "label": row.label, "state": row.state, "attempts": row.attempts, "error": row.error, "updated_at": row.updated_at} for row in rows]

