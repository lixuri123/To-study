from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..common.models import now
from ..goals.models import Goal
from ..notes.models import Note
from .models import Plan, PlanCheckin
from .schemas import CheckinInput, PlanInput


def owned_plan(db: Session, user_id: str, plan_id: str) -> Plan:
    plan = db.scalar(select(Plan).where(Plan.id == plan_id, Plan.user_id == user_id))
    if not plan:
        raise HTTPException(404, "计划不存在")
    return plan


def check_goal(db: Session, user_id: str, goal_id: str | None):
    if goal_id and not db.scalar(select(Goal.id).where(Goal.id == goal_id, Goal.user_id == user_id)):
        raise HTTPException(422, "关联目标不存在")


def output(plan: Plan, start: date | None = None, end: date | None = None):
    return {
        "id": plan.id, "title": plan.title, "kind": plan.kind,
        "start_date": plan.start_date, "end_date": plan.end_date,
        "weekdays": plan.weekdays, "weekly_target": plan.weekly_target,
        "target_amount": plan.target_amount, "unit": plan.unit,
        "goal_id": plan.goal_id, "archived_at": plan.archived_at,
        "created_at": plan.created_at, "updated_at": plan.updated_at,
        "checkins": [
            {"id": row.id, "day": row.day, "status": row.status,
             "amount": row.amount, "memo": row.memo, "note_id": row.note_id,
             "created_at": row.created_at, "updated_at": row.updated_at}
            for row in plan.checkins
            if (start is None or row.day >= start) and (end is None or row.day <= end)
        ],
    }


def list_plans(db: Session, user_id: str, start: date, end: date):
    if end < start or (end - start).days > 370:
        raise HTTPException(422, "查询日期范围不能超过 370 天")
    plans = db.scalars(
        select(Plan).where(Plan.user_id == user_id)
        .options(selectinload(Plan.checkins)).order_by(Plan.created_at.desc())
    ).all()
    return [output(plan, start, end) for plan in plans]


def save_plan(db: Session, user_id: str, data: PlanInput, plan_id: str | None = None):
    check_goal(db, user_id, data.goal_id)
    plan = owned_plan(db, user_id, plan_id) if plan_id else Plan(user_id=user_id)
    for key, value in data.model_dump().items():
        setattr(plan, key, value)
    plan.updated_at = now()
    db.add(plan)
    db.commit()
    return output(owned_plan(db, user_id, plan.id))


def archive_plan(db: Session, user_id: str, plan_id: str, archived: bool):
    plan = owned_plan(db, user_id, plan_id)
    plan.archived_at = now() if archived else None
    plan.updated_at = now()
    db.commit()
    return output(owned_plan(db, user_id, plan_id))


def save_checkin(db: Session, user_id: str, plan_id: str, day: date, data: CheckinInput):
    plan = owned_plan(db, user_id, plan_id)
    today = datetime.now(ZoneInfo("Asia/Shanghai")).date()
    if day > today or day < plan.start_date or plan.end_date and day > plan.end_date:
        raise HTTPException(422, "打卡日期须在计划有效期内且不能晚于今天")
    if plan.kind == "once" and day != plan.start_date:
        raise HTTPException(422, "单次计划只能在计划日期打卡")
    if data.note_id and not db.scalar(select(Note.id).where(Note.id == data.note_id, Note.user_id == user_id)):
        raise HTTPException(422, "关联笔记不存在")
    row = db.scalar(select(PlanCheckin).where(PlanCheckin.plan_id == plan_id, PlanCheckin.day == day))
    if row is None:
        row = PlanCheckin(plan_id=plan_id, day=day)
    row.status = data.status
    row.amount = data.amount
    row.memo = data.memo
    row.note_id = data.note_id
    row.updated_at = now()
    db.add(row)
    db.commit()
    return output(owned_plan(db, user_id, plan_id))


def remove_checkin(db: Session, user_id: str, plan_id: str, day: date):
    owned_plan(db, user_id, plan_id)
    row = db.scalar(select(PlanCheckin).where(PlanCheckin.plan_id == plan_id, PlanCheckin.day == day))
    if not row:
        raise HTTPException(404, "打卡记录不存在")
    db.delete(row)
    db.commit()
    return output(owned_plan(db, user_id, plan_id))
