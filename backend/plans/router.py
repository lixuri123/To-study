from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..auth.models import User
from ..auth.sessions import current_user
from ..database import db_session
from . import service
from .schemas import ArchiveInput, CheckinInput, PlanInput

router = APIRouter(prefix="/api/plans", tags=["plans"])
DB = Annotated[Session, Depends(db_session)]
Account = Annotated[User, Depends(current_user)]


@router.get("")
def plans(user: Account, db: DB, start: date = Query(...), end: date = Query(...)):
    return service.list_plans(db, user.id, start, end)


@router.post("", status_code=201)
def create(data: PlanInput, user: Account, db: DB):
    return service.save_plan(db, user.id, data)


@router.put("/{plan_id}")
def update(plan_id: str, data: PlanInput, user: Account, db: DB):
    return service.save_plan(db, user.id, data, plan_id)


@router.patch("/{plan_id}/archive")
def archive(plan_id: str, data: ArchiveInput, user: Account, db: DB):
    return service.archive_plan(db, user.id, plan_id, data.archived)


@router.put("/{plan_id}/checkins/{day}")
def checkin(plan_id: str, day: date, data: CheckinInput, user: Account, db: DB):
    return service.save_checkin(db, user.id, plan_id, day, data)


@router.delete("/{plan_id}/checkins/{day}")
def undo_checkin(plan_id: str, day: date, user: Account, db: DB):
    return service.remove_checkin(db, user.id, plan_id, day)
