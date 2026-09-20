import { useEffect, useRef, useState } from "react";
import { api, type Task } from "../../api";
import type { WorkspaceActions } from "../../layouts/useWorkspaceActions";

export type TaskFilter = "全部" | "未完成" | "已完成" | "今天" | "已逾期";
type Retry = { message: string; action: () => Promise<void> };

function localDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function useTasks(actions: WorkspaceActions) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<TaskFilter>("全部");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [errors, setErrors] = useState<Record<string, Retry>>({});
  const running = useRef(new Set<string>());
  const [today, setToday] = useState(localDate);
  useEffect(() => {
    const refresh = () => setToday(localDate());
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);

  async function request(key: string, action: () => Promise<void>) {
    if (running.current.has(key) || actions.busy) return;
    running.current.add(key);
    setPending((current) => new Set(current).add(key));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    try {
      await action();
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [key]: { message: error instanceof Error ? error.message : "操作失败，请重试。", action },
      }));
    } finally {
      running.current.delete(key);
      setPending((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  function addTask() {
    const title = taskTitle.trim();
    const enteredTitle = taskTitle;
    const enteredDate = taskDueDate;
    if (!title) return;
    void request("new", async () => {
      const task = await api<Task>("/tasks", "POST", { title, due_date: taskDueDate || null });
      setTasks((previous) => [task, ...previous]);
      setTaskTitle(current => current === enteredTitle ? "" : current);
      setTaskDueDate(current => current === enteredDate ? "" : current);
    });
  }

  function patchTask(task: Task, patch: Partial<Pick<Task, "title" | "completed" | "due_date">>) {
    return request(task.id, async () => {
      const updated = await api<Task>(`/tasks/${task.id}`, "PATCH", patch);
      setTasks((previous) => previous.map((item) => item.id === task.id ? updated : item));
    });
  }

  function toggleTask(task: Task) { void patchTask(task, { completed: !task.completed }); }
  function editTitle(task: Task, title: string) {
    const trimmed = title.trim();
    return !trimmed || trimmed === task.title ? Promise.resolve() : patchTask(task, { title: trimmed });
  }
  function editDueDate(task: Task, dueDate: string) {
    const value = dueDate || null;
    return value === task.due_date ? Promise.resolve() : patchTask(task, { due_date: value });
  }
  function deleteTask(task: Task) {
    actions.setConfirm({
      title: "删除这条待办？",
      description: `“${task.title}”将被删除，此操作无法撤销。`,
      label: "删除待办",
      action: () => void request(task.id, async () => {
        await api(`/tasks/${task.id}`, "DELETE");
        setTasks((previous) => previous.filter((item) => item.id !== task.id));
      }),
    });
  }
  function retryTask(key: string) {
    const retry = errors[key];
    if (retry) void request(key, retry.action);
  }

  const visibleTasks = tasks.map((task, index) => ({ task, index })).filter(({ task }) => {
    if (filter === "未完成") return !task.completed;
    if (filter === "已完成") return task.completed;
    if (filter === "今天") return !task.completed && task.due_date === today;
    if (filter === "已逾期") return !task.completed && !!task.due_date && task.due_date < today;
    return true;
  }).sort((a, b) => {
    if (a.task.completed !== b.task.completed) return a.task.completed ? 1 : -1;
    if (!!a.task.due_date !== !!b.task.due_date) return a.task.due_date ? -1 : 1;
    if (a.task.due_date !== b.task.due_date) return (a.task.due_date ?? "").localeCompare(b.task.due_date ?? "");
    return a.index - b.index;
  }).map(({ task }) => task);
  const complete = tasks.filter((task) => task.completed).length;
  return {
    tasks, setTasks, filter, setFilter, taskTitle, setTaskTitle, taskDueDate, setTaskDueDate,
    visibleTasks, complete, pending, errors, today, hasPending: pending.size > 0,
    addTask, toggleTask, editTitle, editDueDate, deleteTask, retryTask,
  };
}
export type TasksModel = ReturnType<typeof useTasks>;
