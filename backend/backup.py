"""Account-scoped portable backups; restore is additive and idempotent."""
import hashlib
import json
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from .auth.sessions import current_user
from .auth.models import User
from .database import db_session
from sqlalchemy.orm import Session
from .common.models import identifier, now
from .notes.models import Note
from .notes.schemas import NoteInput
from .tasks.models import Task
from .tasks.schemas import TaskInput
from .affairs.models import Affair
from .affairs.schemas import AffairInput
from .affairs.sources import canonical_url
from .timetable.models import Course, TimetableSettings
from .timetable.schemas import CourseInput, SettingsInput
from .agent.models import Receipt, Profile
from .agent.schemas import ProfileData

router = APIRouter(prefix="/api/backup", tags=["backup"])
DB = Annotated[Session, Depends(db_session)]
Account = Annotated[User, Depends(current_user)]


class RestoredTask(TaskInput):
    completed: bool = False


@router.get("")
def export(db: DB, user: Account):
    def rows(model):
        return db.scalars(select(model).where(model.user_id == user.id)).all()
    settings = db.get(TimetableSettings, user.id)
    profile = db.get(Profile, user.id)
    return {"format": "qingjian-1", "exported_at": now(), "notes": [{"id": r.id, "title": r.title, "content": r.content} for r in rows(Note)], "tasks": [{"id": r.id, "title": r.title, "completed": r.completed, "due_date": r.due_date.isoformat() if r.due_date else None} for r in rows(Task)], "affairs": [{"id": r.id, **r.payload} for r in rows(Affair)], "courses": [{"id": r.id, **r.payload} for r in rows(Course)], "settings": {"week_one_monday": settings.week_one_monday.isoformat() if settings.week_one_monday else None, "total_weeks": settings.total_weeks} if settings else None, "profile": profile.payload if profile else None}


class Restore(BaseModel):
    archive: dict
    preview: bool = True


@router.post("/restore")
def restore(data: Restore, db: DB, user: Account):
    archive = data.archive
    raw = json.dumps(archive, sort_keys=True, ensure_ascii=False)
    if len(raw.encode()) > 30_000_000 or archive.get("format") != "qingjian-1":
        raise HTTPException(422, "备份格式不支持或超过30MB")
    fingerprint = hashlib.sha256(raw.encode()).hexdigest()
    receipt_id = "restore-" + fingerprint
    if db.get(Receipt, (user.id, receipt_id)):
        return {"restored": False, "message": "这份备份已经恢复，未重复导入"}
    schemas = {"notes": NoteInput, "tasks": RestoredTask, "affairs": AffairInput, "courses": CourseInput}
    prepared = {}
    try:
        for kind, schema in schemas.items():
            entries = archive.get(kind, [])
            if not isinstance(entries, list) or len(entries) > 10000:
                raise ValueError()
            prepared[kind] = [(entry["id"], schema.model_validate(entry)) for entry in entries]
            ids = [key for key, _ in prepared[kind]]
            if any(not isinstance(key, str) for key in ids) or len(set(ids)) != len(ids):
                raise ValueError()
        settings = SettingsInput.model_validate(archive["settings"]) if archive.get("settings") else None
        profile = ProfileData.model_validate(archive["profile"]) if archive.get("profile") else None
        note_ids = {key for key, _ in prepared["notes"]}
        affairs = {key: item for key, item in prepared["affairs"]}
        for _, item in prepared["affairs"]:
            if set(item.note_ids) - note_ids or item.source_information_id and (item.source_information_id not in affairs or affairs[item.source_information_id].kind != "information"):
                raise ValueError()
    except (ValidationError, ValueError, TypeError, KeyError):
        raise HTTPException(422, "备份包含无效字段或缺失关联，未写入任何数据") from None
    counts = {kind: len(items) for kind, items in prepared.items()}
    if data.preview:
        return {"preview": True, "counts": counts, "message": "新增恢复，不覆盖现有记录；相同链接通知复用；恢复的提醒设为已知晓，需手动重新安排。"}
    mapping = {kind: {key: identifier() for key, _ in items} for kind, items in prepared.items()}
    try:
        db.add(Receipt(user_id=user.id, request_id=receipt_id, fingerprint=fingerprint, result={"operation": "restore_backup"}))
        db.flush()
        existing = {canonical_url(r.payload.get("source_url", "")): r.id for r in db.scalars(select(Affair).where(Affair.user_id == user.id)) if r.payload.get("kind") == "information" and r.payload.get("source_url")}
        skip = set()
        for key, item in prepared["affairs"]:
            link = canonical_url(item.source_url)
            if item.kind == "information" and link:
                if link in existing:
                    mapping["affairs"][key] = existing[link]
                    skip.add(key)
                else:
                    existing[link] = mapping["affairs"][key]
        for key, item in prepared["notes"]:
            db.add(Note(id=mapping["notes"][key], user_id=user.id, **item.model_dump()))
        for key, item in prepared["tasks"]:
            db.add(Task(id=mapping["tasks"][key], user_id=user.id, **item.model_dump()))
        for key, item in prepared["courses"]:
            db.add(Course(id=mapping["courses"][key], user_id=user.id, payload=item.model_dump(mode="json")))
        for key, item in prepared["affairs"]:
            if key in skip:
                continue
            payload = item.model_dump(mode="json")
            payload["source_reviewed_version"] = 0
            payload["note_ids"] = [mapping["notes"][n] for n in item.note_ids]
            payload["source_information_id"] = mapping["affairs"].get(item.source_information_id)
            for reminder in payload["reminders"]:
                reminder["acknowledged"] = True
            payload["history"] = []
            payload["last_actor"] = "restore"
            source_key = hashlib.sha256(canonical_url(item.source_url).encode()).hexdigest() if item.kind == "information" and item.source_url else None
            db.add(Affair(id=mapping["affairs"][key], user_id=user.id, source_key=source_key, payload=payload))
        if settings and not db.get(TimetableSettings, user.id):
            db.add(TimetableSettings(user_id=user.id, **settings.model_dump(exclude={"version"})))
        if profile and not db.get(Profile, user.id):
            db.add(Profile(user_id=user.id, payload=profile.model_dump()))
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(409, "恢复遇到冲突，未写入数据，请重新检查") from None
    return {"restored": True, "counts": counts, "reused_notices": len(skip), "message": "恢复完成，请刷新页面；已保留现有记录，恢复的提醒需重新安排。"}
