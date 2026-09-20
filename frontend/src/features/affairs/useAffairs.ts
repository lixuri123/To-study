import { useEffect, useRef, useState } from "react";
import { api } from "../../api";

export interface Reminder { repeat_minutes?: number; repeat_limit?: number; at: string; label: string; acknowledged: boolean; anchor?: "custom" | "starts_at" | "ends_at"; offset_minutes?: number; timezone_offset?: number }
export interface Affair {
  id: string; version: number; title: string; kind: "information" | "affair";
  status: "inbox" | "pending" | "doing" | "completed" | "cancelled";
  original: string; summary: string; source_name: string; source_url: string;
  published_at: string; starts_at: string; ends_at: string; time_uncertain: boolean;
  note_ids: string[]; reminders: Reminder[]; completion_criteria: string; proof: string;
  created_at: string; updated_at: string;
  attachments?: {name: string; data: string}[];
  last_actor?: string;
  source_information_id?: string | null;
  pending_questions?: {question:string;answer:string}[];
  source_reviewed_version?: number;
  monitor?: {enabled:boolean;schedule:string;state:string;checked_at:string;last_success_at:string;detail:string;seen_links:string[]} | null;
  source_content_version?: number;
  source_revisions?: {at:string;version:number;before:Record<string,string>;after:Record<string,string>}[];
  capture?: {state: "success" | "partial" | "failed"; method: string; error_kind: string; detail: string; missing: string[]; at: string; attempts: number; history: {state: string; at: string; detail: string}[]};
  history: {at: string; changes: Record<string, {before: string; after: string}>}[];
}
export const blankAffair = (): Affair => ({id: "", version: 0, title: "", kind: "information", status: "inbox", original: "", summary: "", source_name: "", source_url: "", published_at: "", starts_at: "", ends_at: "", time_uncertain: false, note_ids: [], reminders: [], completion_criteria: "", proof: "", created_at: "", updated_at: "", history: []});
export function instant(value: string, end = false) {
  return new Date(value.length === 10 ? `${value}T${end ? "23:59:59" : "00:00:00"}` : value).getTime();
}
export function phase(item: Affair, now: number) {
  if (item.status === "completed") return "已完成";
  if (item.status === "cancelled") return "已取消";
  if (item.kind === "information") return item.status === "inbox" ? "待整理" : "已整理";
  if (item.ends_at && instant(item.ends_at, true) < now) return "已逾期";
  if (item.starts_at && instant(item.starts_at) > now) return "即将开始";
  if (item.ends_at && instant(item.ends_at, true) - now <= 3 * 86400000) return "即将截止";
  return "正在办理";
}
export function useAffairs(active: boolean) {
  const [items, setItems] = useState<Affair[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const generation = useRef(0);
  const saving = useRef(false);
  async function refresh() {
    const started = generation.current;
    try { const data = await api<Affair[]>("/affairs"); if (started === generation.current) {setItems(data); setError("");} }
    catch (e) { setError(e instanceof Error ? e.message : "读取失败"); }
  }
  useEffect(() => {
    if (!active) return;
    let current = true;
    const started = generation.current;
    api<Affair[]>("/affairs").then(data => { if (current && started === generation.current) setItems(data); }).catch(e => { if (current) setError(e.message); });
    let fetching = false;
    const tick = async () => {setClock(Date.now());if(fetching||saving.current)return;fetching=true;const version=generation.current;try{const data=await api<Affair[]>("/affairs");if(current&&version===generation.current){setItems(data);setError("");}}catch(e){if(current)setError(e instanceof Error?e.message:"同步失败");}finally{fetching=false;}};
    const timer = window.setInterval(() => void tick(), 15000);
    window.addEventListener("focus", tick);
    return () => { current = false; window.clearInterval(timer);window.removeEventListener("focus",tick); };
  }, [active]);
  async function save(item: Affair): Promise<Affair | undefined> {
    if (!active || saving.current) return;
    saving.current = true;
    setBusy(true); setError("");
    try {
      const saved = await api<Affair>(item.id ? `/affairs/${item.id}` : "/affairs", item.id ? "PUT" : "POST", item);
      generation.current++;
      setItems(previous => [saved, ...previous.filter(x => x.id !== saved.id)]);
      setClock(Date.now());
      return saved;
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败"); }
    finally { saving.current = false; setBusy(false); }
  }
  const due = active ? items.flatMap(item => item.status === "completed" || item.status === "cancelled" ? [] : item.reminders.flatMap((reminder, index) => !reminder.acknowledged && instant(reminder.at) <= clock ? [{item, reminder, index}] : [])) : [];
  return {items, error, busy, clock, due, refresh, save};
}
export type AffairsModel = ReturnType<typeof useAffairs>;

