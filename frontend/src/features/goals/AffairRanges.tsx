import type { Affair } from "../affairs/useAffairs";
import { addDays, dayKey, parseDay } from "./planDates";

export function affairDay(value: string) { return value.length === 10 ? value : dayKey(new Date(value)); }
export function rangeAffairs(items: Affair[], first: string, last: string) {
  return items.filter(item => item.kind === "affair" && item.status !== "cancelled" && item.starts_at && item.ends_at
    && affairDay(item.starts_at) !== affairDay(item.ends_at)
    && affairDay(item.starts_at) <= last && affairDay(item.ends_at) >= first);
}
export function AffairRanges({ items, week, disabled, onOpen }: {
  items: Affair[]; week: string; disabled: boolean; onOpen: (id: string) => void;
}) {
  const end = addDays(week, 6);
  const ranges = rangeAffairs(items, week, end);
  if (!ranges.length) return null;
  const column = (day: string) => Math.round((parseDay(day).getTime() - parseDay(week).getTime()) / 86400000);
  return <div className="plan-affair-ranges" aria-label={`${week}这一周的办理时间段`}>
    {ranges.slice(0, 2).map((item, index) => {
      const start = affairDay(item.starts_at), finish = affairDay(item.ends_at);
      return <button key={item.id} disabled={disabled} className={`plan-affair-range${item.status === "completed" ? " completed" : ""}`}
        style={{ gridColumn: `${column(start < week ? week : start) + 1} / ${column(finish > end ? end : finish) + 2}`, gridRow: index + 1 }}
        title={`${item.title} · ${start} 至 ${finish}`} onClick={() => onOpen(item.id)}>
        {start < week ? "← " : ""}{item.title}{finish > end ? " →" : ""}
      </button>;
    })}
    {ranges.length > 2 && <span className="plan-affair-range-overflow">还有 {ranges.length - 2} 项区间事务，选中日期查看</span>}
  </div>;
}
