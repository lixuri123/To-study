import { useState } from "react";
import { api } from "../../api";
import { Button } from "../../components/ui";

export function BackupPanel({disabled}:{disabled:boolean}) {
  const [archive,setArchive]=useState<Record<string,unknown>|null>(null);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [ready,setReady]=useState(false);
  return <details><summary>数据备份与恢复</summary><p>导出本人笔记、待办、通知、事务、课表及资料。文件包含个人内容，请妥善保管。恢复只新增，不覆盖现有数据。</p>
    <Button disabled={disabled||busy} onClick={()=>{setBusy(true);void api<Record<string,unknown>>("/backup").then(data=>{const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download=`qingjian-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage("备份文件已生成");}).catch(e=>setMessage(e.message)).finally(()=>setBusy(false));}}>导出备份</Button>
    <label>选择备份文件<input type="file" accept=".json,application/json" disabled={disabled||busy} onChange={e=>{setArchive(null);setReady(false);setMessage("");const file=e.target.files?.[0];if(!file)return;if(file.size>30000000){setMessage("文件不能超过30MB");return;}setBusy(true);void file.text().then(JSON.parse).then(async data=>{const result=await api<{message:string;counts?:Record<string,number>;preview?:boolean}>("/backup/restore","POST",{archive:data,preview:true});setArchive(data);setReady(!!result.preview);setMessage(`${result.message} ${result.counts?JSON.stringify(result.counts):""}`);}).catch(e=>setMessage(`预览失败：${e.message}`)).finally(()=>setBusy(false));}}/></label>
    {ready&&<Button disabled={disabled||busy} onClick={()=>{setBusy(true);void api<{message:string}>("/backup/restore","POST",{archive,preview:false}).then(r=>{setMessage(r.message);setReady(false);window.dispatchEvent(new Event("focus"));}).catch(e=>setMessage(e.message)).finally(()=>setBusy(false));}}>确认新增恢复</Button>}<p role="status">{message}</p>
  </details>;
}
