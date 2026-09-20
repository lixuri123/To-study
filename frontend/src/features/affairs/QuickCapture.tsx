import { useState } from "react";
import { Button } from "../../components/ui";
import { blankAffair, type Affair } from "./useAffairs";

export function QuickCapture({busy, save, change, cancel}: {busy: boolean; save: (item: Affair) => Promise<unknown>; change: (dirty: boolean) => void; cancel: () => void}) {
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<{name: string; data: string}[]>([]);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  return <form className="affair-editor quick-capture" onSubmit={e => {e.preventDefault(); const title = content.trim().split(/\r?\n/).find(line => line.trim())?.replace(/^#+\s*/, "").slice(0,200) || attachments[0]?.name.slice(0,200) || "新记录"; void save({...blankAffair(), title, original: content, attachments});}}>
    <h2>先收下，稍后安排</h2><p>文字、链接或截图都可以，不必现在填完整。</p>
    <fieldset disabled={busy || reading}><label htmlFor="capture-content">记录内容</label><textarea id="capture-content" rows={8} autoFocus value={content} placeholder="粘贴通知，或写下一件要记住的事……" onChange={e => {setContent(e.target.value); change(!!e.target.value || !!attachments.length);}} />
    <label>添加附件<input type="file" accept="image/png,image/jpeg,application/pdf,text/plain" onChange={async e => {const file=e.target.files?.[0];e.target.value="";if(!file)return;setError("");if(file.size>2*1024*1024 || attachments.length>=3 || !["image/png","image/jpeg","application/pdf","text/plain"].includes(file.type)){setError("支持 PNG/JPEG/PDF/文本，最多 3 个，每个不超过 2 MB。");return;}setReading(true);change(true);try{const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(file);});setAttachments(previous=>[...previous,{name:file.name,data}]);}catch{setError("附件读取失败，请重试。");change(!!content || !!attachments.length);}finally{setReading(false);}}} /></label>
    {attachments.map((file,i)=><div className="affair-toolbar" key={i}><span>{file.name}</span><Button type="button" variant="ghost" onClick={()=>{const rest=attachments.filter((_,index)=>index!==i);setAttachments(rest);change(!!content||!!rest.length);}}>移除</Button></div>)}
    {error&&<p role="alert">{error}</p>}<div className="affair-toolbar"><Button type="submit" disabled={!content.trim()&&!attachments.length}>收下</Button><Button type="button" variant="ghost" onClick={cancel}>取消{content||attachments.length ? "并放弃" : ""}</Button></div></fieldset>
  </form>;
}
