import { useCallback, useEffect, useState } from "react";
import { Button } from "../../components/ui";
import type { GoalsModel } from "./useGoals";
import type { GoalDraft } from "./types";
import { GoalEditor, blankGoal } from "./GoalEditor";
import { GoalDetail } from "./GoalDetail";
import { GoalList } from "./GoalList";
import { PlanCalendar } from "./PlanCalendar";
import type { TasksModel } from "../tasks/useTasks";
import type { Note } from "../../api";
import type { Affair } from "../affairs/useAffairs";
import "./goals.css";

type GoalMode = "list" | "detail" | "editor";

export function GoalsPanel({ model, onDraftChange, tasksModel, notes, affairs, onOpenAffair }: { model: GoalsModel; onDraftChange: (dirty: boolean) => void; tasksModel: TasksModel; notes: Note[]; affairs: Affair[]; onOpenAffair: (id: string) => void }) {
  const [tab, setTab] = useState<"calendar" | "records">("calendar");
  const [editorDirty, setEditorDirty] = useState(false);
  const [calendarLocked, setCalendarLocked] = useState(false);
  const handleCalendarLock = useCallback((locked: boolean) => { setCalendarLocked(locked); onDraftChange(locked); }, [onDraftChange]);
  const [mode, setMode] = useState<GoalMode>(model.selected ? "detail" : "list");
  const [editor, setEditor] = useState<{ initial: GoalDraft; existing: boolean } | null>(null);
  useEffect(() => { if (mode !== "editor") { setEditorDirty(false); onDraftChange(false); } }, [mode, onDraftChange]);
  const openGoal = async (id: string) => { const detail = await model.selectGoal(id); if (detail !== undefined) setMode("detail"); };
  const createTemplate = async () => { const detail = await model.createFromTemplate("full-time-postgraduate-quality"); if (detail !== undefined) setMode("detail"); };
  const startEditor = (existing: boolean) => { setEditor({ initial: existing && model.selected ? model.selected : blankGoal(), existing }); setMode("editor"); };
  const archiveContent = mode === "detail" ? <div className="goal-panel"><GoalDetail model={model} onBack={() => setMode("list")} onEditStructure={() => startEditor(true)} /></div>
    : mode === "editor" && editor ? <GoalEditor initial={editor.initial} busy={model.busy} error={model.error} onDirtyChange={dirty => { setEditorDirty(dirty); onDraftChange(dirty); }} onCancel={() => setMode(editor.existing ? "detail" : "list")} onPreview={editor.existing ? model.previewStructure : undefined} onSave={async draft => {
    const result = await (editor.existing ? model.saveStructure(draft) : model.createGoal(draft));
    if (result !== undefined) setMode("detail");
    return result;
  }} /> : <div className="goal-panel">
    {model.error && <div className="goal-error" role="alert"><span>{model.error}</span>{model.retry && <Button type="button" variant="ghost" onClick={() => void model.retry?.()} disabled={model.busy}>重试</Button>}</div>}
    <GoalList goals={model.goals} busy={model.busy} onSelect={(id) => { if (!model.busy) void openGoal(id); }} />
    <div className={model.goals.length ? "goal-list-create" : "goal-empty-actions"}><Button type="button" onClick={() => void createTemplate()} disabled={model.busy}>从综合素质模板创建</Button><Button type="button" variant="outline" onClick={() => startEditor(false)} disabled={model.busy}>新建目标</Button></div>
  </div>;
  return <div className="goal-workspace">
    <div className="goal-workspace-tabs" role="tablist" aria-label="计划与目标">
      <button role="tab" aria-selected={tab === "calendar"} disabled={editorDirty} title={editorDirty ? "请先保存或取消目标编辑" : undefined} onClick={() => setTab("calendar")}>计划日历</button>
      <button role="tab" aria-selected={tab === "records"} disabled={calendarLocked} onClick={() => setTab("records")}>目标档案</button>
    </div>
    {tab === "calendar" ? <PlanCalendar affairs={affairs} onOpenAffair={onOpenAffair} goals={model.goals} tasksModel={tasksModel} notes={notes} onDraftChange={handleCalendarLock} onOpenGoal={async id => { const detail = await model.selectGoal(id); if (detail) { setMode("detail"); setTab("records"); } }} /> : archiveContent}
  </div>;
}
