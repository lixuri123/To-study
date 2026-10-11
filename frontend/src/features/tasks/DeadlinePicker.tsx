import { useEffect, useRef, useState } from "react";
import { Button, Input } from "../../components/ui";

export function DeadlinePicker({ start, end, disabled, label, newTask = false, onSave, onOpenChange }: {
  start?: string | null; end?: string | null; disabled: boolean; label: string; newTask?: boolean;
  onSave: (start: string | null, end: string | null) => Promise<boolean | undefined> | boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [saving, setSaving] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  function close() { if (!saving) { setOpen(false); onOpenChange?.(false); } }
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!container.current?.contains(event.target as Node) && !saving) { setOpen(false); onOpenChange?.(false); } };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open, saving, onOpenChange]);
  const isRange = !!start && !!end && start < end;
  const valid = !range || !!first && !!last && first <= last;
  return <div ref={container} className={`task-deadline${newTask ? " task-new-deadline" : ""}`} onKeyDown={event => {
    if (open && event.key === "Escape") { event.stopPropagation(); close(); }
    if (open && event.key === "Enter") { event.preventDefault(); event.stopPropagation(); }
  }}>
    <button type="button" className="task-date task-deadline-trigger" aria-label={label} aria-expanded={open} disabled={disabled || saving} onClick={() => {
      if (open) return close();
      setRange(isRange); setFirst(start ?? ""); setLast(end ?? ""); setOpen(true); onOpenChange?.(true);
    }}>{isRange ? `${start} — ${end}` : end || "截止日期"}</button>
    {open && <div className="task-deadline-popover" role="group" aria-label="选择截止日期">
      <fieldset disabled={disabled || saving}>
        <div className="task-deadline-mode"><button type="button" aria-pressed={!range} onClick={() => setRange(false)}>单日</button><button type="button" aria-pressed={range} onClick={() => {setRange(true); if (!first) setFirst(last);}}>时间段</button></div>
        {range ? <div className="task-deadline-fields"><label>区间起始日期<Input type="date" value={first} max={last || undefined} onChange={event => setFirst(event.target.value)} /></label><label>区间结束日期<Input type="date" value={last} min={first || undefined} onChange={event => setLast(event.target.value)} /></label></div>
          : <label>截止日期<Input type="date" value={last} onChange={event => setLast(event.target.value)} /></label>}
        {range && <small>在这段时间内任一天完成即可，结束后才算逾期。</small>}
        <div className="task-deadline-actions"><Button type="button" disabled={!valid} onClick={async () => {
          setSaving(true);
          try { const result = await onSave(range && first !== last ? first : null, last || null); if (result) {setOpen(false); onOpenChange?.(false);} }
          finally { setSaving(false); }
        }}>{saving ? "保存中…" : "确定"}</Button><Button type="button" variant="ghost" onClick={() => {setFirst(""); setLast(""); setRange(false);}}>清除</Button><Button type="button" variant="ghost" onClick={close}>取消</Button></div>
      </fieldset>
    </div>}
  </div>;
}
