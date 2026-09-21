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
from .rules import project_structure, summarize_blocks
from .schemas import GoalPreviewOutput, GoalStructureInput, LifecycleInput
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


def _content_not_found():
    raise HTTPException(404, "目标内容不存在")


def _validate_structure_ids(goal: Goal, data: GoalStructureInput):
    block_by_id = {block.id: block for block in goal.blocks}
    supplied_blocks = {}
    for block_data in data.blocks:
        if block_data.id is None:
            if (
                any(item.id is not None for item in block_data.checklist_items)
                or any(category.id is not None for category in block_data.categories)
                or any(
                    suggestion.id is not None
                    for category in block_data.categories
                    for suggestion in category.suggestions
                )
            ):
                _content_not_found()
            continue
        block = block_by_id.get(block_data.id)
        if block is None:
            _content_not_found()
        supplied_blocks[block_data.id] = block
        item_by_id = {item.id: item for item in block.checklist_items}
        category_by_id = {category.id: category for category in block.categories}
        for item_data in block_data.checklist_items:
            if item_data.id is not None and item_data.id not in item_by_id:
                _content_not_found()
        for category_data in block_data.categories:
            if category_data.id is None:
                if any(suggestion.id is not None for suggestion in category_data.suggestions):
                    _content_not_found()
                continue
            category = category_by_id.get(category_data.id)
            if category is None:
                _content_not_found()
            suggestion_ids = {suggestion.id for suggestion in category.suggestions}
            if any(
                suggestion.id is not None and suggestion.id not in suggestion_ids
                for suggestion in category_data.suggestions
            ):
                _content_not_found()
    return block_by_id, supplied_blocks


def _history_warnings(goal: Goal, data: GoalStructureInput):
    supplied_by_id = {block.id: block for block in data.blocks if block.id is not None}
    warnings = []
    for block in goal.blocks:
        block_data = supplied_by_id.get(block.id)
        item_ids = (
            {item.id for item in block_data.checklist_items if item.id is not None}
            if block_data is not None
            else set()
        )
        category_ids = (
            {category.id for category in block_data.categories if category.id is not None}
            if block_data is not None
            else set()
        )
        for item in block.checklist_items:
            if item.id not in item_ids and item.completed_on is not None:
                warnings.append(f"已完成清单项“{item.title}”将被移除")
        for category in block.categories:
            if category.id not in category_ids and any(
                entry.category_id == category.id for entry in block.entries
            ):
                warnings.append(f"分类“{category.name}”仍有完成记录")
    return warnings


def preview_structure(
    db: Session, user_id: str, goal_id: str, data: GoalStructureInput
):
    goal = owned_goal(db, user_id, goal_id)
    _validate_structure_ids(goal, data)
    completed_items = {
        item.id: item.completed_on
        for block in goal.blocks
        for item in block.checklist_items
        if item.completed_on is not None
    }
    existing_entries = [entry for block in goal.blocks for entry in block.entries]
    return GoalPreviewOutput(
        current_summary=summarize_blocks(goal.blocks),
        proposed_summary=summarize_blocks(
            project_structure(data, existing_entries, completed_items)
        ),
        warnings=_history_warnings(goal, data),
    )


def _raise_if_history_would_be_removed(goal: Goal, data: GoalStructureInput):
    warnings = _history_warnings(goal, data)
    if warnings:
        raise HTTPException(409, warnings[0].replace("将被移除", "不能删除").replace("仍有完成记录", "已有完成记录，不能删除"))


def _sync_structure(goal: Goal, data: GoalStructureInput, db: Session):
    block_by_id, _ = _validate_structure_ids(goal, data)
    _raise_if_history_would_be_removed(goal, data)
    submitted_block_ids = {block.id for block in data.blocks if block.id is not None}
    ordered_blocks = []
    for block_position, block_data in enumerate(
        sorted(data.blocks, key=lambda block: block.position)
    ):
        block = block_by_id.get(block_data.id) if block_data.id else None
        if block is None:
            block = GoalBlock()
            goal.blocks.append(block)
        block.kind = block_data.kind
        block.title = block_data.title
        block.unit_label = block_data.unit_label
        block.minimum_total = block_data.minimum_total
        block.minimum_distinct_categories = block_data.minimum_distinct_categories
        block.position = block_position
        item_by_id = {item.id: item for item in block.checklist_items}
        submitted_item_ids = {
            item.id for item in block_data.checklist_items if item.id is not None
        }
        for item_position, item_data in enumerate(
            sorted(block_data.checklist_items, key=lambda item: item.position)
        ):
            item = item_by_id.get(item_data.id) if item_data.id else None
            if item is None:
                item = GoalChecklistItem()
                block.checklist_items.append(item)
            item.title = item_data.title
            item.position = item_position
        for item in block.checklist_items:
            if item.id in item_by_id and item.id not in submitted_item_ids:
                db.delete(item)
        category_by_id = {category.id: category for category in block.categories}
        submitted_category_ids = {
            category.id for category in block_data.categories if category.id is not None
        }
        for category_position, category_data in enumerate(
            sorted(block_data.categories, key=lambda category: category.position)
        ):
            category = category_by_id.get(category_data.id) if category_data.id else None
            if category is None:
                category = GoalCategory()
                block.categories.append(category)
            category.name = category_data.name
            category.minimum_amount = category_data.minimum_amount
            category.is_required = category_data.is_required
            category.position = category_position
            suggestion_by_id = {
                suggestion.id: suggestion for suggestion in category.suggestions
            }
            submitted_suggestion_ids = {
                suggestion.id
                for suggestion in category_data.suggestions
                if suggestion.id is not None
            }
            for suggestion_position, suggestion_data in enumerate(
                sorted(category_data.suggestions, key=lambda suggestion: suggestion.position)
            ):
                suggestion = (
                    suggestion_by_id.get(suggestion_data.id)
                    if suggestion_data.id
                    else None
                )
                if suggestion is None:
                    suggestion = GoalActivitySuggestion()
                    category.suggestions.append(suggestion)
                suggestion.title = suggestion_data.title
                suggestion.position = suggestion_position
            for suggestion in category.suggestions:
                if (
                    suggestion.id in suggestion_by_id
                    and suggestion.id not in submitted_suggestion_ids
                ):
                    db.delete(suggestion)
        for category in block.categories:
            if category.id in category_by_id and category.id not in submitted_category_ids:
                db.delete(category)
        ordered_blocks.append(block)
    for block in goal.blocks:
        if block.id in block_by_id and block.id not in submitted_block_ids:
            db.delete(block)
    goal.blocks = ordered_blocks
    goal.title = data.title
    goal.description = data.description
    goal.updated_at = now()


def save_structure(
    db: Session, user_id: str, goal_id: str, data: GoalStructureInput
):
    try:
        goal = owned_goal(db, user_id, goal_id)
        _sync_structure(goal, data, db)
        db.flush()
        summarize_blocks(goal.blocks)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return detail(owned_goal(db, user_id, goal_id))


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
