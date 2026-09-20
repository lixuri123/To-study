import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import ValidationError
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth.models import User
from ..auth.sessions import current_user
from ..common.ownership import owned
from ..database import db_session
from .models import Course, TimetableSettings
from .schemas import (
    CourseInput,
    CourseOutput,
    CourseUpdate,
    ImportInput,
    PreviewInput,
    SettingsInput,
)

router = APIRouter(prefix="/api/timetable", tags=["timetable"])
DB = Annotated[Session, Depends(db_session)]
Account = Annotated[User, Depends(current_user)]


def output(item: Course):
    return {**item.payload, "id": item.id, "version": item.version}


@router.get("/courses", response_model=list[CourseOutput])
def courses(db: DB, user: Account):
    return [output(item) for item in db.scalars(
        select(Course).where(Course.user_id == user.id).order_by(Course.id)
    )]


@router.post("/courses", response_model=CourseOutput, status_code=201)
def create_course(data: CourseInput, db: DB, user: Account):
    item = Course(user_id=user.id, payload=data.model_dump(mode="json"))
    db.add(item)
    db.commit()
    db.refresh(item)
    return output(item)


@router.put("/courses/{item_id}", response_model=CourseOutput)
def edit_course(item_id: str, data: CourseUpdate, db: DB, user: Account):
    item = owned(db, Course, item_id, user.id)
    result = db.execute(update(Course).where(
        Course.id == item_id, Course.user_id == user.id, Course.version == data.version
    ).values(payload=data.model_dump(mode="json", exclude={"version"}), version=data.version + 1))
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(409, "课程已在其他页面更新，请关闭编辑、刷新课表后重试")
    db.commit()
    db.refresh(item)
    return output(item)


@router.delete("/courses/{item_id}", status_code=204)
def delete_course(item_id: str, db: DB, user: Account):
    db.delete(owned(db, Course, item_id, user.id))
    db.commit()
    return Response(status_code=204)


@router.get("/settings", response_model=SettingsInput)
def settings(db: DB, user: Account):
    return db.get(TimetableSettings, user.id) or SettingsInput()


@router.put("/settings", response_model=SettingsInput)
def save_settings(data: SettingsInput, db: DB, user: Account):
    values = data.model_dump(exclude={"version"})
    if data.version == 0:
        item = TimetableSettings(user_id=user.id, **values, version=1)
        db.add(item)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, "学期设置已更新，请关闭设置、刷新课表后重试") from None
    else:
        result = db.execute(update(TimetableSettings).where(
            TimetableSettings.user_id == user.id, TimetableSettings.version == data.version
        ).values(**values, version=data.version + 1))
        if result.rowcount != 1:
            db.rollback()
            raise HTTPException(409, "学期设置已更新，请关闭设置、刷新课表后重试")
        db.commit()
        item = db.get(TimetableSettings, user.id)
    db.refresh(item)
    return item


@router.post("/preview")
def preview(data: PreviewInput, user: Account):
    from .parser import parse_timetable

    result = parse_timetable(data.text)
    # The parser rejects unsupported rows; enforce storage limits before selection.
    try:
        result["courses"] = [CourseInput.model_validate(c).model_dump(mode="json") for c in result["courses"]]
    except ValidationError:
        raise HTTPException(422, "课程信息超出支持范围，请检查课程字段长度和安排数量") from None
    return result


def fingerprint(payload: dict):
    return json.dumps(payload, ensure_ascii=False, sort_keys=True)


@router.post("/import")
def import_courses(data: ImportInput, db: DB, user: Account):
    # Acquire a write lock before reading existing courses. A no-op account
    # update serializes imports on both SQLite and PostgreSQL (FOR UPDATE
    # alone has no effect on SQLite). Release it with the batch commit.
    db.execute(update(User).where(User.id == user.id).values(username=User.username))
    existing = {fingerprint(item.payload) for item in db.scalars(
        select(Course).where(Course.user_id == user.id)
    )}
    created = []
    skipped = 0
    for course in data.courses:
        payload = course.model_dump(mode="json")
        key = fingerprint(payload)
        if key in existing:
            skipped += 1
            continue
        existing.add(key)
        item = Course(user_id=user.id, payload=payload)
        db.add(item)
        created.append(item)
    db.commit()
    return {"created": [output(item) for item in created], "skipped": skipped}
