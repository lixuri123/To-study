from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session


def owned(db: Session, model, item_id: str, user_id: str):
    item = db.scalar(select(model).where(model.id == item_id, model.user_id == user_id))
    if item is None:
        raise HTTPException(404, "内容不存在")
    return item
