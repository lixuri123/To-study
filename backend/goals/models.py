from datetime import date

from sqlalchemy import Date, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..common.models import Base, identifier, now


class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    archived_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[str] = mapped_column(String(40), default=now)
    updated_at: Mapped[str] = mapped_column(String(40), default=now)
    blocks: Mapped[list["GoalBlock"]] = relationship(
        cascade="all, delete-orphan", order_by="GoalBlock.position"
    )


class GoalBlock(Base):
    __tablename__ = "goal_blocks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    goal_id: Mapped[str] = mapped_column(ForeignKey("goals.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(200))
    unit_label: Mapped[str] = mapped_column(String(20), default="次")
    minimum_total: Mapped[float | None] = mapped_column(Float, nullable=True)
    minimum_distinct_categories: Mapped[int | None] = mapped_column(Integer, nullable=True)
    position: Mapped[int] = mapped_column(Integer)
    checklist_items: Mapped[list["GoalChecklistItem"]] = relationship(
        cascade="all, delete-orphan", order_by="GoalChecklistItem.position"
    )
    categories: Mapped[list["GoalCategory"]] = relationship(
        cascade="all, delete-orphan", order_by="GoalCategory.position"
    )
    entries: Mapped[list["GoalProgressEntry"]] = relationship(
        cascade="all, delete-orphan", order_by="GoalProgressEntry.completed_on"
    )


class GoalChecklistItem(Base):
    __tablename__ = "goal_checklist_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    block_id: Mapped[str] = mapped_column(ForeignKey("goal_blocks.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    completed_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    position: Mapped[int] = mapped_column(Integer)


class GoalCategory(Base):
    __tablename__ = "goal_categories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    block_id: Mapped[str] = mapped_column(ForeignKey("goal_blocks.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    minimum_amount: Mapped[float] = mapped_column(Float, default=1)
    is_required: Mapped[bool] = mapped_column(default=False)
    position: Mapped[int] = mapped_column(Integer)
    suggestions: Mapped[list["GoalActivitySuggestion"]] = relationship(
        cascade="all, delete-orphan", order_by="GoalActivitySuggestion.position"
    )


class GoalActivitySuggestion(Base):
    __tablename__ = "goal_activity_suggestions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    category_id: Mapped[str] = mapped_column(ForeignKey("goal_categories.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    position: Mapped[int] = mapped_column(Integer)


class GoalProgressEntry(Base):
    __tablename__ = "goal_progress_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    block_id: Mapped[str] = mapped_column(ForeignKey("goal_blocks.id"), index=True)
    category_id: Mapped[str] = mapped_column(ForeignKey("goal_categories.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    completed_on: Mapped[date] = mapped_column(Date)
    amount: Mapped[float] = mapped_column(Float, default=1)
    created_at: Mapped[str] = mapped_column(String(40), default=now)
    updated_at: Mapped[str] = mapped_column(String(40), default=now)
