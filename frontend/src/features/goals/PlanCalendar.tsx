import { Fragment, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, CircleCheck, ListTodo, Plus, Target } from "lucide-react";
import type { Note, Task } from "../../api";
import { Button, Input } from "../../components/ui";
import type { GoalsModel } from "./useGoals";
import type { TasksModel } from "../tasks/useTasks";
import { addDays, checkinOn, dayKey, monthEnd, monthStart, parseDay, planActive, scheduled, weekStart, weeklyDone, type Plan, type PlanInput, type Checkin } from "./planDates";
import { usePlans } from "./usePlans";
import { AffairRanges, rangeAffairs } from "./AffairRanges";
import { phase, type Affair } from "../affairs/useAffairs";

const weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const today = () => dayKey(new Date());
function formatDay(day: string, options: Intl.DateTimeFormatOptions) {
  return parseDay(day).toLocaleDateString("zh-CN", options);
}
function shiftMonth(day: string, amount: number) {
  const date = parseDay(monthStart(day));
  date.setMonth(date.getMonth() + amount);
  return dayKey(date);
}
function blankPlan(day: string): PlanInput {
  return { title: "", kind: "weekly", start_date: day, end_date: null, weekdays: [], weekly_target: 3, target_amount: 1, unit: "次", goal_id: null };
}
function PlanForm({ day, goals, initial, busy, onCancel, onSave }: {
  day: string; goals: GoalsModel["goals"]; initial: Plan | null; busy: boolean;
  onCancel: () => void; onSave: (input: PlanInput, id?: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<PlanInput>(() => initial ? {
    title: initial.title, kind: initial.kind, start_date: initial.start_date, end_date: initial.end_date,
    weekdays: initial.weekdays, weekly_target: initial.weekly_target, target_amount: initial.target_amount,
    unit: initial.unit, goal_id: initial.goal_id,
  } : blankPlan(day));
  const [saving, setSaving] = useState(false);
  const valid = draft.title.trim() && !!draft.start_date && (draft.kind !== "weekdays" || draft.weekdays.length > 0)
    && (!draft.end_date || draft.end_date >= draft.start_date);
  return <form className="plan-form" onSubmit={async event => {
    event.preventDefault(); if (!valid) return;
    setSaving(true);
    const ok = await onSave({ ...draft, title: draft.title.trim() }, initial?.id);
    setSaving(false);
    if (ok) onCancel();
  }}>
    <div className="plan-form-heading"><div><span className="eyebrow">PLAN</span><h3>{initial ? "编辑计划" : "开始一项计划"}</h3></div><Button type="button" variant="ghost" onClick={onCancel}>取消</Button></div>
    <label>计划名称<Input autoFocus value={draft.title} maxLength={200} placeholder="例如：读一篇论文" onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
    <div className="plan-kind" role="group" aria-label="计划频率">
      {([["weekly", "每周若干次"], ["weekdays", "固定星期"], ["once", "指定一天"]] as const).map(([kind, label]) =>
        <button type="button" key={kind} aria-pressed={draft.kind === kind} onClick={() => setDraft({
          ...draft, kind, weekdays: kind === "weekdays" ? (draft.weekdays.length ? draft.weekdays : [(parseDay(day).getDay() + 6) % 7]) : [],
          weekly_target: kind === "weekly" ? (draft.weekly_target ?? 3) : null,
          end_date: kind === "once" ? null : draft.end_date,
        })}>{label}</button>)}
    </div>
    {draft.kind === "weekly" && <label>每周计划完成次数<Input type="number" min={1} max={7} value={draft.weekly_target ?? 3} onChange={event => setDraft({ ...draft, weekly_target: Number(event.target.value) || 1 })} /></label>}
    {draft.kind === "weekdays" && <div className="plan-weekdays" role="group" aria-label="执行星期">
      {weekdays.map((label, index) => <button type="button" key={label} aria-pressed={draft.weekdays.includes(index)}
        onClick={() => setDraft({ ...draft, weekdays: draft.weekdays.includes(index) ? draft.weekdays.filter(day => day !== index) : [...draft.weekdays, index].sort() })}>{label}</button>)}
    </div>}
    <div className="plan-form-row">
      <label>{draft.kind === "once" ? "计划日期" : "开始日期"}<Input type="date" value={draft.start_date} onChange={event => setDraft({ ...draft, start_date: event.target.value })} /></label>
      {draft.kind !== "once" && <label>结束日期（可选）<Input type="date" value={draft.end_date ?? ""} onChange={event => setDraft({ ...draft, end_date: event.target.value || null })} /></label>}
    </div>
    <details className="plan-more"><summary>更多设置</summary>
      <div className="plan-form-row">
        <label>一次完成的数量<Input type="number" min={0.1} step="any" value={draft.target_amount} onChange={event => setDraft({ ...draft, target_amount: Number(event.target.value) || 1 })} /></label>
        <label>单位<Input value={draft.unit} maxLength={20} onChange={event => setDraft({ ...draft, unit: event.target.value })} /></label>
      </div>
      <label>关联目标<select value={draft.goal_id ?? ""} onChange={event => setDraft({ ...draft, goal_id: event.target.value || null })}>
        <option value="">暂不关联</option>{goals.filter(goal => !goal.archived_at).map(goal => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
      </select></label>
    </details>
    <Button type="submit" disabled={busy || saving || !valid}>{saving ? "保存中…" : initial ? "保存修改" : "创建计划"}</Button>
  </form>;
}

function CheckinForm({ plan, day, initial, notes, busy, onSave, onCancel }: {
  plan: Plan; day: string; initial?: Checkin; notes: Note[]; busy: boolean;
  onSave: (data: Pick<Checkin, "status" | "amount" | "memo" | "note_id">) => Promise<boolean>; onCancel: () => void;
}) {
  const [status, setStatus] = useState<Checkin["status"]>(initial?.status ?? "done");
  const [amount, setAmount] = useState(initial?.amount ?? plan.target_amount);
  const [memo, setMemo] = useState(initial?.memo ?? "");
  const [noteId, setNoteId] = useState(initial?.note_id ?? "");
  return <form className="plan-checkin-form" onSubmit={async event => {
    event.preventDefault();
    if (await onSave({ status, amount: status === "skipped" ? 0 : amount, memo, note_id: noteId || null })) onCancel();
  }}>
    <strong>{formatDay(day, { month: "long", day: "numeric" })} · {plan.title}</strong>
    <label>记录状态<select value={status} onChange={event => setStatus(event.target.value as Checkin["status"])}><option value="done">完成</option><option value="partial">部分完成</option><option value="skipped">跳过</option></select></label>
    {status !== "skipped" && <label>完成数量<Input type="number" min={0.1} step="any" value={amount} onChange={event => setAmount(Number(event.target.value) || 1)} />{plan.unit}</label>}
    <label>简短记录（可选）<Input value={memo} maxLength={2000} placeholder="今天做了什么？" onChange={event => setMemo(event.target.value)} /></label>
    <label>关联笔记（可选）<select value={noteId} onChange={event => setNoteId(event.target.value)}><option value="">无</option>{notes.map(note => <option key={note.id} value={note.id}>{note.title}</option>)}</select></label>
    <div className="plan-form-actions"><Button type="submit" disabled={busy}>保存打卡</Button><Button type="button" variant="ghost" onClick={onCancel}>取消</Button></div>
  </form>;
}

export function PlanCalendar({ goals, tasksModel, notes, onOpenGoal, onDraftChange, affairs, onOpenAffair }: {
  goals: GoalsModel["goals"]; tasksModel: TasksModel; notes: Note[]; onOpenGoal: (id: string) => void;
  onDraftChange: (locked: boolean) => void;
  affairs: Affair[]; onOpenAffair: (id: string) => void;
}) {
  const [anchor, setAnchor] = useState(today);
  const [selectedDay, setSelectedDay] = useState(today);
  const [view, setView] = useState<"week" | "month">("week");
  const [editingPlan, setEditingPlan] = useState<Plan | null | "new">(null);
  const [editingCheckin, setEditingCheckin] = useState<string | null>(null);
  const [showPlans, setShowPlans] = useState(false);
  const rangeStart = view === "week" ? weekStart(anchor) : weekStart(monthStart(anchor));
  const rangeEnd = view === "week" ? addDays(rangeStart, 6) : addDays(weekStart(monthEnd(anchor)), 6);
  const { plans, busy, error, refresh, save, archive, checkin, undo } = usePlans(rangeStart, rangeEnd);
  const locked = busy || editingPlan !== null || editingCheckin !== null;
  useEffect(() => { onDraftChange(locked); }, [locked, onDraftChange]);
  useEffect(() => () => onDraftChange(false), [onDraftChange]);
  const days = useMemo(() => Array.from({ length: Math.round((parseDay(rangeEnd).getTime() - parseDay(rangeStart).getTime()) / 86_400_000) + 1 }, (_, index) => addDays(rangeStart, index)), [rangeStart, rangeEnd]);
  const visiblePlans = plans.filter(plan => !plan.archived_at);
  const dayPlans = plans.filter(plan => (scheduled(plan, selectedDay) || checkinOn(plan, selectedDay)) && (!plan.archived_at || !!checkinOn(plan, selectedDay)));
  const dayTasks = tasksModel.tasks.filter(task => task.due_date === selectedDay);
  const weekTarget = visiblePlans.filter(plan => plan.kind === "weekly" && planActive(plan, selectedDay));
  function navigate(direction: number) {
    if (locked) return;
    const next = view === "week" ? addDays(anchor, direction * 7) : shiftMonth(anchor, direction);
    setAnchor(next); setSelectedDay(next);
  }
  function status(plan: Plan, day: string) {
    const entry = checkinOn(plan, day);
    return entry?.status ?? (scheduled(plan, day) && plan.kind !== "weekly" ? "planned" : "");
  }
  return <div className="plan-calendar">
    <div className="plan-calendar-head">
      <div><span className="eyebrow">WEEKLY RHYTHM</span><h2>计划日历</h2><p>安排要做的事，也看见已经做过的事。</p></div>
      <div className="plan-calendar-actions"><Button variant="outline" disabled={locked} onClick={() => setShowPlans(value => !value)}>{showPlans ? "返回日历" : "管理计划"}</Button><Button disabled={locked} onClick={() => setEditingPlan("new")}><Plus size={16} />新建计划</Button></div>
    </div>
    {error && <div className="goal-error" role="alert"><span>{error}</span><Button variant="ghost" onClick={() => void refresh()}>重试</Button></div>}
    {editingPlan !== null && <PlanForm key={editingPlan === "new" ? "new" : editingPlan.id} day={selectedDay} goals={goals} initial={editingPlan === "new" ? null : editingPlan} busy={busy} onSave={save} onCancel={() => setEditingPlan(null)} />}
    {showPlans ? <div className="plan-manage-list">
      {plans.map(plan => <article className="plan-manage-item" key={plan.id}><div><strong>{plan.title}</strong><small>{plan.kind === "weekly" ? `每周 ${plan.weekly_target} 次` : plan.kind === "weekdays" ? plan.weekdays.map(day => weekdays[day]).join("、") : plan.start_date}{plan.archived_at ? " · 已归档" : ""}</small></div><div><Button variant="ghost" disabled={locked} onClick={() => setEditingPlan(plan)}>编辑</Button><Button variant="ghost" disabled={locked} onClick={() => void archive(plan.id, !plan.archived_at)}>{plan.archived_at ? "恢复" : "归档"}</Button></div></article>)}
      {!plans.length && <p className="plan-empty">还没有计划。先为这周安排一件想坚持的事。</p>}
    </div> : <>
      <div className="plan-navigation"><div><Button variant="ghost" disabled={locked} aria-label="上一个时间段" onClick={() => navigate(-1)}><ChevronLeft size={17} /></Button><strong>{view === "week" ? `${formatDay(rangeStart, { month: "long", day: "numeric" })} — ${formatDay(rangeEnd, { month: "long", day: "numeric" })}` : formatDay(anchor, { year: "numeric", month: "long" })}</strong><Button variant="ghost" disabled={locked} aria-label="下一个时间段" onClick={() => navigate(1)}><ChevronRight size={17} /></Button><Button variant="ghost" disabled={locked} onClick={() => { setAnchor(today()); setSelectedDay(today()); }}>今天</Button></div><div className="plan-view-switch"><button disabled={locked} aria-pressed={view === "week"} onClick={() => setView("week")}>周</button><button disabled={locked} aria-pressed={view === "month"} onClick={() => setView("month")}>月</button></div></div>
      {!!weekTarget.length && view === "week" && <div className="plan-week-targets">{weekTarget.map(plan => <span key={plan.id}><CircleCheck size={14} />{plan.title} <b>{weeklyDone(plan, selectedDay)}/{plan.weekly_target}</b></span>)}</div>}
      <div className={`plan-grid ${view === "month" ? "month" : "week"}`}>
        {weekdays.map(label => <div className="plan-weekday" key={label}>{label}</div>)}
        {days.map((day, index) => {
          const entries = plans.filter(plan => !!status(plan, day) && (plan.kind !== "weekly" || !!checkinOn(plan, day)));
          const dueTasks = tasksModel.tasks.filter(task => task.due_date === day && !task.completed).length;
          return <Fragment key={day}>{index % 7 === 0 && <AffairRanges items={affairs} week={day} disabled={locked} onOpen={onOpenAffair} />}<button type="button" style={{ borderRightWidth: index % 7 === 6 ? 0 : 1 }} className={`plan-day${day === selectedDay ? " selected" : ""}${day === today() ? " today" : ""}${view === "month" && day.slice(0, 7) !== anchor.slice(0, 7) ? " outside" : ""}`} disabled={locked} onClick={() => { setSelectedDay(day); setEditingCheckin(null); }}>
            <time dateTime={day}>{Number(day.slice(-2))}</time>
            <div className="plan-day-items">{entries.slice(0, view === "month" ? 2 : 4).map(plan => <span key={plan.id} className={`plan-day-chip ${status(plan, day)}`}>{plan.title}</span>)}{entries.length > (view === "month" ? 2 : 4) && <small>还有 {entries.length - (view === "month" ? 2 : 4)} 项</small>}{dueTasks > 0 && <span className="plan-day-task"><ListTodo size={11} />{dueTasks} 项待办截止</span>}</div>
          </button></Fragment>;
        })}
      </div>
      <section className="plan-day-detail" aria-label={`${selectedDay}的安排`}>
        <div className="plan-day-head"><div><span className="eyebrow">SELECTED DAY</span><h3>{formatDay(selectedDay, { month: "long", day: "numeric", weekday: "long" })}</h3></div><span>{selectedDay === today() ? "今天" : selectedDay}</span></div>
        {rangeAffairs(affairs, selectedDay, selectedDay).map(item => <button key={item.id} disabled={locked} className="plan-affair-day-link" onClick={() => onOpenAffair(item.id)}><strong>{item.title}</strong><small>办理时间段 · {phase(item, Date.now())} ↗</small></button>)}
        {dayPlans.map(plan => {
          const record = checkinOn(plan, selectedDay);
          const goal = goals.find(item => item.id === plan.goal_id);
          return <article className="plan-day-card" key={plan.id}>
            <div className="plan-day-card-title"><div><strong>{plan.title}</strong><small>{plan.kind === "weekly" ? `本周 ${weeklyDone(plan, selectedDay)}/${plan.weekly_target} 次` : `目标 ${plan.target_amount} ${plan.unit}`}</small></div>{record && <span className={`plan-record-state ${record.status}`}>{record.status === "done" ? "已完成" : record.status === "partial" ? "部分完成" : "已跳过"}</span>}</div>
            {goal && <button disabled={locked} className="plan-goal-link" onClick={() => onOpenGoal(goal.id)}><Target size={13} />{goal.title}</button>}
            {record?.memo && <p>{record.memo}</p>}
            {record?.note_id && <span className="plan-note-link">关联笔记：{notes.find(note => note.id === record.note_id)?.title ?? "已移除的笔记"}</span>}
            {editingCheckin === plan.id ? <CheckinForm plan={plan} day={selectedDay} initial={record} notes={notes} busy={busy}
              onSave={data => checkin(plan.id, selectedDay, data)} onCancel={() => setEditingCheckin(null)} /> : <div className="plan-day-card-actions">
              {selectedDay <= today() && <><Button variant="outline" disabled={busy} onClick={() => void checkin(plan.id, selectedDay, { status: "done", amount: plan.target_amount, memo: record?.memo ?? "", note_id: record?.note_id ?? null })}>{record ? "标记完成" : "完成"}</Button><Button variant="ghost" disabled={busy} onClick={() => setEditingCheckin(plan.id)}>{record ? "编辑记录" : "记录细节"}</Button>{!record && <Button variant="ghost" disabled={busy} onClick={() => void checkin(plan.id, selectedDay, { status: "skipped", amount: 0, memo: "", note_id: null })}>跳过</Button>}{record && <Button variant="ghost" disabled={busy} onClick={() => void undo(plan.id, selectedDay)}>撤销</Button>}</>}
              {selectedDay > today() && <small>到计划日期后可以打卡</small>}
            </div>}
          </article>;
        })}
        {!dayPlans.length && <p className="plan-empty">这一天没有计划。弹性计划可在本周任一天完成。</p>}
        <div className="plan-task-section"><div className="plan-task-heading"><ListTodo size={17} /><strong>待办截止</strong><span>{dayTasks.length}</span></div>{dayTasks.length ? dayTasks.map(task => <label key={task.id} className="plan-task-row"><input type="checkbox" checked={task.completed} disabled={tasksModel.pending.has(task.id)} onChange={() => tasksModel.toggleTask(task)} /><span className={task.completed ? "completed" : ""}>{task.title}</span></label>) : <p>没有在这天截止的待办。</p>}<small>待办清单仍可独立管理；勾选待办不会自动创建打卡。</small></div>
      </section>
    </>}
    <div className="plan-footer-hint"><CalendarDays size={14} />计划用于安排日期，打卡记录实际完成；目标的达成规则保留在「目标档案」。</div>
  </div>;
}
