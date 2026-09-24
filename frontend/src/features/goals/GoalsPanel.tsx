import { useEffect, useState } from "react";
import { Button } from "../../components/ui";
import type { GoalsModel } from "./useGoals";
import type { GoalDraft } from "./types";
import { GoalEditor, blankGoal } from "./GoalEditor";
import { GoalDetail } from "./GoalDetail";
import { GoalList } from "./GoalList";
import "./goals.css";

type GoalMode = "list" | "detail" | "editor";

export function GoalsPanel({ model, onDraftChange }: { model: GoalsModel; onDraftChange: (dirty: boolean) => void }) {
  const [mode, setMode] = useState<GoalMode>(model.selected ? "detail" : "list");
  const [editor, setEditor] = useState<{ initial: GoalDraft; existing: boolean } | null>(null);
  useEffect(() => { if (mode !== "editor") onDraftChange(false); }, [mode, onDraftChange]);
  const openGoal = async (id: string) => { const detail = await model.selectGoal(id); if (detail !== undefined) setMode("detail"); };
  const createTemplate = async () => { const detail = await model.createFromTemplate("full-time-postgraduate-quality"); if (detail !== undefined) setMode("detail"); };
  const startEditor = (existing: boolean) => { setEditor({ initial: existing && model.selected ? model.selected : blankGoal(), existing }); setMode("editor"); };
  if (mode === "detail") return <div className="goal-panel"><GoalDetail model={model} onBack={() => setMode("list")} onEditStructure={() => startEditor(true)} /></div>;
  if (mode === "editor" && editor) return <GoalEditor initial={editor.initial} busy={model.busy} error={model.error} onDirtyChange={onDraftChange} onCancel={() => setMode(editor.existing ? "detail" : "list")} onPreview={editor.existing ? model.previewStructure : undefined} onSave={async draft => {
    const result = await (editor.existing ? model.saveStructure(draft) : model.createGoal(draft));
    if (result !== undefined) setMode("detail");
    return result;
  }} />;
  return <div className="goal-panel">
    {model.error && <div className="goal-error" role="alert"><span>{model.error}</span>{model.retry && <Button type="button" variant="ghost" onClick={() => void model.retry?.()} disabled={model.busy}>重试</Button>}</div>}
    <GoalList goals={model.goals} busy={model.busy} onSelect={(id) => { if (!model.busy) void openGoal(id); }} />
    <div className={model.goals.length ? "goal-list-create" : "goal-empty-actions"}><Button type="button" onClick={() => void createTemplate()} disabled={model.busy}>从综合素质模板创建</Button><Button type="button" variant="outline" onClick={() => startEditor(false)} disabled={model.busy}>新建目标</Button></div>
  </div>;
}
