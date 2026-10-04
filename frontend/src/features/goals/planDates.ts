export interface Checkin {
  id: string;
  day: string;
  status: "done" | "partial" | "skipped";
  amount: number;
  memo: string;
  note_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Plan {
  id: string;
  title: string;
  kind: "once" | "weekdays" | "weekly";
  start_date: string;
  end_date: string | null;
  weekdays: number[];
  weekly_target: number | null;
  target_amount: number;
  unit: string;
  goal_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  checkins: Checkin[];
}

export interface PlanInput {
  title: string;
  kind: Plan["kind"];
  start_date: string;
  end_date: string | null;
  weekdays: number[];
  weekly_target: number | null;
  target_amount: number;
  unit: string;
  goal_id: string | null;
}

export function dayKey(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}
export function parseDay(day: string) { return new Date(`${day}T12:00:00`); }
export function addDays(day: string, count: number) {
  const value = parseDay(day);
  value.setDate(value.getDate() + count);
  return dayKey(value);
}
export function weekStart(day: string) { return addDays(day, -(parseDay(day).getDay() + 6) % 7); }
export function monthStart(day: string) { return day.slice(0, 7) + "-01"; }
export function monthEnd(day: string) {
  const value = parseDay(monthStart(day));
  value.setMonth(value.getMonth() + 1, 0);
  return dayKey(value);
}
export function planActive(plan: Plan, day: string) {
  return day >= plan.start_date && (!plan.end_date || day <= plan.end_date)
    && !plan.archived_at;
}
export function scheduled(plan: Plan, day: string) {
  if (!planActive(plan, day)) return false;
  if (plan.kind === "once") return day === plan.start_date;
  if (plan.kind === "weekly") return true;
  return plan.weekdays.includes((parseDay(day).getDay() + 6) % 7);
}
export function checkinOn(plan: Plan, day: string) { return plan.checkins.find(item => item.day === day); }
export function weeklyDone(plan: Plan, day: string) {
  const first = weekStart(day), last = addDays(first, 6);
  return plan.checkins.filter(item => item.day >= first && item.day <= last && item.status === "done").length;
}
