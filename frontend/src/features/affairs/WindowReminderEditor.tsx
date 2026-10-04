import { Button, Input } from "../../components/ui";
import type { Affair, WindowRule } from "./useAffairs";

export function WindowReminderEditor({ item, onChange }: { item: Affair; onChange: (rule: WindowRule | null) => void }) {
  const rule = item.window_rule;
  const eligible = item.kind === "affair" && !!item.starts_at && !!item.ends_at;
  const patch = (value: Partial<WindowRule>) => rule && onChange({ ...rule, ...value });
  return <details className="affair-window-settings">
    <summary>办理时间段提醒{rule ? " · 已启用" : ""}</summary>
    <p>使用上方的开始与截止日期；完成或取消事务后停止提醒。具体钟点是提醒时间，不代表考试开放或截止时刻。</p>
    {!rule ? <Button type="button" variant="ghost" disabled={!eligible} onClick={() => onChange({ clock: "15:00", timezone_offset: new Date().getTimezoneOffset(), on_start: true, before_days: [3, 1], every_days: null })}>设置区间提醒</Button> : <>
      <label>提醒钟点<Input required type="time" value={rule.clock} onChange={event => patch({ clock: event.target.value })} /></label>
      <label className="affair-inline"><input type="checkbox" checked={rule.on_start} onChange={event => patch({ on_start: event.target.checked })} />开始当天提醒</label>
      <div className="affair-window-before"><span>截止前提醒</span>{[3, 1, 0].map(day => <label className="affair-inline" key={day}><input type="checkbox" checked={rule.before_days.includes(day)} onChange={event => patch({ before_days: event.target.checked ? [...rule.before_days, day] : rule.before_days.filter(value => value !== day) })} />{day ? `提前${day}天` : "截止当天"}</label>)}</div>
      <label>期间持续提醒<select value={rule.every_days ?? 0} onChange={event => patch({ every_days: Number(event.target.value) || null })}><option value={0}>不开启</option><option value={1}>每天</option><option value={2}>每两天</option><option value={3}>每三天</option><option value={7}>每周</option></select></label>
      <p>将在当前设备时区 {rule.clock} 提醒；调整日期后同步调整提醒，原自定义提醒保留。期间重复最多支持366天。</p>
      <Button type="button" variant="ghost" onClick={() => onChange(null)}>关闭区间提醒</Button>
    </>}
    {!eligible && <p>先将记录设为事务，并填写开始与截止日期。</p>}
  </details>;
}
