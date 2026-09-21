import { useEffect, useState } from "react";
import { Button } from "../../components/ui";
import type { GoalsModel } from "./useGoals";
import { GoalDetail } from "./GoalDetail";
import { GoalList } from "./GoalList";
import "./goals.css";

type GoalMode = "list" | "detail" | "editor";

export function GoalsPanel({ model, onDraftChange }: { model: GoalsModel; onDraftChange: (dirty: boolean) => void }) {
  const [mode, setMode] = useState<GoalMode>(model.selected ? "detail" : "list");
  useEffect(() => { if (mode !== "editor") onDraftChange(false); }, [mode, onDraftChange]);
  const openGoal = async (id: string) => { const detail = await model.selectGoal(id); if (detail !== undefined) setMode("detail"); };
  const createTemplate = async () => { const detail = await model.createFromTemplate("full-time-postgraduate-quality"); if (detail !== undefined) setMode("detail"); };
  if (mode === "detail") return <div className="goal-panel"><GoalDetail model={model} onBack={() => setMode("list")} onEditStructure={() => setMode("editor")} /></div>;
  if (mode === "editor") return <section className="goal-panel goal-editor-placeholder"><Button type="button" variant="ghost" onClick={() => setMode("list")}>返回目标列表</Button><span className="eyebrow">STRUCTURE EDITOR</span><h2>目标结构编辑</h2><p>目标规则的创建与编辑将在下一步提供。这里先保留清晰的返回路径，日常记录不会受影响。</p></section>;
  return <div className="goal-panel">{model.error && <div className="goal-error" role="alert"><span>{model.error}</span>{model.retry && <Button type="button" variant="ghost" onClick={() => void model.retry?.()} disabled={model.busy}>重试</Button>}</div>}<GoalList goals={model.goals} busy={model.busy} onSelect={(id) => void openGoal(id)} />{!model.goals.length && <div className="goal-empty-actions"><Button type="button" onClick={() => void createTemplate()} disabled={model.busy}>从综合素质模板创建</Button><Button type="button" variant="outline" onClick={() => setMode("editor")} disabled={model.busy}>新建目标</Button></div>}</div>;
}
