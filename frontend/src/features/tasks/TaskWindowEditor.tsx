import { useState } from "react";
import type { Note, Task } from "../../api";
import { Button, Input } from "../../components/ui";
import { WindowReminderEditor } from "../affairs/WindowReminderEditor";
import type { WindowRule } from "../affairs/useAffairs";
import type { TasksModel } from "./useTasks";

export function TaskWindowEditor({ task, model, notes, onClose }: { task: Task; model: TasksModel; notes: Note[]; onClose: () => void }) {
  const [start, setStart] = useState(task.start_date ?? "");
  const [end, setEnd] = useState(task.due_date ?? "");
  const [rule, setRule] = useState<WindowRule | null>(task.window_rule ?? null);
  const [noteIds, setNoteIds] = useState(task.note_ids ?? []);
  const pending = model.pending.has(task.id);
  const valid = (!start || !end || start <= end) && (!rule || !!start && !!end && !!rule.clock);
  return <form className="task-window-editor" onSubmit={async event => {
    event.preventDefault();
    if (valid && await model.patchTask(task, {start_date: start || null, due_date: end || null, window_rule: rule, note_ids: noteIds})) onClose();
  }}><fieldset disabled={pending}>
    <strong>时间与提醒 · {task.title}</strong>
    <div className="task-window-dates"><label>开始日期（可选）<Input type="date" value={start} onChange={event => setStart(event.target.value)} /></label><label>截止日期<Input type="date" value={end} onChange={event => setEnd(event.target.value)} /></label></div>
    <WindowReminderEditor subject="待办" item={{kind: "affair", starts_at: start, ends_at: end, window_rule: rule}} onChange={setRule} />
    <details className="task-window-notes"><summary>关联准备笔记（可选）</summary>{notes.map(note => <label key={note.id}><input type="checkbox" checked={noteIds.includes(note.id)} onChange={event => setNoteIds(event.target.checked ? [...noteIds, note.id] : noteIds.filter(id => id !== note.id))} />{note.title}</label>)}</details>
    {!valid && <p role="alert">开始日期不能晚于截止日期；区间提醒需要完整日期与提醒钟点。</p>}
    <div className="task-window-actions"><Button disabled={!valid} type="submit">保存</Button><Button type="button" variant="ghost" onClick={onClose}>取消</Button></div>
  </fieldset></form>;
}
