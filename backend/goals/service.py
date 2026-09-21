from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..common.models import now
from .models import (
    Goal,
    GoalActivitySuggestion,
    GoalBlock,
    GoalCategory,
    GoalChecklistItem,
)
from .rules import summarize_blocks
from .schemas import GoalStructureInput, LifecycleInput
from .templates import template_structure


def owned_goal(db: Session, user_id: str, goal_id: str) -> Goal:
    goal = db.scalar(
        select(Goal)
        .where(Goal.id == goal_id, Goal.user_id == user_id)
        .options(
            selectinload(Goal.blocks).selectinload(GoalBlock.checklist_items),
            selectinload(Goal.blocks).selectinload(GoalBlock.categories)
            .selectinload(GoalCategory.suggestions),
            selectinload(Goal.blocks).selectinload(GoalBlock.entries),
        )
    )
    if goal is None:
        raise HTTPException(404, "目标不存在")
    return goal


def _block_output(block: GoalBlock):
    return {
        "id": block.id,
        "kind": block.kind,
        "title": block.title,
        "unit_label": block.unit_label,
        "minimum_total": block.minimum_total,
        "minimum_distinct_categories": block.minimum_distinct_categories,
        "position": block.position,
        "checklist_items": [
            {
                "id": item.id,
                "title": item.title,
                "completed_on": item.completed_on,
                "position": item.position,
            }
            for item in block.checklist_items
        ],
        "categories": [
            {
                "id": category.id,
                "name": category.name,
                "minimum_amount": category.minimum_amount,
                "is_required": category.is_required,
                "position": category.position,
                "suggestions": [
                    {"id": suggestion.id, "title": suggestion.title, "position": suggestion.position}
                    for suggestion in category.suggestions
                ],
            }
            for category in block.categories
        ],
    }


def _entry_output(entry):
    return {
        "id": entry.id,
        "block_id": entry.block_id,
        "category_id": entry.category_id,
        "title": entry.title,
        "completed_on": entry.completed_on,
        "amount": entry.amount,
        "created_at": entry.created_at,
        "updated_at": entry.updated_at,
    }


def detail(goal: Goal):
    entries = sorted(
        (entry for block in goal.blocks for entry in block.entries),
        key=lambda entry: (entry.completed_on, entry.created_at, entry.id),
        reverse=True,
    )
    return {
        "id": goal.id,
        "title": goal.title,
        "description": goal.description,
        "archived_at": goal.archived_at,
        "created_at": goal.created_at,
        "updated_at": goal.updated_at,
        "blocks": [_block_output(block) for block in goal.blocks],
        "entries": [_entry_output(entry) for entry in entries],
        "summary": summarize_blocks(goal.blocks).model_dump(),
    }


def _card(goal: Goal):
    return {
        "id": goal.id,
        "title": goal.title,
        "description": goal.description,
        "archived_at": goal.archived_at,
        "updated_at": goal.updated_at,
        "summary": summarize_blocks(goal.blocks).model_dump(),
    }


def list_goals(db: Session, user_id: str):
    goals = db.scalars(
        select(Goal)
        .where(Goal.user_id == user_id)
        .order_by(Goal.updated_at.desc())
        .options(
            selectinload(Goal.blocks).selectinload(GoalBlock.checklist_items),
            selectinload(Goal.blocks).selectinload(GoalBlock.categories),
            selectinload(Goal.blocks).selectinload(GoalBlock.entries),
        )
    ).all()
    return [_card(goal) for goal in goals]


def goal_detail(db: Session, user_id: str, goal_id: str):
    return detail(owned_goal(db, user_id, goal_id))


def create_graph(db: Session, user_id: str, data: GoalStructureInput):
    goal = Goal(user_id=user_id, title=data.title, description=data.description)
    for block_data in data.blocks:
        block = GoalBlock(
            kind=block_data.kind,
            title=block_data.title,
            unit_label=block_data.unit_label,
            minimum_total=block_data.minimum_total,
            minimum_distinct_categories=block_data.minimum_distinct_categories,
            position=block_data.position,
        )
        for item_data in block_data.checklist_items:
            block.checklist_items.append(
                GoalChecklistItem(title=item_data.title, position=item_data.position)
            )
        for category_data in block_data.categories:
            category = GoalCategory(
                name=category_data.name,
                minimum_amount=category_data.minimum_amount,
                is_required=category_data.is_required,
                position=category_data.position,
            )
            for suggestion_data in category_data.suggestions:
                category.suggestions.append(
                    GoalActivitySuggestion(
                        title=suggestion_data.title, position=suggestion_data.position
                    )
                )
            block.categories.append(category)
        goal.blocks.append(block)
    db.add(goal)
    db.flush()
    db.commit()
    return owned_goal(db, user_id, goal.id)


def create_goal(db: Session, user_id: str, data: GoalStructureInput):
    return detail(create_graph(db, user_id, data))


def set_lifecycle(
    db: Session, user_id: str, goal_id: str, data: LifecycleInput
):
    goal = owned_goal(db, user_id, goal_id)
    goal.archived_at = now() if data.archived else None
    goal.updated_at = now()
    db.commit()
    return detail(owned_goal(db, user_id, goal_id))


def delete_empty_goal(db: Session, user_id: str, goal_id: str):
    goal = owned_goal(db, user_id, goal_id)
    has_completed_checklist = any(
        item.completed_on is not None
        for block in goal.blocks
        for item in block.checklist_items
    )
    has_progress = any(block.entries for block in goal.blocks)
    if has_completed_checklist or has_progress:
        raise HTTPException(409, "目标已有完成记录，请归档而不是删除")
    db.delete(goal)
    db.commit()


def create_from_template(db: Session, user_id: str, key: str):
    try:
        data = template_structure(key)
    except KeyError:
        raise HTTPException(404, "目标模板不存在") from None
    return detail(create_graph(db, user_id, data))
