import { useState } from "react";
import { CheckCheck, LoaderCircle, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button, Input } from "../../components/ui";
import type { Task } from "../../api";
import type { TasksModel } from "./useTasks";
import "./tasks.css";

function TaskRow({ task, model, busy }: { task: Task; model: TasksModel; busy: boolean }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const rowPending = model.pending.has(task.id);
  const error = model.errors[task.id];
  const disabled = busy || rowPending;
  const tomorrow = new Date(`${model.today}T12:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,"0")}-${String(tomorrow.getDate()).padStart(2,"0")}`;
  const dueLabel = !task.due_date ? "" : !task.completed && task.due_date < model.today ? "已逾期" : task.due_date === model.today ? "今天" : task.due_date === tomorrowKey ? "明天" : task.due_date;
  function cancel() { setTitle(task.title); setEditing(false); }
  function save() {
    if (!title.trim()) return cancel();
    setEditing(false);
    void model.editTitle(task, title);
  }
  return <div className={`task-row ${task.completed ? "completed" : ""}`}>
    <input type="checkbox" aria-label={task.title} checked={task.completed} disabled={disabled} onChange={() => model.toggleTask(task)} />
    <div className="task-content">
      {editing ? <Input
        aria-label="编辑待办标题" autoFocus value={title} disabled={disabled}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") { event.preventDefault(); save(); }
          if (event.key === "Escape") { event.preventDefault(); cancel(); }
        }}
      /> : <button className="task-title" disabled={disabled} onClick={() => { setTitle(task.title); setEditing(true); }}>{task.title}</button>}
      {dueLabel && <small className={`task-due-label ${dueLabel === "已逾期" ? "overdue" : ""}`}>{dueLabel}</small>}
      {error && <span className="task-error" role="alert">{error.message}</span>}
    </div>
    <input
      className="task-date" type="date" aria-label={`${task.title}的截止日期`}
      value={task.due_date ?? ""} disabled={disabled}
      onChange={(event) => void model.editDueDate(task, event.target.value)}
    />
    {rowPending ? <LoaderCircle className="spin task-spinner" aria-label={`${task.title}处理中`} size={16} /> : error ? <Button variant="ghost" aria-label={`重试待办操作：${task.title}`} onClick={() => model.retryTask(task.id)}><RotateCcw size={16} /></Button> : <Button variant="ghost" aria-label={`删除待办：${task.title}`} disabled={busy} onClick={() => model.deleteTask(task)}><Trash2 size={16} /></Button>}
  </div>;
}

export function TasksPanel({ model, busy }: { model: TasksModel; busy: boolean }) {
  const { tasks, filter, setFilter, taskTitle, setTaskTitle, taskDueDate, setTaskDueDate, visibleTasks, complete, addTask } = model;
  const addPending = model.pending.has("new");
  return <section className="task-panel">
    <div className="task-heading"><div><h2>今天也在前进</h2><p>已完成 {complete} / {tasks.length} 项</p></div><span>{tasks.length ? Math.round((complete / tasks.length) * 100) : 0}<small>%</small></span></div>
    <div className="progress"><div style={{ width: `${tasks.length ? (complete / tasks.length) * 100 : 0}%` }} /></div>
    <form className="task-add" onSubmit={(event) => { event.preventDefault(); addTask(); }}>
      <Plus size={20} />
      <Input aria-label="新待办" placeholder="添加一件想完成的小事…" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} disabled={busy || addPending} />
      <Input className="task-new-date" type="date" aria-label="新待办截止日期" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} disabled={busy || addPending} />
      <Button disabled={busy || addPending || !taskTitle.trim()}>{addPending ? <LoaderCircle size={16} className="spin" /> : null}添加待办</Button>
      {model.errors.new && <span className="task-error add-error" role="alert">{model.errors.new.message}<Button variant="ghost" type="button" onClick={() => model.retryTask("new")}>重试</Button></span>}
    </form>
    <div className="task-filters">
      {(["全部", "未完成", "已完成", "今天", "已逾期"] as const).map((value) => <Button key={value} variant="ghost" aria-pressed={filter === value} className={filter === value ? "chosen" : ""} onClick={() => setFilter(value)}>{value}</Button>)}
    </div>
    <div className="task-list">
      {visibleTasks.map((task) => <TaskRow task={task} model={model} busy={busy} key={task.id} />)}
      {!visibleTasks.length && <div className="empty"><CheckCheck size={32} /><h3>{filter === "已完成" ? "完成的事，会在这里相遇。" : filter === "未完成" ? "这一页，已经轻轻完成。" : "从一件小事开始。"}</h3><p>给自己一点时间，按自己的节奏来。</p></div>}
    </div>
  </section>;
}
