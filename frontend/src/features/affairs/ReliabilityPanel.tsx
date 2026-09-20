import { useEffect, useState } from "react";
import { api } from "../../api";
import { Button, Input } from "../../components/ui";
import type { Affair } from "./useAffairs";

export function ReliabilityPanel({item,items,busy,save}:{item:Affair;items:Affair[];busy:boolean;save:(item:Affair)=>Promise<unknown>}) {
  const [question,setQuestion]=useState("");
  const [answers,setAnswers]=useState<Record<number,string>>({});
  const [deliveries,setDeliveries]=useState<{affair_id:string;label:string;state:string;error:string;updated_at:number}[]>([]);
  const [deliveryError,setDeliveryError]=useState("");
  useEffect(()=>{
    if(!item.reminders.length)return;
    let current=true;
    let pending=false;
    const refresh=async()=>{if(pending)return;pending=true;try{const data=await api<typeof deliveries>("/reminders/history");if(current){setDeliveries(data.filter(row=>row.affair_id===item.id));setDeliveryError("");}}catch(e){if(current)setDeliveryError(e instanceof Error?e.message:"投递状态读取失败");}finally{pending=false;}};
    void refresh();const timer=window.setInterval(()=>void refresh(),15000);
    return()=>{current=false;window.clearInterval(timer);};
  },[item.id,item.reminders.length]);
  const source=items.find(x=>x.id===item.source_information_id);
  const changed=source && (source.source_content_version||0)>(item.source_reviewed_version||0);
  return <section aria-label="办理核对">
    {item.monitor&&<div className="notice-pending"><strong>官网监控 · {item.monitor.enabled?"启用":"暂停"}</strong><p>每天09:00、18:00（北京时间），由 Codex 定时任务检查。</p><p>上次结果：{({pending:"待首次检查",success:"检查成功",partial:"部分检查完成",failed:"检查失败"} as Record<string,string>)[item.monitor.state]||item.monitor.state}</p><p>{item.monitor.detail}</p><small>上次检查：{item.monitor.checked_at?new Date(item.monitor.checked_at).toLocaleString("zh-CN"):"尚未执行"} · 上次成功：{item.monitor.last_success_at?new Date(item.monitor.last_success_at).toLocaleString("zh-CN"):"尚未成功"} · 已记录链接{item.monitor.seen_links.length}条</small><Button disabled={busy} onClick={()=>void save({...item,monitor:{...item.monitor!,enabled:!item.monitor!.enabled}})}>{item.monitor.enabled?"暂停此来源":"恢复此来源"}</Button></div>}
    {changed&&<div className="notice-pending"><strong>原通知的重要内容已变化</strong><p>请核对办理时间和提醒；个人安排尚未自动修改。</p><Button disabled={busy} onClick={()=>void save({...item,source_reviewed_version:source.source_content_version})}>已核对本次变化</Button></div>}
    <details open={!!item.pending_questions?.some(x=>!x.answer)}><summary>待确认项（{item.pending_questions?.filter(x=>!x.answer).length||0}）</summary>
      {item.pending_questions?.map((q,i)=><div key={i} className="notice-receipt"><label>{q.question}<Input value={answers[i]??q.answer} placeholder="填写确认结果" onChange={e=>setAnswers(a=>({...a,[i]:e.target.value}))}/></label><Button disabled={busy||(answers[i]??q.answer)===q.answer} onClick={()=>void save({...item,pending_questions:item.pending_questions?.map((x,j)=>j===i?{...x,answer:answers[i]??q.answer}:x)})}>保存结果</Button><small>{q.answer?"已补充":"待确认"}</small></div>)}
      <Input aria-label="新增待确认问题" placeholder="例如：宿舍是否需要自备床垫？" maxLength={300} value={question} onChange={e=>setQuestion(e.target.value)}/><Button disabled={busy||!question.trim()||(item.pending_questions?.length||0)>=30} onClick={()=>void save({...item,pending_questions:[...(item.pending_questions||[]),{question:question.trim(),answer:""}]}).then(result=>{if(result)setQuestion("");})}>添加待确认项</Button>
    </details>
    {!!item.reminders.length&&<details><summary>提醒知晓与再次提醒</summary><p>系统送达不等于已知晓。知晓后停止重复提醒，事务仍需单独完成。</p>{item.reminders.map((r,i)=><div className="notice-receipt" key={i}><strong>{r.label}</strong><span>{r.acknowledged?"已知晓":"尚未知晓"} · {new Date(r.at).toLocaleString("zh-CN")}</span><label>未知晓时再次提醒<select disabled={busy} value={r.repeat_minutes||0} onChange={e=>void save({...item,reminders:item.reminders.map((x,j)=>j===i?{...x,repeat_minutes:Number(e.target.value),repeat_limit:3}:x)})}><option value={0}>只提醒一次</option><option value={60}>每小时，最多3次</option><option value={1440}>每天，最多3次</option></select></label><Button disabled={busy||r.acknowledged} onClick={()=>void save({...item,reminders:item.reminders.map((x,j)=>j===i?{...x,acknowledged:true}:x)})}>我已知晓</Button><Button variant="ghost" disabled={busy} onClick={()=>void save({...item,reminders:item.reminders.map((x,j)=>j===i?{...x,acknowledged:false,anchor:"custom",at:new Date(Date.now()+3600000).toISOString()}:x)})}>一小时后再提醒</Button></div>)}</details>}
    {!!item.source_revisions?.length&&<details><summary>通知变化记录</summary>{[...item.source_revisions].reverse().map((r,i)=><div key={i}><small>{new Date(r.at).toLocaleString("zh-CN")}</small>{Object.keys(r.after).filter(k=>r.after[k]!==r.before[k]).map(k=><div key={k}><strong>{({title:"标题",summary:"重要内容",original:"已有原文",published_at:"发布时间",starts_at:"开始",ends_at:"截止"} as Record<string,string>)[k]||k}</strong><p className="original-text">之前：{r.before[k]||"未填写"}</p><p className="original-text">现在：{r.after[k]||"未填写"}</p></div>)}</div>)}</details>}
    {!!item.reminders.length&&<details><summary>最近系统投递记录</summary><p>从账号最近20条投递中显示本事务记录，系统接收不代表你已阅读。</p>{deliveryError&&<p role="alert">{deliveryError}</p>}{!deliveryError&&!deliveries.length&&<p>暂无本事务的近期投递记录</p>}{deliveries.map((row,i)=><p key={i}>{new Date(row.updated_at*1000).toLocaleString("zh-CN")} · {row.label} · {({sent:"已送达系统",sending:"发送中",failed:"发送失败，将重试",pending:"待发送"} as Record<string,string>)[row.state]||row.state}{row.error?`：${row.error}`:""}</p>)}</details>}
  </section>;
}
