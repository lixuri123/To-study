import { useState } from "react";
import type { Note, Task } from "../../api";
import { Button } from "../../components/ui";
import { WindowReminderEditor } from "../affairs/WindowReminderEditor";
import type { WindowRule } from "../affairs/useAffairs";
import type { TasksModel } from "./useTasks";

export function TaskWindowEditor({ task, model, notes, onClose }: { task: Task; model: TasksModel; notes: Note[]; onClose: () => void }) {
  const start = task.start_date ?? "";
  const end = task.due_date ?? "";
  const [rule, setRule] = useState<WindowRule | null>(task.window_rule ?? null);
  const [noteIds, setNoteIds] = useState(task.note_ids ?? []);
  const pending = model.pending.has(task.id);
  const valid = (!start || !end || start <= end) && (!rule || !!start && !!end && !!rule.clock);
  return <form className="task-window-editor" onSubmit={async event => {
    event.preventDefault();
    if (valid && await model.patchTask(task, {window_rule: rule, note_ids: noteIds})) onClose();
  }}><fieldset disabled={pending}>
    <strong>提醒与笔记 · {task.title}</strong>
    <p>截止：{start && end ? `${start} — ${end}` : end || "未设置"}。日期请在待办行的截止日期入口选择。</p>
    <WindowReminderEditor subject="待办" item={{kind: "affair", starts_at: start, ends_at: end, window_rule: rule}} onChange={setRule} />
    <details className="task-window-notes"><summary>关联准备笔记（可选）</summary>{notes.map(note => <label key={note.id}><input type="checkbox" checked={noteIds.includes(note.id)} onChange={event => setNoteIds(event.target.checked ? [...noteIds, note.id] : noteIds.filter(id => id !== note.id))} />{note.title}</label>)}</details>
    {!valid && <p role="alert">开始日期不能晚于截止日期；区间提醒需要完整日期与提醒钟点。</p>}
    <div className="task-window-actions"><Button disabled={!valid} type="submit">保存</Button><Button type="button" variant="ghost" onClick={onClose}>取消</Button></div>
  </fieldset></form>;
}
