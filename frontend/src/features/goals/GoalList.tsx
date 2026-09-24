import { useState } from "react";
import { Button } from "../../components/ui";
import type { GoalCard } from "./types";

type GoalListProps = {
  goals: GoalCard[];
  busy: boolean;
  onSelect: (id: string) => void;
};

function updatedDate(value: string) {
  return value.slice(0, 10);
}

function progressLine(goal: GoalCard, blockId: string) {
  const block = goal.summary.blocks.find((item) => item.block_id === blockId);
  if (!block) return "";
  const rule = [...block.rules].sort((left, right) => Number(left.satisfied) - Number(right.satisfied))[0];
  return rule ? `${block.title} · ${rule.label} ${rule.current}/${rule.required}${rule.unit}` : block.title;
}

export function GoalList({ goals, busy, onSelect }: GoalListProps) {
  const [filter, setFilter] = useState<"active" | "archived">("active");
  const visible = goals.filter((goal) => filter === "archived" ? goal.archived_at !== null : goal.archived_at === null);

  return <section className="goal-list" aria-label="目标清单">
    <div className="goal-list-head">
      <div>
        <span className="eyebrow">GOAL LEDGER</span>
        <h2>目标清单</h2>
        <p>用规则看见每一件已完成的事。</p>
      </div>
      <div className="goal-filter" aria-label="目标状态筛选">
        <Button type="button" variant="ghost" aria-pressed={filter === "active"} className={filter === "active" ? "goal-filter-active" : ""} onClick={() => setFilter("active")}>进行中</Button>
        <Button type="button" variant="ghost" aria-pressed={filter === "archived"} className={filter === "archived" ? "goal-filter-active" : ""} onClick={() => setFilter("archived")}>已归档</Button>
      </div>
    </div>
    {visible.length ? <div className="goal-list-rows">
      {visible.map((goal) => <button className="goal-list-row" type="button" key={goal.id} onClick={() => onSelect(goal.id)}>
        <div className="goal-list-title"><strong>{goal.title}</strong><span className={`goal-status ${goal.summary.attained ? "attained" : ""}`}>{goal.summary.attained ? "已达成" : "进行中"}</span>{goal.archived_at && <span className="goal-status archived">已归档</span>}</div>
        {goal.description && <p>{goal.description}</p>}
        <div className="goal-list-rules">{goal.summary.blocks.map((block) => <span key={block.block_id}>{progressLine(goal, block.block_id)}</span>)}</div>
        <time dateTime={goal.updated_at}>更新于 {updatedDate(goal.updated_at)}</time>
      </button>)}
    </div> : <div className="goal-empty"><h3>{filter === "archived" ? "还没有归档记录" : "从一份目标开始"}</h3><p>{filter === "archived" ? "归档的目标会保留在这里，便于回看。" : "建立规则，留下每天推进的证据。"}</p>{busy && <small>正在更新记录…</small>}</div>}
  </section>;
}
