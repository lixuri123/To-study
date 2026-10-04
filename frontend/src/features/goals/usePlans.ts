import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api";
import type { Plan, PlanInput, Checkin } from "./planDates";

export function usePlans(start: string, end: string) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const writing = useRef(false);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setBusy(true); setError("");
    try {
      const result = await api<Plan[]>(`/plans?start=${start}&end=${end}`);
      if (request === generation.current) setPlans(result);
    } catch (cause) {
      if (request === generation.current) setError(cause instanceof Error ? cause.message : "计划读取失败");
    } finally { if (request === generation.current && !writing.current) setBusy(false); }
  }, [start, end]);
  useEffect(() => { void refresh(); return () => { ++generation.current; }; }, [refresh]);
  async function change(action: () => Promise<Plan>) {
    if (writing.current) return false;
    writing.current = true;
    ++generation.current;
    setBusy(true); setError("");
    try {
      const plan = await action();
      setPlans(current => {
        const existing = current.some(item => item.id === plan.id);
        return existing ? current.map(item => item.id === plan.id ? plan : item) : [plan, ...current];
      });
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败");
      return false;
    } finally { writing.current = false; setBusy(false); }
  }
  const save = (input: PlanInput, id?: string) => change(() => api<Plan>(id ? `/plans/${id}` : "/plans", id ? "PUT" : "POST", input));
  const archive = (id: string, archived: boolean) => change(() => api<Plan>(`/plans/${id}/archive`, "PATCH", { archived }));
  const checkin = (id: string, day: string, data: Pick<Checkin, "status" | "amount" | "memo" | "note_id">) =>
    change(() => api<Plan>(`/plans/${id}/checkins/${day}`, "PUT", data));
  const undo = (id: string, day: string) => change(() => api<Plan>(`/plans/${id}/checkins/${day}`, "DELETE"));
  return { plans, busy, error, refresh, save, archive, checkin, undo };
}
