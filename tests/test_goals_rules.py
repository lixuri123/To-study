from datetime import date, timedelta

import pytest

from backend.goals.models import (
    GoalBlock,
    GoalCategory,
    GoalChecklistItem,
    GoalProgressEntry,
)
from backend.goals.rules import summarize_blocks
from backend.goals.schemas import (
    BlockInput,
    ChecklistCompletionInput,
    ProgressInput,
)


def quota_block(required_total=8, required_distinct=4):
    block = GoalBlock(
        id="core",
        kind="quota",
        title="核心素质",
        unit_label="次",
        minimum_total=required_total,
        minimum_distinct_categories=required_distinct,
        position=0,
    )
    block.categories = [
        GoalCategory(
            id=f"c{index}",
            name=name,
            minimum_amount=1,
            is_required=True,
            position=index,
        )
        for index, name in enumerate(["理想信念", "科学道德", "爱校荣校", "安全法纪"])
    ]
    block.entries = []
    return block


def add(block, category_index, amount=1):
    block.entries.append(
        GoalProgressEntry(
            id=f"e{len(block.entries)}",
            block_id=block.id,
            category_id=block.categories[category_index].id,
            title="完成活动",
            completed_on=date(2026, 9, 20),
            amount=amount,
        )
    )


def test_quota_requires_total_and_every_required_category():
    block = quota_block()
    for index in range(4):
        add(block, index)
    add(block, 0, 3)
    assert summarize_blocks([block]).attained is False
    add(block, 1)
    assert summarize_blocks([block]).attained is True


def test_distinct_categories_ignore_repeated_entries_in_one_category():
    block = quota_block(required_total=3, required_distinct=3)
    for category in block.categories:
        category.is_required = False
    add(block, 0, 3)
    summary = summarize_blocks([block])
    distinct = next(rule for rule in summary.blocks[0].rules if rule.key == "distinct")
    assert distinct.current == 1
    assert summary.attained is False


def test_checklist_and_quota_must_both_pass():
    checklist = GoalBlock(
        id="list",
        kind="checklist",
        title="毕业手续",
        unit_label="项",
        minimum_total=None,
        minimum_distinct_categories=None,
        position=0,
    )
    checklist.checklist_items = [
        GoalChecklistItem(id="i1", title="提交论文", completed_on=date(2026, 9, 20), position=0),
        GoalChecklistItem(id="i2", title="完成答辩", completed_on=None, position=1),
    ]
    checklist.categories = []
    checklist.entries = []
    quota = quota_block(required_total=1, required_distinct=1)
    for category in quota.categories:
        category.is_required = False
    add(quota, 0)
    assert summarize_blocks([checklist, quota]).attained is False
    checklist.checklist_items[1].completed_on = date(2026, 9, 20)
    assert summarize_blocks([checklist, quota]).attained is True


def test_empty_and_unconfigured_blocks_never_attain():
    empty = GoalBlock(
        id="empty",
        kind="checklist",
        title="空清单",
        unit_label="项",
        minimum_total=None,
        minimum_distinct_categories=None,
        position=0,
    )
    empty.checklist_items = []
    empty.categories = []
    empty.entries = []
    assert summarize_blocks([]).attained is False
    assert summarize_blocks([empty]).attained is False


def test_checklist_block_rejects_categories():
    with pytest.raises(ValueError):
        BlockInput(
            kind="checklist",
            title="毕业手续",
            position=0,
            checklist_items=[{"title": "提交论文", "position": 0}],
            categories=[{"name": "不应存在", "position": 0}],
        )


def test_quota_block_rejects_checklist_items():
    with pytest.raises(ValueError):
        BlockInput(
            kind="quota",
            title="核心素质",
            position=0,
            checklist_items=[{"title": "不应存在", "position": 0}],
            categories=[{"name": "理想信念", "position": 0}],
            minimum_total=1,
        )


def test_quota_distinct_count_cannot_exceed_category_count():
    with pytest.raises(ValueError):
        BlockInput(
            kind="quota",
            title="核心素质",
            position=0,
            categories=[{"name": "理想信念", "position": 0}],
            minimum_distinct_categories=2,
        )


def test_progress_completion_dates_cannot_be_in_the_future():
    future = date.today() + timedelta(days=1)  # noqa: DTZ011 - local date contract
    with pytest.raises(ValueError):
        ProgressInput(title="完成活动", completed_on=future, category_id="c1")
    with pytest.raises(ValueError):
        ChecklistCompletionInput(completed_on=future)


def test_progress_amount_must_be_positive():
    with pytest.raises(ValueError):
        ProgressInput(
            title="完成活动",
            completed_on=date.today(),  # noqa: DTZ011 - local date contract
            category_id="c1",
            amount=0,
        )
