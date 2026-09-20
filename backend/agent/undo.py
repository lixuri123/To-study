from copy import deepcopy
from fastapi import HTTPException
from sqlalchemy import select, update
from ..affairs.models import Affair
from ..notes.models import Note
from ..common.models import now
from .models import Receipt
from ..affairs.sources import canonical_url
import hashlib


def before_command(db, user, args):
    row = db.get(Affair, args.get("affair_id", ""))
    return deepcopy(row.payload) if row and row.user_id == user.id else None


def snapshot(db, user, saved, before):
    if saved.get("reused"):
        return None
    kind = saved.get("record_type")
    model = Affair if kind == "affair" else Note if kind == "note" else None
    row = db.get(model, saved.get("id")) if model else None
    if row is None or row.user_id != user.id:
        return None
    return {"kind": kind, "id": row.id, "before": before, "after": deepcopy(row.payload) if kind == "affair" else {"title": row.title, "content": row.content}, "version": row.version if kind == "affair" else row.updated_at}


def undo(db, user, request_ids, preview=True):
    if not request_ids or len(request_ids) > 50 or len(set(request_ids)) != len(request_ids):
        raise HTTPException(422, "请选择1至50条不同回执")
    rows = db.scalars(select(Receipt).where(Receipt.user_id == user.id, Receipt.request_id.in_(request_ids)).order_by(Receipt.created_at.desc(), Receipt.request_id.desc())).all()
    if len(rows) != len(request_ids):
        raise HTTPException(404, "回执不存在")
    restored = {}
    result = []
    try:
        for receipt in rows:
            snap = receipt.result.get("_undo")
            if not snap or receipt.result.get("undone"):
                raise HTTPException(409, "所选操作不支持撤销或已经撤销")
            model = Affair if snap["kind"] == "affair" else Note
            row = db.get(model, snap["id"])
            if row is None or row.user_id != user.id:
                raise HTTPException(409, "记录已被删除")
            current = row.payload if model == Affair else {"title": row.title, "content": row.content}
            version = row.version if model == Affair else row.updated_at
            expected = restored.get(row.id, snap["version"])
            if current != snap["after"] or version != expected:
                raise HTTPException(409, "记录在整理后已被修改，请保留后续修改或选择更晚的回执一起撤销")
            result.append({"request_id": receipt.request_id, "title": current.get("title", ""), "action": "恢复修改前内容" if snap["before"] is not None else "移除本次新增记录"})
            if snap["before"] is None:
                for other in db.scalars(select(Affair).where(Affair.user_id == user.id)):
                    if other.id != row.id and (other.payload.get("source_information_id") == row.id or row.id in other.payload.get("note_ids", [])):
                        raise HTTPException(409, "新增记录仍被其他事务引用，请先解除关联或同时撤销关联操作")
                db.delete(row)
            else:
                old = snap["before"]
                source_key = hashlib.sha256(canonical_url(old["source_url"]).encode()).hexdigest() if old.get("kind") == "information" and old.get("source_url") else None
                changed = db.execute(update(Affair).where(Affair.id == row.id, Affair.version == version).values(payload=old, source_key=source_key, version=version + 1, updated_at=now()))
                if changed.rowcount != 1:
                    raise HTTPException(409, "内容已变化，请重新预览")
                restored[row.id] = version + 1
            receipt.result = {**receipt.result, "undone": True}
            db.flush()
            db.expire_all()
        if preview:
            db.rollback()
        else:
            db.commit()
        return {"preview": preview, "changes": result}
    except Exception:
        db.rollback()
        raise
