import { useEffect, useState } from "react";
import { api } from "../../api";
import { Button } from "../../components/ui";
import { phase, type Affair } from "./useAffairs";

const time = (value: string) => value.length === 10 ? value : new Date(value).toLocaleString("zh-CN", {hour12:false});
const operations: Record<string,string> = {capture_information:"保存通知", create_affair:"创建事务", create_note:"创建笔记", link_note:"调整笔记关联", set_reminder:"调整提醒", update_affair:"更新事务", record_capture_attempt:"记录采集结果"};
type Receipt = {request_id:string; created_at:string; operation:string; undoable?:boolean;undone?:boolean;record:{title?:string;version?:number}};

export function NoticeContext({item, items, select, busy, clock}: {item:Affair;items:Affair[];select:(item:Affair)=>void;busy:boolean;clock:number}) {
  const source = items.find(x=>x.id===item.source_information_id);
  const children = item.kind === "information" ? items.filter(x=>x.source_information_id===item.id) : [];
  const group = [item,...children];
  const reminders = group.filter(x=>!["completed","cancelled"].includes(x.status)).flatMap(x=>x.reminders.filter(r=>!r.acknowledged).map(r=>({...r,title:x.title}))).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  const [receipts,setReceipts]=useState<Receipt[]>([]);
  const [error,setError]=useState("");
  const [expanded,setExpanded]=useState(false);
  const [next,setNext]=useState<number|null>(null);
  const [loading,setLoading]=useState(false);
  const [copy,setCopy]=useState("");
  const [retryOpen,setRetryOpen]=useState(false);
  const [chosen,setChosen]=useState<string[]>([]);
  const [undoPreview,setUndoPreview]=useState<{title:string;action:string}[]|null>(null);
  const [undoBusy,setUndoBusy]=useState(false);
  async function undo(preview:boolean) {
    setUndoBusy(true);setError("");
    try {
      const result=await api<{changes:{title:string;action:string}[]}>("/agent/undo","POST",{request_ids:chosen,preview});
      if(preview)setUndoPreview(result.changes);
      else{setUndoPreview(null);setChosen([]);setExpanded(false);window.dispatchEvent(new Event("focus"));}
    } catch(e){setError(e instanceof Error?e.message:"撤销失败");setUndoPreview(null);}
    finally{setUndoBusy(false);}
  }
  const revision=group.map(x=>`${x.id}:${x.version}`).join(",");
  useEffect(()=>{setExpanded(false);setCopy("");setRetryOpen(false);},[item.id]);
  useEffect(()=>{
    if(!expanded)return;
    let current=true;setLoading(true);setError("");setReceipts([]);setNext(null);
    api<{items:Receipt[];next_offset:number|null}>(`/agent/receipts?record_id=${encodeURIComponent(item.id)}`).then(data=>{if(current){setReceipts(data.items);setNext(data.next_offset);}}).catch(e=>{if(current)setError(e.message);}).finally(()=>{if(current)setLoading(false);});
    return()=>{current=false;};
  },[item.id,revision,expanded]);
  const capture=item.capture;
  const retry=`请继续整理青笺信息 ${item.id}。先读取该记录及关联事务，复用现有记录避免重复。来源：${item.source_url || "请向我索取来源"}。上次状态：${capture?.state||"未核验"}；缺失项：${capture?.missing.join("、")||"待核对"}。实际读取后用 record_capture_attempt 记录结果；失败不得覆盖原文，超时最多重试一次，遇验证码请交给我。补齐缺失内容后继续未完成整理，保留已有提醒。`;
  return <section className="notice-context" aria-label="通知整理概览">
    {item.source_information_id && <p>{source?<Button variant="ghost" disabled={busy} onClick={()=>select(source)}>← 原通知：{source.title}</Button>:"原通知已删除或不可用"}</p>}
    {item.kind==="information"&&<>
      <header><small>通知整理概览</small><h3>{children.length?`${children.filter(x=>x.status==="completed").length} / ${children.length} 项已完成`:"尚未拆分办理事项"}</h3></header>
      {children.map(child=><div className="notice-linked-row" key={child.id}><Button variant="ghost" disabled={busy} onClick={()=>select(child)}>{child.title} ↗</Button><small>{phase(child,clock)}</small></div>)}
      <div className="notice-reminders"><strong>当前提醒</strong>{reminders.length?reminders.map((r,i)=><p key={i}>{time(r.at)} · {r.label}<small>所属：{r.title}</small></p>):<p>尚未设置有效提醒</p>}</div>
      {group.some(x=>x.time_uncertain)&&<div className="notice-pending"><strong>待确认</strong>{group.filter(x=>x.time_uncertain).map(x=><p key={x.id}>{x.title}：具体时间仍需核对</p>)}</div>}
      <details><summary>采集状态 · {capture?({success:"采集完成",partial:"部分完成",failed:"上次采集失败"})[capture.state]:"关键内容待核验"}</summary>
        {!capture&&<p>保留来源链接和办理所需的重要内容即可。缺失关键步骤或日期时才需要继续补充。</p>}
        {capture&&<><p>{capture.detail||"未提供详细说明"}</p><small>{time(capture.at)} · 已记录 {capture.attempts} 次 · {capture.method}</small>{capture.error_kind&&<p>原因：{({timeout:"读取超时",verification:"需要验证",network:"连接失败",extraction:"正文提取失败",unknown:"原因未确定"} as Record<string,string>)[capture.error_kind]||capture.error_kind}</p>}{capture.missing.length>0&&<ul>{capture.missing.map((x,i)=><li key={i}>{x}</li>)}</ul>}<details><summary>最近采集记录</summary>{capture.history.map((x,i)=><p key={i}>{time(x.at)} · {({success:"完成",partial:"部分完成",failed:"失败"} as Record<string,string>)[x.state]} · {x.detail}</p>)}</details></>}
        <Button variant="ghost" onClick={()=>{setRetryOpen(true);setCopy("");}}>继续采集 / 交给 Agent</Button>
        {retryOpen&&<><p>将下面指令发给 Codex；此按钮不会自动启动采集。</p><textarea aria-label="继续采集指令" readOnly value={retry}/><Button onClick={()=>void navigator.clipboard.writeText(retry).then(()=>setCopy("已复制")).catch(()=>setCopy("复制不可用，请选中文字手动复制"))}>复制指令</Button><span role="status">{copy}</span></>}
      </details>
    </>}
    <details open={expanded} onToggle={e=>setExpanded(e.currentTarget.open)}><summary>Agent 整理回执</summary><p>显示已成功写入的操作；历史回执不代表整份通知已处理完，提醒以当前记录为准。</p>{error&&<p role="alert">{error}</p>}{loading&&<p>读取中…</p>}{!loading&&!error&&!receipts.length&&<p>暂无 Agent 操作回执</p>}{receipts.map(r=><div className="notice-receipt" key={r.request_id}>{r.undoable&&<label><input type="checkbox" disabled={undoBusy} checked={chosen.includes(r.request_id)} onChange={e=>{setChosen(old=>e.target.checked?[...old,r.request_id]:old.filter(x=>x!==r.request_id));setUndoPreview(null);}}/>选择撤销</label>}<strong>{operations[r.operation]||r.operation}{r.undone?"（已撤销）":""}</strong><span>{r.record.title||"记录"}</span><small>{time(r.created_at)}{r.record.version?` · 版本 ${r.record.version}`:""}</small></div>)}{next!==null&&<Button disabled={loading} onClick={()=>{setLoading(true);api<{items:Receipt[];next_offset:number|null}>(`/agent/receipts?record_id=${encodeURIComponent(item.id)}&offset=${next}`).then(data=>{setReceipts(old=>[...old,...data.items]);setNext(data.next_offset);setError("");}).catch(e=>setError(e.message)).finally(()=>setLoading(false));}}>更早的回执</Button>}</details>
    {!!chosen.length&&<div><Button disabled={undoBusy||busy} onClick={()=>void undo(true)}>预览撤销 {chosen.length} 项操作</Button>{undoPreview&&<><p>后续修改或外部引用冲突时会拒绝整组撤销。</p>{undoPreview.map((r,i)=><p key={i}>{r.action}：{r.title}</p>)}<Button disabled={undoBusy||busy} onClick={()=>void undo(false)}>确认撤销</Button></>}</div>}
  </section>;
}


