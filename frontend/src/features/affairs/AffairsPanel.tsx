import { useEffect, useState } from "react";
import type { Note } from "../../api";
import { Button, Input } from "../../components/ui";
import { instant, phase, type Affair, type AffairsModel } from "./useAffairs";
import "./affairs.css";
import { QuickCapture } from "./QuickCapture";
import { BackupPanel } from "./BackupPanel";
import { AffairDetail } from "./AffairDetail";

function localValue(value: string) {
  if (!value || value.length === 10) return value;
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function TimeField({label, value, onChange}: {label: string; value: string; onChange: (value: string) => void}) {
  const [precise, setPrecise] = useState(value.length > 10);
  return <label>{label}<span className="affair-inline"><input type="checkbox" checked={precise} onChange={e => {setPrecise(e.target.checked); onChange("");}} />具体时刻</span><Input type={precise ? "datetime-local" : "date"} value={localValue(value)} onChange={e => onChange(e.target.value && precise ? new Date(e.target.value).toISOString() : e.target.value)} /></label>;
}
export function AffairsPanel({model, notes, openNote, initial, onDraftChange, createNote, consumeInitial}: {model: AffairsModel; notes: Note[]; openNote: (note: Note) => void; initial: string | null; onDraftChange: (dirty: boolean) => void; createNote: (title: string) => Promise<Note | undefined>; consumeInitial: () => void}) {
  const [draft, setDraft] = useState<Affair | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureDirty, setCaptureDirty] = useState(false);
  const [editing, setEditing] = useState(false);
  const [baseline, setBaseline] = useState("");
  const [filter, setFilter] = useState("全部");
  const [query, setQuery] = useState("");
  const [reminderAt, setReminderAt] = useState("");
  const [reminderLabel, setReminderLabel] = useState("跟进提醒");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [fileError, setFileError] = useState("");
  const dirty = captureDirty || (!!draft && JSON.stringify(draft) !== baseline);
  useEffect(() => {onDraftChange(dirty); return () => onDraftChange(false);}, [dirty, onDraftChange]);
  useEffect(() => { const handler = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } }; window.addEventListener("beforeunload", handler); return () => window.removeEventListener("beforeunload", handler); }, [dirty]);
  function select(item: Affair) {setDraft(structuredClone(item)); setBaseline(JSON.stringify(item)); setReminderAt("");setCapturing(false);setCaptureDirty(false);setEditing(false);}
  useEffect(() => { if (initial) {const found = model.items.find(x => x.id === initial); if (found) {select(found); consumeInitial();}} }, [initial, model.items]);
  useEffect(() => {if (draft?.id && !dirty) {const latest = model.items.find(item => item.id === draft.id); if (latest && latest.version !== draft.version) select(latest);}}, [model.items, draft, dirty]);
  function patch(values: Partial<Affair>) {setDraft(previous => previous ? {...previous, ...values} : previous);}
  async function save() {if (!draft) return; const saved = await model.save(draft); if (saved) select(saved);}
  const filters = ["全部", "待整理", "已整理", "即将开始", "正在办理", "即将截止", "已逾期", "已完成", "已取消"];
  return <section className="affairs"><BackupPanel disabled={dirty || model.busy || noteBusy}/>
    <div className="affair-toolbar"><Input aria-label="搜索信息与事务" placeholder="搜索标题、通知原文或来源…" value={query} onChange={e => setQuery(e.target.value)} /><Button disabled={dirty || model.busy} onClick={() => {setDraft(null);setCapturing(true);setCaptureDirty(false);}}>＋ 快速记录</Button><Button variant="ghost" disabled={dirty || model.busy} onClick={() => void model.refresh()}>刷新</Button></div>
    {model.error && <div className="error" role="alert">{model.error}</div>}
    <div className="task-filters">{filters.map(value => <Button key={value} variant="ghost" aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</Button>)}</div>
    <div className="affair-columns"><div className="affair-list">{model.items.filter(item => (filter === "全部" || phase(item, model.clock) === filter) && `${item.title} ${item.original} ${item.source_name}`.toLowerCase().includes(query.toLowerCase())).map(item => <button key={item.id} className={`affair-card ${draft?.id === item.id ? "selected" : ""}`} disabled={dirty || model.busy} onClick={() => select(item)}><small>{item.kind === "information" ? "信息" : "事务"} · {phase(item, model.clock)}</small><strong>{item.title}</strong><span>{item.summary || item.original || "暂无摘要"}</span><small>{item.ends_at ? `截止 ${localValue(item.ends_at).replace("T", " ")}` : item.source_name || "时间待补充"}</small></button>)}{!model.items.length && <p>先记录一条通知，再安排准备和办理时间。</p>}</div>
    {capturing ? <QuickCapture busy={model.busy} change={setCaptureDirty} cancel={()=>{setCapturing(false);setCaptureDirty(false);}} save={async item=>{const saved=await model.save(item);if(saved)select(saved);return saved;}}/> : draft && !editing ? <AffairDetail key={draft.id} item={draft} items={model.items} select={select} notes={notes} clock={model.clock} busy={model.busy} edit={()=>setEditing(true)} openNote={openNote} save={async item=>{const saved=await model.save(item);if(saved)select(saved);return saved;}}/> : draft ? <form className="affair-editor" onSubmit={e => {e.preventDefault(); void save();}}><fieldset disabled={model.busy || noteBusy}>
      <div className="affair-toolbar"><h2>{draft.id ? "记录详情" : "快速记录"}</h2><Button type="submit" disabled={!draft.title.trim()}>保存</Button><Button type="button" variant="ghost" onClick={() => {setDraft(null); setBaseline("");}}>关闭{dirty ? "并放弃修改" : ""}</Button></div>
      {dirty && <p role="status">有未保存的修改，请保存后再切换页面。</p>}
      <label>标题<Input required maxLength={200} value={draft.title} onChange={e => patch({title: e.target.value})} placeholder="例如：秋季学期选课" /></label>
      <div className="affair-grid"><label>记录类型<select value={draft.kind} onChange={e => patch({kind: e.target.value as Affair["kind"], status: e.target.value === "affair" ? "pending" : "inbox"})}><option value="information">信息收藏</option><option value="affair">需要办理的事务</option></select></label><label>整理 / 办理进度<select value={draft.status} onChange={e => patch({status: e.target.value as Affair["status"]})}><option value="inbox">待整理</option><option value="pending">{draft.kind === "information" ? "已整理" : "待处理"}</option><option value="doing">进行中</option><option value="completed">已完成</option><option value="cancelled">已取消</option></select></label></div>
      <label>通知原文<textarea rows={5} value={draft.original} onChange={e => patch({original: e.target.value})} placeholder="粘贴通知内容，其他信息可以之后补充。" /></label>
      <label>通知截图 / 附件（最多 3 个，每个 2 MB）<input type="file" accept="image/png,image/jpeg,application/pdf,text/plain" onChange={async e => {const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; setFileError(""); if (file.size > 2 * 1024 * 1024 || (draft.attachments?.length ?? 0) >= 3 || !["image/png", "image/jpeg", "application/pdf", "text/plain"].includes(file.type)) {setFileError("请上传不超过 2 MB 的 PNG、JPEG、PDF 或文本，最多 3 个。"); return;} setNoteBusy(true); try {const data = await new Promise<string>((resolve, reject) => {const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("文件读取失败")); reader.readAsDataURL(file);}); patch({attachments: [...(draft.attachments ?? []), {name: file.name, data}]});} catch {setFileError("文件读取失败，请重试。");} finally {setNoteBusy(false);}}} /></label>
      {fileError && <p role="alert">{fileError}</p>}{draft.attachments?.map((file, i) => <div className="affair-toolbar" key={i}><a href={file.data} download={file.name}>{file.name}</a><Button type="button" variant="ghost" onClick={() => patch({attachments: draft.attachments!.filter((_, index) => index !== i)})}>移除附件</Button></div>)}
      <label>摘要与注意事项<textarea rows={2} value={draft.summary} onChange={e => patch({summary: e.target.value})} /></label>
      <div className="affair-grid"><label>来源名称<Input value={draft.source_name} onChange={e => patch({source_name: e.target.value})} placeholder="研究生院 / 班级群" /></label><label>原文或附件链接<Input type="url" value={draft.source_url} onChange={e => patch({source_url: e.target.value})} placeholder="https://…" /></label></div>
      {draft.source_url.startsWith("http") && <a href={draft.source_url} target="_blank" rel="noreferrer">打开来源 ↗</a>}
      <div className="affair-grid" key={draft.id}><TimeField label="通知发布时间" value={draft.published_at} onChange={published_at => patch({published_at})} /><TimeField label="开始时间" value={draft.starts_at} onChange={starts_at => patch({starts_at})} /><TimeField label="截止时间" value={draft.ends_at} onChange={ends_at => patch({ends_at})} /></div>
      <label className="affair-inline"><input type="checkbox" checked={draft.time_uncertain} onChange={e => patch({time_uncertain: e.target.checked})} />时间待确认，之后需要跟进</label>
      <h3>关联笔记</h3><div className="affair-notes">{notes.map(note => <div key={note.id}><label className="affair-inline"><input type="checkbox" checked={draft.note_ids.includes(note.id)} onChange={e => patch({note_ids: e.target.checked ? [...draft.note_ids, note.id] : draft.note_ids.filter(id => id !== note.id)})} />{note.title}</label>{draft.note_ids.includes(note.id) && <><p>{note.content.slice(0, 180) || "空白笔记"}</p><Button type="button" variant="ghost" disabled={dirty} onClick={() => openNote(note)}>打开笔记</Button></>}</div>)}</div>
      {draft.note_ids.some(id => !notes.some(n => n.id === id)) && <p>部分关联笔记已删除，可清理失效关联。<Button type="button" variant="ghost" onClick={() => patch({note_ids: draft.note_ids.filter(id => notes.some(n => n.id === id))})}>清理</Button></p>}
      <div className="affair-toolbar"><Input aria-label="新关联笔记标题" placeholder="新建准备笔记的标题" value={noteTitle} onChange={e => setNoteTitle(e.target.value)} /><Button type="button" disabled={!noteTitle.trim()} onClick={async () => {setNoteBusy(true); try {const note = await createNote(noteTitle); if (note) {patch({note_ids: [...draft.note_ids, note.id]}); setNoteTitle("");}} finally {setNoteBusy(false);}}}>新建并关联</Button></div>
      <h3>提醒安排</h3><p>Windows 桌面版留在托盘运行时可发送系统通知；完全退出或关机后停止，重新运行后补查。网页版显示应用内提醒。时间按当前设备时区填写。</p>
      <div className="affair-toolbar">{([{anchor: "starts_at", offset: 0, label: "开始时提醒"}, {anchor: "starts_at", offset: 1440, label: "提前一天准备"}, {anchor: "ends_at", offset: 1440, label: "截止前一天"}, {anchor: "ends_at", offset: 60, label: "截止前一小时"}] as const).map(rule => <Button key={rule.label} type="button" variant="ghost" disabled={!draft[rule.anchor]} onClick={() => patch({reminders: [...draft.reminders, {at: new Date(instant(draft[rule.anchor], rule.anchor === "ends_at") - rule.offset * 60000).toISOString(), label: rule.label, acknowledged: false, anchor: rule.anchor, offset_minutes: rule.offset, timezone_offset: new Date(instant(draft[rule.anchor])).getTimezoneOffset()}]})}>{rule.label}</Button>)}</div><p>相对提醒随时间修改自动调整；仅日期按当地零点开始、23:59 截止提醒。</p>
      {draft.reminders.map((reminder, i) => <div className="affair-toolbar" key={i}><span>{reminder.label} · {localValue(reminder.at).replace("T", " ")} {reminder.acknowledged ? "（已确认）" : ""}</span><Button type="button" variant="ghost" onClick={() => patch({reminders: draft.reminders.filter((_, index) => index !== i)})}>移除</Button></div>)}
      <div className="affair-grid"><label>提醒内容<Input value={reminderLabel} maxLength={100} onChange={e => setReminderLabel(e.target.value)} /></label><label>提醒时间<Input type="datetime-local" value={reminderAt} onChange={e => setReminderAt(e.target.value)} /></label></div><Button type="button" variant="ghost" disabled={!reminderAt} onClick={() => {patch({reminders: [...draft.reminders, {at: new Date(reminderAt).toISOString(), label: reminderLabel || "提醒", acknowledged: false}]}); setReminderAt("");}}>添加提醒</Button>
      <label>完成标准<Input value={draft.completion_criteria} onChange={e => patch({completion_criteria: e.target.value})} placeholder="例如：选课系统显示提交成功" /></label><label>办理凭证 / 结果记录<textarea rows={2} value={draft.proof} onChange={e => patch({proof: e.target.value})} placeholder="确认编号、凭证链接或结果说明" /></label>
      {!!draft.history.length && <details><summary>时间修改记录（{draft.history.length}）</summary>{draft.history.map((entry, i) => <div key={i}><small>{localValue(entry.at)}</small>{Object.entries(entry.changes).map(([key, change]) => <p key={key}>{({published_at: "发布时间", starts_at: "开始时间", ends_at: "截止时间"} as Record<string,string>)[key]}：{localValue(change.before || "") || "未设置"} → {localValue(change.after || "") || "未设置"}</p>)}</div>)}</details>}
      {draft.id && <small>记录于 {localValue(draft.created_at).replace("T", " ")}</small>}
    </fieldset></form> : <div className="affair-placeholder"><h2>把通知变成有安排的事情</h2><p>选择一条记录，或从快速记录开始。</p><p>信息可以随时转为事务，并关联你的准备笔记。</p></div>}</div>
  </section>;
}



