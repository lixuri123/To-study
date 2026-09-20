from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..auth.models import User
from ..common.models import now
from ..common.ownership import owned
from ..notes.models import Note
from .models import Affair
from .schemas import AffairInput, AffairUpdate
from .sources import canonical_url
import hashlib
from sqlalchemy.exc import IntegrityError

DB = Session
Account = User


def output(item):
    return {
        **item.payload,
        "id": item.id,
        "version": item.version,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


def check_notes(db, user, data, previous=()):
    if data.source_information_id:
        source = owned(db, Affair, data.source_information_id, user.id)
        if source.payload.get("kind") != "information":
            raise HTTPException(422, "来源必须是信息记录")
    for note_id in set(data.note_ids) - set(previous):
        owned(db, Note, note_id, user.id)


def listing(db: DB, user: Account):
    return [
        output(item)
        for item in db.scalars(
            select(Affair)
            .where(Affair.user_id == user.id)
            .order_by(Affair.created_at.desc())
        ).all()
    ]


def create(data: AffairInput, db: DB, user: Account, commit=True, actor="user"):
    check_notes(db, user, data)
    if data.kind == "information" and data.source_url:
        key = canonical_url(data.source_url)
        for existing in db.scalars(select(Affair).where(Affair.user_id == user.id)):
            if existing.payload.get("kind") == "information" and canonical_url(existing.payload.get("source_url", "")) == key:
                return {**output(existing), "reused": True, "message": "链接已存在，已复用原记录；如内容变化请按当前版本更新"}
    item = Affair(
        user_id=user.id, source_key=hashlib.sha256(canonical_url(data.source_url).encode()).hexdigest() if data.kind == "information" and data.source_url else None, payload={**data.model_dump(mode="json"), "history": []}
    )
    db.add(item)
    item.payload = {**item.payload, "last_actor": actor}
    try:
        if commit:
            db.commit()
        else:
            db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "链接已被同时保存，请刷新并复用已有通知") from None
    db.refresh(item)
    return output(item)


def edit(item_id: str, data: AffairUpdate, db: DB, user: Account, commit=True, actor="user"):
    item = owned(db, Affair, item_id, user.id)
    check_notes(db, user, data, item.payload.get("note_ids", []))
    payload = data.model_dump(mode="json", exclude={"version"})
    for field in ("pending_questions", "source_reviewed_version", "monitor"):
        if field not in data.model_fields_set and field in item.payload:
            payload[field] = item.payload[field]
    previous_monitor = item.payload.get("monitor")
    monitor = payload.get("monitor")
    if previous_monitor and monitor and monitor.get("state") in {"failed", "partial"}:
        monitor["last_success_at"] = previous_monitor.get("last_success_at", "")
        monitor["seen_links"] = previous_monitor.get("seen_links", []) if monitor["state"] == "failed" else list(dict.fromkeys([*previous_monitor.get("seen_links", []), *monitor.get("seen_links", [])]))[-500:]
    for reminder in payload["reminders"]:
        anchor = reminder.get("anchor", "custom")
        if anchor != "custom" and item.payload.get(anchor) != payload[anchor]:
            reminder["acknowledged"] = False
    history = list(item.payload.get("history", []))
    changes = {
        key: {"before": item.payload.get(key), "after": payload[key]}
        for key in ("published_at", "starts_at", "ends_at")
        if item.payload.get(key) != payload[key]
    }
    if changes:
        history.append({"at": now(), "changes": changes})
    payload["history"] = history
    # Capture diagnostics are managed by the dedicated Agent operation.
    if "capture" in item.payload:
        payload["capture"] = item.payload["capture"]
    revisions = list(item.payload.get("source_revisions", []))
    source_fields = ("title", "summary", "original", "published_at", "starts_at", "ends_at")
    content_changed = item.payload.get("kind") == "information" and any(payload.get(key) != item.payload.get(key) for key in source_fields)
    if content_changed:
        revisions.append({"at": now(), "version": item.version, "before": {key: item.payload.get(key, "") for key in source_fields}, "after": {key: payload.get(key, "") for key in source_fields}})
    payload["source_revisions"] = revisions[-20:]
    payload["source_content_version"] = item.version + 1 if content_changed else item.payload.get("source_content_version", 0)
    payload["last_actor"] = actor
    source_key = item.source_key
    if data.source_url != item.payload.get("source_url") or data.kind != item.payload.get("kind"):
        source_key = hashlib.sha256(canonical_url(data.source_url).encode()).hexdigest() if data.kind == "information" and data.source_url else None
        if source_key and db.scalar(select(Affair.id).where(Affair.user_id == user.id, Affair.source_key == source_key, Affair.id != item_id)):
            raise HTTPException(409, "该链接已有通知，请使用原记录")
    result = db.execute(
        update(Affair)
        .where(
            Affair.id == item_id,
            Affair.user_id == user.id,
            Affair.version == data.version,
        )
        .values(payload=payload, source_key=source_key, version=data.version + 1, updated_at=now())
    )
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(409, "内容已更新，请刷新后重新编辑")
    if commit:
        db.commit()
    else:
        db.flush()
    db.refresh(item)
    return output(item)
