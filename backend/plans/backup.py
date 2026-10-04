"""Portable goal/plan graph, restored inside the caller's transaction."""
from datetime import date

from pydantic import Field
from sqlalchemy import select

from ..common.models import identifier
from ..goals.models import Goal, GoalBlock, GoalChecklistItem, GoalCategory, GoalActivitySuggestion, GoalProgressEntry
from ..goals.schemas import GoalStructureInput, ProgressInput
from ..goals.service import detail
from .models import Plan, PlanCheckin
from .schemas import PlanInput, CheckinInput
from .service import output


class SavedCheckin(CheckinInput):
    day: date


class SavedPlan(PlanInput):
    archived_at: str | None = Field(default=None, max_length=40)
    checkins: list[SavedCheckin] = Field(default_factory=list, max_length=10000)


class SavedEntry(ProgressInput):
    block_id: str


class SavedGoal(GoalStructureInput):
    archived_at: str | None = Field(default=None, max_length=40)
    entries: list[SavedEntry] = Field(default_factory=list, max_length=10000)


def export_graph(db, user_id):
    return {
        "goals": [detail(goal) for goal in db.scalars(select(Goal).where(Goal.user_id == user_id))],
        "plans": [output(plan) for plan in db.scalars(select(Plan).where(Plan.user_id == user_id))],
    }


def validate_graph(archive, prepared):
    for kind, schema in (("goals", SavedGoal), ("plans", SavedPlan)):
        rows = archive.get(kind, [])
        if not isinstance(rows, list) or len(rows) > 10000:
            raise ValueError()
        prepared[kind] = [(row["id"], schema.model_validate(row)) for row in rows]
        ids = [key for key, _ in prepared[kind]]
        if any(not isinstance(key, str) for key in ids) or len(set(ids)) != len(ids):
            raise ValueError()
    goal_ids = {key for key, _ in prepared["goals"]}
    note_ids = {key for key, _ in prepared["notes"]}
    for _, plan in prepared["plans"]:
        if plan.goal_id and plan.goal_id not in goal_ids:
            raise ValueError()
        days = [row.day for row in plan.checkins]
        if len(set(days)) != len(days) or any(row.note_id and row.note_id not in note_ids for row in plan.checkins):
            raise ValueError()
    for raw, (_, goal) in zip(archive.get("goals", []), prepared["goals"]):
        ids = []
        categories = {}
        for block, source in zip(goal.blocks, raw["blocks"]):
            ids.append(block.id)
            for item, source_item in zip(block.checklist_items, source.get("checklist_items", [])):
                ids.append(item.id)
                if source_item.get("completed_on"):
                    date.fromisoformat(source_item["completed_on"])
            for category in block.categories:
                ids.append(category.id)
                categories[category.id] = block.id
                ids.extend(s.id for s in category.suggestions)
        if any(not isinstance(key, str) for key in ids) or len(set(ids)) != len(ids):
            raise ValueError()
        if any(categories.get(entry.category_id) != entry.block_id for entry in goal.entries):
            raise ValueError()


def restore_graph(db, user_id, archive, prepared, mapping):
    for raw, (key, goal) in zip(archive.get("goals", []), prepared["goals"]):
        record = Goal(id=mapping["goals"][key], user_id=user_id, title=goal.title,
                      description=goal.description, archived_at=goal.archived_at)
        block_map, category_map = {}, {}
        for source, block in zip(raw["blocks"], goal.blocks):
            node = GoalBlock(id=identifier(), **block.model_dump(exclude={"id", "checklist_items", "categories"}))
            block_map[block.id] = node
            record.blocks.append(node)
            for source_item, item in zip(source.get("checklist_items", []), block.checklist_items):
                completed = date.fromisoformat(source_item["completed_on"]) if source_item.get("completed_on") else None
                node.checklist_items.append(GoalChecklistItem(**item.model_dump(exclude={"id"}), completed_on=completed))
            for category in block.categories:
                child = GoalCategory(id=identifier(), **category.model_dump(exclude={"id", "suggestions"}))
                category_map[category.id] = child.id
                node.categories.append(child)
                for suggestion in category.suggestions:
                    child.suggestions.append(GoalActivitySuggestion(**suggestion.model_dump(exclude={"id"})))
        for entry in goal.entries:
            block_map[entry.block_id].entries.append(GoalProgressEntry(
                **entry.model_dump(exclude={"block_id", "category_id"}), category_id=category_map[entry.category_id]))
        db.add(record)
    db.flush()
    for key, plan in prepared["plans"]:
        values = plan.model_dump(exclude={"checkins", "goal_id"})
        record = Plan(id=mapping["plans"][key], user_id=user_id,
                      goal_id=mapping["goals"].get(plan.goal_id), **values)
        for row in plan.checkins:
            record.checkins.append(PlanCheckin(**row.model_dump(exclude={"note_id"}),
                                             note_id=mapping["notes"].get(row.note_id)))
        db.add(record)
