import hashlib
import json

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from ..affairs import service as affairs
from ..affairs.models import Affair
from ..affairs.schemas import AffairInput, AffairUpdate, Reminder, CaptureAttempt
from ..common.models import now
from ..common.ownership import owned
from ..notes.models import Note
from ..notes.schemas import NoteInput, NoteOutput
from ..tasks.models import Task
from ..tasks.schemas import TaskOutput
from .models import Profile, Receipt
from .schemas import ProfileData
from .undo import before_command, snapshot


def profile(db, user):
    row = db.get(Profile, user.id)
    return {
        "user_id": user.id,
        "username": user.username,
        "version": row.version if row else 0,
        "data": row.payload if row else ProfileData().model_dump(),
    }


def read(db, user, kind, record_id):
    if kind == "note":
        return NoteOutput.model_validate(
            owned(db, Note, record_id, user.id)
        ).model_dump(mode="json")
    if kind == "task":
        return TaskOutput.model_validate(
            owned(db, Task, record_id, user.id)
        ).model_dump(mode="json")
    row = owned(db, Affair, record_id, user.id)
    result = affairs.output(row)
    # Binary contents aren't useful model context; originals remain in the app.
    result["attachments"] = [
        {"name": item["name"]} for item in result.get("attachments", [])
    ]
    return result


def search(db, user, query, limit, offset):
    # Return compact summaries without exposing binary attachments to the model.
    results = []
    needle = query.casefold()
    for row in db.scalars(select(Note).where(Note.user_id == user.id)):
        if needle in f"{row.title} {row.content}".casefold():
            results.append(
                {
                    "record_type": "note",
                    "id": row.id,
                    "title": row.title,
                    "summary": row.content[:240],
                    "updated_at": row.updated_at,
                }
            )
    for row in db.scalars(select(Task).where(Task.user_id == user.id)):
        if needle in row.title.casefold():
            results.append(
                {
                    "record_type": "task",
                    "id": row.id,
                    "title": row.title,
                    "completed": row.completed,
                    "due_date": row.due_date.isoformat() if row.due_date else None,
                    "updated_at": row.created_at,
                }
            )
    for row in db.scalars(select(Affair).where(Affair.user_id == user.id)):
        p = row.payload
        if (
            needle
            in f"{p['title']} {p.get('summary', '')} {p.get('original', '')} {p.get('source_name', '')}".casefold()
        ):
            results.append(
                {
                    "record_type": "affair",
                    "kind": p["kind"],
                    "id": row.id,
                    "title": p["title"],
                    "summary": p.get("summary", "")[:240],
                    "status": p["status"],
                    "ends_at": p.get("ends_at"),
                    "version": row.version,
                    "updated_at": row.updated_at,
                }
            )
    results.sort(key=lambda r: (r["updated_at"], r["id"]), reverse=True)
    return {
        "items": results[offset : offset + limit],
        "total": len(results),
        "next_offset": offset + limit if offset + limit < len(results) else None,
    }


def dispatch(db, user, operation, args):
    if operation in {"capture_information", "create_affair"}:
        payload = dict(args)
        payload["kind"] = (
            "information" if operation == "capture_information" else "affair"
        )
        payload.setdefault(
            "status", "inbox" if operation == "capture_information" else "pending"
        )
        result = affairs.create(
            AffairInput.model_validate(payload), db, user, commit=False, actor="agent"
        )
        return {
            "record_type": "affair",
            "id": result["id"],
            "version": result["version"],
            "title": result["title"],
            "reused": result.get("reused", False),
            "message": result.get("message", ""),
        }
    if operation == "create_note":
        data = NoteInput.model_validate(args)
        note = Note(user_id=user.id, **data.model_dump())
        db.add(note)
        db.flush()
        return {
            "record_type": "note",
            **NoteOutput.model_validate(note).model_dump(mode="json"),
        }
    if operation == "update_profile":
        data = ProfileData.model_validate(args["data"])
        expected = args["expected_version"]
        if expected == 0:
            if db.get(Profile, user.id):
                raise HTTPException(409, "个人资料已存在，请重新读取版本")
            db.add(Profile(user_id=user.id, payload=data.model_dump(), version=1))
        else:
            changed = db.execute(
                update(Profile)
                .where(Profile.user_id == user.id, Profile.version == expected)
                .values(payload=data.model_dump(), version=expected + 1)
            )
            if changed.rowcount != 1:
                raise HTTPException(409, "个人资料已更新，请重新读取")
        db.flush()
        db.expire_all()
        return profile(db, user)
    item = owned(db, Affair, args["affair_id"], user.id)
    expected = args["expected_version"]
    if expected != item.version:
        raise HTTPException(409, "事务已更新，请重新读取后决定修改")
    values = dict(item.payload)
    if operation == "record_capture_attempt":
        if values.get("kind") != "information":
            raise HTTPException(422, "采集结果必须关联信息记录")
        attempt = CaptureAttempt.model_validate(args["attempt"]).model_dump()
        attempt["at"] = now()
        original = args.get("original")
        if original is not None:
            if attempt["state"] == "failed" or not isinstance(original, str) or not original.strip() or len(original) > 100000:
                raise HTTPException(422, "只有成功或部分成功可写入非空原文")
            values["original"] = original
        if attempt["state"] in {"success", "partial"} and not (values.get("original", "").strip() or values.get("summary", "").strip()):
            raise HTTPException(422, "成功或部分成功需要已保存的关键内容")
        if attempt["state"] == "success" and (attempt["missing"] or attempt["error_kind"]):
            raise HTTPException(422, "有缺失或错误时应标记部分完成")
        previous = values.get("capture", {})
        values["capture"] = {**attempt, "attempts": previous.get("attempts", 0) + 1, "history": [*previous.get("history", []), attempt][-20:]}
        values["last_actor"] = "agent"
        changed = db.execute(update(Affair).where(Affair.id == item.id, Affair.user_id == user.id, Affair.version == expected).values(payload=values, version=expected + 1, updated_at=now()))
        if changed.rowcount != 1:
            raise HTTPException(409, "信息已更新，请重新读取")
        return {"record_type": "affair", "id": item.id, "title": values["title"], "version": expected + 1, "capture": values["capture"]}
    if operation == "update_affair":
        changes = args["changes"]
        allowed = set(AffairInput.model_fields) - {
            "attachments",
            "note_ids",
            "reminders",
        }
        if not changes or set(changes) - allowed:
            raise HTTPException(422, "更新包含不支持的字段，请用关联笔记或提醒工具")
        values.update(changes)
    elif operation == "link_note":
        note_id = args["note_id"]
        owned(db, Note, note_id, user.id)
        ids = list(values.get("note_ids", []))
        if args.get("unlink", False):
            ids = [i for i in ids if i != note_id]
        elif note_id not in ids:
            ids.append(note_id)
        values["note_ids"] = ids
    elif operation == "set_reminder":
        reminders = list(values.get("reminders", []))
        index = args.get("index")
        reminder = args.get("reminder")
        if index is not None and (
            not isinstance(index, int) or index < 0 or index >= len(reminders)
        ):
            raise HTTPException(422, "提醒索引无效，请重新读取事务")
        if reminder is None:
            if index is None:
                raise HTTPException(422, "移除提醒需要索引")
            reminders.pop(index)
        else:
            value = Reminder.model_validate(reminder).model_dump(mode="json")
            if index is None:
                reminders.append(value)
            else:
                reminders[index] = value
        values["reminders"] = reminders
    else:
        raise HTTPException(422, "不支持的操作")
    values["version"] = expected
    result = affairs.edit(
        item.id, AffairUpdate.model_validate(values), db, user, commit=False, actor="agent"
    )
    return {
        "record_type": "affair",
        "id": result["id"],
        "version": result["version"],
        "title": result["title"],
        "status": result["status"],
        "note_ids": result["note_ids"],
        "reminders": result["reminders"],
    }


def execute(db, user, command):
    raw = json.dumps(
        {"operation": command.operation, "arguments": command.arguments},
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    fingerprint = hashlib.sha256(raw.encode()).hexdigest()
    key = (user.id, command.request_id)
    existing = db.get(Receipt, key)
    if existing:
        if existing.fingerprint != fingerprint:
            raise HTTPException(409, "请求编号已被其他内容使用")
        return {**{k: v for k, v in existing.result.items() if k != "_undo"}, "replayed": True}
    try:
        receipt = Receipt(
            user_id=user.id,
            request_id=command.request_id,
            fingerprint=fingerprint,
            result={},
        )
        db.add(receipt)
        db.flush()  # Reserve the key before mutation; receipt and data commit together.
        before = before_command(db, user, command.arguments)
        saved = dispatch(db, user, command.operation, command.arguments)
        db.flush()
        db.expire_all()
        result = {
            "saved": True,
            "request_id": command.request_id,
            "operation": command.operation,
            "record": saved,
            "replayed": False,
        }
        receipt.result = {**result, "_undo": snapshot(db, user, saved, before)}
        db.commit()
        return result
    except IntegrityError:
        db.rollback()
        existing = db.get(Receipt, key)
        if existing and existing.fingerprint == fingerprint:
            return {**{k: v for k, v in existing.result.items() if k != "_undo"}, "replayed": True}
        raise HTTPException(409, "发生并发冲突，请查询后重试") from None
    except (ValidationError, KeyError, TypeError, ValueError):
        db.rollback()
        raise HTTPException(422, "工具参数无效，请核对字段、时间及必填值") from None
    except Exception:
        db.rollback()
        raise

