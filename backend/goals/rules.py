from .schemas import BlockSummaryOutput, GoalSummaryOutput, RuleOutput


def summarize_blocks(blocks) -> GoalSummaryOutput:
    summaries = []
    for block in blocks:
        if block.kind == "checklist":
            items = list(block.checklist_items)
            completed = sum(item.completed_on is not None for item in items)
            rules = [
                RuleOutput(
                    key="checklist",
                    label="完成清单",
                    current=completed,
                    required=len(items),
                    unit="项",
                    satisfied=bool(items) and completed == len(items),
                )
            ]
        else:
            categories = list(block.categories)
            amounts = {category.id: 0.0 for category in categories}
            for entry in block.entries:
                if entry.category_id in amounts:
                    amounts[entry.category_id] += entry.amount
            rules = []
            if block.minimum_total is not None:
                total = sum(amounts.values())
                rules.append(
                    RuleOutput(
                        key="total",
                        label="累计数量",
                        current=total,
                        required=block.minimum_total,
                        unit=block.unit_label,
                        satisfied=total >= block.minimum_total,
                    )
                )
            for category in categories:
                if category.is_required:
                    current = amounts[category.id]
                    rules.append(
                        RuleOutput(
                            key="required_category",
                            label=category.name,
                            current=current,
                            required=category.minimum_amount,
                            unit=block.unit_label,
                            satisfied=current >= category.minimum_amount,
                        )
                    )
            if block.minimum_distinct_categories is not None:
                distinct = sum(
                    amounts[category.id] >= category.minimum_amount
                    for category in categories
                )
                rules.append(
                    RuleOutput(
                        key="distinct",
                        label="覆盖分类",
                        current=distinct,
                        required=block.minimum_distinct_categories,
                        unit="类",
                        satisfied=distinct >= block.minimum_distinct_categories,
                    )
                )
        summaries.append(
            BlockSummaryOutput(
                block_id=block.id,
                title=block.title,
                kind=block.kind,
                attained=bool(rules) and all(rule.satisfied for rule in rules),
                rules=rules,
            )
        )
    return GoalSummaryOutput(
        attained=bool(summaries) and all(block.attained for block in summaries),
        blocks=summaries,
    )
