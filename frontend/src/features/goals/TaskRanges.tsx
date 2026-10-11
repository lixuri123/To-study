import type { Task } from "../../api";
import { addDays, dayKey, parseDay } from "./planDates";

export function affairDay(value: string) { return value.length === 10 ? value : dayKey(new Date(value)); }
export function rangeTasks(items: Task[], first: string, last: string) {
  return items.filter(item => item.start_date && item.due_date
    && affairDay(item.start_date!) !== affairDay(item.due_date!)
    && affairDay(item.start_date!) <= last && affairDay(item.due_date!) >= first);
}
export function TaskRanges({ items, week, disabled, onOpen }: {
  items: Task[]; week: string; disabled: boolean; onOpen: (id: string) => void;
}) {
  const end = addDays(week, 6);
  const ranges = rangeTasks(items, week, end);
  if (!ranges.length) return null;
  const column = (day: string) => Math.round((parseDay(day).getTime() - parseDay(week).getTime()) / 86400000);
  return <div className="plan-affair-ranges" aria-label={`${week}这一周的办理时间段`}>
    {ranges.slice(0, 2).map((item, index) => {
      const start = affairDay(item.start_date!), finish = affairDay(item.due_date!);
      return <button key={item.id} disabled={disabled} className={`plan-affair-range${item.completed ? " completed" : ""}`}
        style={{ gridColumn: `${column(start < week ? week : start) + 1} / ${column(finish > end ? end : finish) + 2}`, gridRow: index + 1 }}
        title={`${item.title} · ${start} 至 ${finish}`} onClick={() => onOpen(item.id)}>
        {start < week ? "← " : ""}{item.title}{finish > end ? " →" : ""}
      </button>;
    })}
    {ranges.length > 2 && <span className="plan-affair-range-overflow">还有 {ranges.length - 2} 项区间待办，选中日期查看</span>}
  </div>;
}
