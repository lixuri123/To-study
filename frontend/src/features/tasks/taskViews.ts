import type { Task } from "../../api";

export type TaskFilter = "全部" | "未完成" | "已完成" | "今天" | "已逾期";

export function selectTasks(tasks: Task[], filter: TaskFilter, today: string) {
  return tasks.map((task, index) => ({ task, index })).filter(({ task }) => {
    if (filter === "已完成") return task.completed;
    if (task.completed) return false;
    if (filter === "今天") return task.due_date === today || !!task.start_date && task.start_date <= today && !!task.due_date && task.due_date >= today;
    if (filter === "已逾期") return !!task.due_date && task.due_date < today;
    return true;
  }).sort((a, b) => {
    if (!!a.task.due_date !== !!b.task.due_date) return a.task.due_date ? -1 : 1;
    if (a.task.due_date !== b.task.due_date) return (a.task.due_date ?? "").localeCompare(b.task.due_date ?? "");
    return a.index - b.index;
  }).map(({ task }) => task);
}
