import { ReliabilityPanel } from "./ReliabilityPanel";
import { NoticeContext } from "./NoticeContext";
import type { Note } from "../../api";
import { Button } from "../../components/ui";
import { phase, type Affair } from "./useAffairs";

export function displayTime(value: string) {return value.length===10 ? value : value ? new Date(value).toLocaleString("zh-CN",{hour12:false}) : "待确认";}

export function AffairDetail({item, items, select, notes, clock, busy, edit, save, openNote}: {item: Affair; items: Affair[]; select: (item: Affair) => void; notes: Note[]; clock: number; busy: boolean; edit: () => void; save: (item: Affair) => Promise<unknown>; openNote: (note: Note) => void}) {
  const pending = item.reminders.filter(r=>!r.acknowledged).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  const related = item.kind === "information" ? items.filter(x=>x.source_information_id===item.id) : [];
  const noteIds = [...new Set([item,...related].flatMap(x=>x.note_ids))];
  const done=["completed","cancelled"].includes(item.status);
  return <article className="affair-editor affair-detail"><div className="affair-toolbar"><small>{item.kind==="information"?"信息":"事务"} · {phase(item,clock)}</small><Button variant="ghost" disabled={busy} onClick={edit}>编辑全部信息</Button></div>
    <h2>{item.title}</h2><small>最近修改：{item.last_actor === "agent" ? "Agent" : "手动记录"}</small>{item.summary&&<p>{item.summary}</p>}
    <NoticeContext item={item} items={items} select={select} busy={busy} clock={clock}/>
    <ReliabilityPanel key={`${item.id}:${item.version}`} item={item} items={items} busy={busy} save={save}/>
    <div className="next-action"><small>{done?"办理结果":"下一步"}</small><h3>{done ? item.status==="completed"?"已完成":"已取消" : item.kind==="information" ? "决定这条信息是否需要办理" : item.completion_criteria || item.title}</h3>{!done&&pending[0]&&<p>下次提醒：{displayTime(pending[0].at)} · {pending[0].label}</p>}
    <div className="affair-toolbar">{item.kind==="information" ? <><Button disabled={busy} onClick={()=>void save({...item,kind:"affair",status:"pending"})}>需要办理</Button><Button variant="ghost" disabled={busy||item.status==="pending"} onClick={()=>void save({...item,status:"pending"})}>只收藏</Button></> : <Button disabled={busy} onClick={()=>void save({...item,status:done?"pending":"completed"})}>{done?"重新打开":"标记完成"}</Button>}
    {!done&&<Button variant="ghost" disabled={busy} onClick={()=>void save({...item,reminders:[...item.reminders,{at:new Date(Date.now()+86400000).toISOString(),label:"跟进这件事",acknowledged:false,anchor:"custom"}]})}>明天提醒我</Button>}</div></div>
    <div className="affair-time-summary"><div><small>开始</small><strong>{displayTime(item.starts_at)}</strong></div><div><small>截止</small><strong>{displayTime(item.ends_at)}</strong></div></div>{item.time_uncertain&&<p>时间尚未确认，可以先设置跟进提醒。</p>}
    <h3>准备笔记</h3>{noteIds.length ? noteIds.map(id=>{const note=notes.find(n=>n.id===id);return note?<div className="note-preview" key={id}><Button variant="ghost" disabled={busy} onClick={()=>openNote(note)}>{note.title} ↗</Button><p>{note.content.slice(0,160)}</p></div>:<p key={id}>关联笔记已删除</p>;}) : <p>还没有关联笔记。<Button variant="ghost" disabled={busy} onClick={edit}>添加关联</Button></p>}
    {!!pending.length&&<details><summary>全部提醒（{pending.length}）</summary>{pending.map((r,i)=><p key={i}>{displayTime(r.at)} · {r.label}</p>)}</details>}
    <details><summary>通知原文与来源</summary><p>{item.source_name||"未填写来源"} · 发布：{displayTime(item.published_at)}</p>{/^https?:\/\//.test(item.source_url)&&<a href={item.source_url} target="_blank" rel="noreferrer">打开来源 ↗</a>}<p className="original-text">{item.original||"暂无原文"}</p></details>
    {!!item.attachments?.length&&<details><summary>附件（{item.attachments.length}）</summary>{item.attachments.map((file,i)=><p key={i}><a href={file.data} download={file.name}>{file.name}</a></p>)}</details>}
    <details><summary>办理凭证与更多信息</summary><p className="original-text">{item.proof||"暂无凭证，可在编辑中补充。"}</p><p>录入：{displayTime(item.created_at)} · 更新：{displayTime(item.updated_at)}</p>{item.history.map((entry,i)=><div key={i}><small>{displayTime(entry.at)}</small>{Object.entries(entry.changes).map(([key,value])=><p key={key}>{({starts_at:"开始时间",ends_at:"截止时间",published_at:"发布时间"} as Record<string,string>)[key]||key}：{displayTime(value.before||"")} → {displayTime(value.after||"")}</p>)}</div>)}</details>
  </article>;
}



