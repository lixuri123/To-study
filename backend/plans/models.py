from datetime import date

from sqlalchemy import Date, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..common.models import Base, identifier, now


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    goal_id: Mapped[str | None] = mapped_column(ForeignKey("goals.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(20))  # once, weekdays, weekly
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    weekdays: Mapped[list[int]] = mapped_column(JSON, default=list)
    weekly_target: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_amount: Mapped[float] = mapped_column(Float, default=1)
    unit: Mapped[str] = mapped_column(String(20), default="次")
    archived_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[str] = mapped_column(String(40), default=now)
    updated_at: Mapped[str] = mapped_column(String(40), default=now)
    checkins: Mapped[list["PlanCheckin"]] = relationship(
        cascade="all, delete-orphan", order_by="PlanCheckin.day"
    )


class PlanCheckin(Base):
    __tablename__ = "plan_checkins"
    __table_args__ = (UniqueConstraint("plan_id", "day", name="uq_plan_checkin_day"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    plan_id: Mapped[str] = mapped_column(ForeignKey("plans.id"), index=True)
    day: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20))  # done, partial, skipped
    amount: Mapped[float] = mapped_column(Float, default=1)
    memo: Mapped[str] = mapped_column(Text, default="")
    note_id: Mapped[str | None] = mapped_column(ForeignKey("notes.id"), nullable=True)
    created_at: Mapped[str] = mapped_column(String(40), default=now)
    updated_at: Mapped[str] = mapped_column(String(40), default=now)
