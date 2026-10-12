import { useCallback, useEffect, useState } from "react";
import { CheckCheck, Clock3, LayoutGrid, List, LoaderCircle, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button, Input } from "../../components/ui";
import type { Note, Task } from "../../api";
import type { TasksModel } from "./useTasks";
import "./tasks.css";
import { TaskWindowEditor } from "./TaskWindowEditor";
import { DeadlinePicker } from "./DeadlinePicker";

function TaskRow({ task, model, busy, notes, openNote, onEditorChange }: { task: Task; model: TasksModel; busy: boolean; notes: Note[]; openNote: (note: Note) => void; onEditorChange: (id: string, open: boolean) => void }) {
  const [editing, setEditing] = useState(false);
  const [windowOpen, setWindowOpen] = useState(false);
  useEffect(() => { onEditorChange(task.id, windowOpen); return () => {onEditorChange(task.id, false); onEditorChange(`${task.id}-deadline`, false);} }, [windowOpen, task.id, onEditorChange]);
  const [title, setTitle] = useState(task.title);
  const rowPending = model.pending.has(task.id);
  const error = model.errors[task.id];
  const disabled = busy || rowPending || windowOpen;
  const tomorrow = new Date(`${model.today}T12:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,"0")}-${String(tomorrow.getDate()).padStart(2,"0")}`;
  const isRange = !!task.start_date && !!task.due_date && task.start_date < task.due_date;
  const dueLabel = !task.due_date ? "" : !task.completed && task.due_date < model.today ? "已逾期" : isRange ? `${task.start_date} — ${task.due_date}` : task.due_date === model.today ? "今天" : task.due_date === tomorrowKey ? "明天" : task.due_date;
  function cancel() { setTitle(task.title); setEditing(false); }
  function save() {
    if (!title.trim()) return cancel();
    setEditing(false);
    void model.editTitle(task, title);
  }
  return <div className="task-item" id={`task-${task.id}`}><div className={`task-row ${task.completed ? "completed" : ""}`}>
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
    <DeadlinePicker start={task.start_date} end={task.due_date} disabled={disabled} label={`${task.title}的截止日期`} onOpenChange={open => onEditorChange(`${task.id}-deadline`, open)} onSave={(start_date, due_date) => model.patchTask(task, {start_date, due_date, ...(!start_date || !due_date ? {window_rule: null} : {})})} />
    <Button variant="ghost" aria-label={`${task.title}的提醒与笔记`} disabled={disabled} onClick={() => setWindowOpen(value => !value)}><Clock3 size={16} /></Button>
    {rowPending ? <LoaderCircle className="spin task-spinner" aria-label={`${task.title}处理中`} size={16} /> : error ? <Button variant="ghost" aria-label={`重试待办操作：${task.title}`} onClick={() => model.retryTask(task.id)}><RotateCcw size={16} /></Button> : <Button variant="ghost" aria-label={`删除待办：${task.title}`} disabled={busy} onClick={() => model.deleteTask(task)}><Trash2 size={16} /></Button>}
  </div>{windowOpen && <TaskWindowEditor key={`${task.id}:${task.start_date}:${task.due_date}`} task={task} model={model} notes={notes} onClose={() => setWindowOpen(false)} />}{!windowOpen && !!task.note_ids?.length && <div className="task-linked-notes">{task.note_ids.map(id => {const note = notes.find(item => item.id === id); return note && <button key={id} disabled={disabled} onClick={() => openNote(note)}>{note.title} ↗</button>;})}</div>}</div>;
}

export function TasksPanel({ model, busy, notes, openNote, initial, consumeInitial, onDraftChange }: { model: TasksModel; busy: boolean; notes: Note[]; openNote: (note: Note) => void; initial: string | null; consumeInitial: () => void; onDraftChange: (dirty: boolean) => void }) {
  const { tasks, filter, setFilter, taskTitle, setTaskTitle, taskDueDate, setTaskDueDate, taskStartDate, setTaskStartDate, visibleTasks, complete, addTask } = model;
  const addPending = model.pending.has("new");
  const [view, setView] = useState<"cards" | "list">(() => {
    try { return localStorage.getItem("qingjian:task-view") === "list" ? "list" : "cards"; } catch { return "cards"; }
  });
  function changeView(next: "cards" | "list") { setView(next); try {localStorage.setItem("qingjian:task-view", next);} catch { /* Storage may be unavailable. */ } }
  const [openEditors, setOpenEditors] = useState<Set<string>>(() => new Set());
  const onEditorChange = useCallback((id: string, open: boolean) => setOpenEditors(current => { if (current.has(id) === open) return current; const next = new Set(current); if (open) next.add(id); else next.delete(id); return next; }), []);
  useEffect(() => { onDraftChange(openEditors.size > 0); return () => onDraftChange(false); }, [openEditors, onDraftChange]);
  useEffect(() => { if (initial) { model.setFilter(model.tasks.find(task => task.id === initial)?.completed ? "已完成" : "全部"); const timer = window.setTimeout(() => {document.getElementById(`task-${initial}`)?.scrollIntoView({block: "center", behavior: "smooth"}); consumeInitial();}, 0); return () => window.clearTimeout(timer); } }, [initial]);
  return <section className={`task-panel task-view-${view}`}>
    <div className="task-overview"><h2>待办清单</h2><p><strong>{tasks.length - complete}</strong> 项待处理 · {complete} 项已完成</p></div>
    <form className="task-add" onSubmit={(event) => { event.preventDefault(); addTask(); }}>
      <Plus size={20} />
      <Input aria-label="新待办" placeholder="添加一件想完成的小事…" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} disabled={busy || addPending} />
      <DeadlinePicker newTask start={taskStartDate} end={taskDueDate} disabled={busy || addPending} label="新待办截止日期" onOpenChange={open => onEditorChange("new-deadline", open)} onSave={(start, end) => {setTaskStartDate(start ?? ""); setTaskDueDate(end ?? ""); return true;}} />
      <Button disabled={busy || addPending || openEditors.size > 0 || !taskTitle.trim()}>{addPending ? <LoaderCircle size={16} className="spin" /> : null}添加待办</Button>
      {model.errors.new && <span className="task-error add-error" role="alert">{model.errors.new.message}<Button variant="ghost" type="button" onClick={() => model.retryTask("new")}>重试</Button></span>}
    </form>
    <div className="task-browse-toolbar"><div className="task-filters">
      {(["全部", "未完成", "已完成", "今天", "已逾期"] as const).map((value) => <Button key={value} variant="ghost" aria-pressed={filter === value} className={filter === value ? "chosen" : ""} disabled={openEditors.size > 0} onClick={() => setFilter(value)}>{value}</Button>)}
    </div><div className="task-view-switch" role="group" aria-label="待办视图"><button type="button" aria-pressed={view === "cards"} disabled={openEditors.size > 0} onClick={() => changeView("cards")}><LayoutGrid size={14} />卡片</button><button type="button" aria-pressed={view === "list"} disabled={openEditors.size > 0} onClick={() => changeView("list")}><List size={14} />列表</button></div></div>
    <div className="task-list">
      {visibleTasks.map((task) => <TaskRow task={task} model={model} busy={busy} notes={notes} openNote={openNote} onEditorChange={onEditorChange} key={task.id} />)}
      {!visibleTasks.length && <div className="empty task-empty"><CheckCheck size={24} /><h3>{filter === "已完成" ? "还没有已完成的待办" : "这里没有待处理的待办"}</h3>{filter !== "已完成" && complete > 0 && <p>已完成的 {complete} 项可在「已完成」中查看。</p>}</div>}
    </div>
  </section>;
}
