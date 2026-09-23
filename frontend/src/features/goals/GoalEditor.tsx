import { useRef, useState } from "react";
import { Button, Confirm, Input, type Confirmation } from "../../components/ui";
import type { GoalBlockKind, GoalDraft, GoalPreview } from "./types";

type Block = GoalDraft["blocks"][number];
type Item = Block["checklist_items"][number] & { key: string };
type Category = Omit<Block["categories"][number], "suggestions"> & { key: string; suggestions: Item[] };
type EditorBlock = Omit<Block, "categories" | "checklist_items"> & { key: string; categories: Category[]; checklist_items: Item[] };
type Draft = Omit<GoalDraft, "blocks"> & { blocks: EditorBlock[] };
const key = () => crypto.randomUUID();
const newItem = (): Item => ({ key: key(), title: "", position: 0 });
const newBlock = (kind: GoalBlockKind): EditorBlock => ({ key: key(), kind, title: "", unit_label: "次", minimum_total: null, minimum_distinct_categories: null, position: 0, checklist_items: kind === "checklist" ? [newItem()] : [], categories: [] });
export const blankGoal = (): GoalDraft => ({ title: "", description: "", blocks: [{ kind: "checklist", title: "", unit_label: "次", minimum_total: null, minimum_distinct_categories: null, position: 0, checklist_items: [{ title: "", position: 0 }], categories: [] }] });

function initialize(initial: GoalDraft): Draft {
  return { title: initial.title, description: initial.description, blocks: initial.blocks.map(block => ({ ...block, key: key(), checklist_items: block.checklist_items.map(item => ({ ...item, key: key() })), categories: block.categories.map(category => ({ ...category, key: key(), suggestions: category.suggestions.map(suggestion => ({ ...suggestion, key: key() })) })) })) };
}

// Explicitly construct the API shape, excluding client keys and completion state.
function buildDraft(draft: Draft): GoalDraft {
  const item = (value: Item, position: number) => ({ ...(value.id ? { id: value.id } : {}), title: value.title.trim(), position });
  return { title: draft.title.trim(), description: draft.description, blocks: draft.blocks.map((block, position) => ({
    ...(block.id ? { id: block.id } : {}), kind: block.kind, title: block.title.trim(), unit_label: block.unit_label.trim(), minimum_total: block.minimum_total, minimum_distinct_categories: block.minimum_distinct_categories, position,
    checklist_items: block.checklist_items.map(item), categories: block.categories.map((category, categoryPosition) => ({
      ...(category.id ? { id: category.id } : {}), name: category.name.trim(), minimum_amount: category.minimum_amount, is_required: category.is_required, position: categoryPosition, suggestions: category.suggestions.map(item),
    })),
  })) };
}

const validName = (value: string, max = 200) => value.trim().length > 0 && value.trim().length <= max;
const positive = (value: number) => Number.isFinite(value) && value > 0 && value <= 1_000_000;
function blockErrors(block: EditorBlock): string[] {
  const errors: string[] = [];
  if (!validName(block.title)) errors.push("条件名称需为 1–200 个字符");
  if (block.kind === "checklist") {
    if (!block.checklist_items.length) errors.push("清单型条件至少需要一个清单项");
    if (block.checklist_items.some(item => !validName(item.title))) errors.push("清单项名称需为 1–200 个字符");
  } else {
    if (!validName(block.unit_label, 20)) errors.push("计数单位需为 1–20 个字符");
    if (!block.categories.length) errors.push("计数型条件至少需要一个统计分类");
    if (block.minimum_total === null && block.minimum_distinct_categories === null && !block.categories.some(category => category.is_required)) errors.push("计数型条件至少需要一项达标规则");
    if (block.minimum_total !== null && !positive(block.minimum_total)) errors.push("最低累计量须大于 0 且不超过 1000000");
    if (block.minimum_distinct_categories !== null && (!Number.isInteger(block.minimum_distinct_categories) || block.minimum_distinct_categories < 1 || block.minimum_distinct_categories > block.categories.length)) errors.push("最少覆盖分类数须为正整数，且不能超过分类总数");
    if (block.categories.some(category => !validName(category.name, 100))) errors.push("分类名称需为 1–100 个字符");
    if (block.categories.some(category => !positive(category.minimum_amount))) errors.push("分类最低数量须大于 0 且不超过 1000000");
    if (block.categories.some(category => category.suggestions.some(suggestion => !validName(suggestion.title)))) errors.push("建议名称需为 1–200 个字符");
  }
  return errors;
}

function move<T>(rows: T[], index: number, direction: number) {
  const result = [...rows];
  [result[index], result[index + direction]] = [result[index + direction], result[index]];
  return result;
}

function RowActions({ label, index, count, onMove, onRemove }: { label: string; index: number; count: number; onMove: (direction: number) => void; onRemove: () => void }) {
  return <div className="goal-row-actions">
    <Button type="button" variant="ghost" aria-label={`上移${label}`} disabled={index === 0} onClick={() => onMove(-1)}>上移</Button>
    <Button type="button" variant="ghost" aria-label={`下移${label}`} disabled={index === count - 1} onClick={() => onMove(1)}>下移</Button>
    <Button type="button" variant="ghost" aria-label={`删除${label}`} onClick={onRemove}>删除</Button>
  </div>;
}

export function GoalEditor({ initial, busy, onPreview, onSave, onCancel, onDirtyChange, error }: {
  initial: GoalDraft;
  busy: boolean;
  onPreview?: (draft: GoalDraft) => Promise<GoalPreview | undefined>;
  onSave: (draft: GoalDraft) => Promise<unknown>;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
  error?: string | null;
}) {
  const [draft, setDraft] = useState(() => initialize(initial));
  const [attempted, setAttempted] = useState(false);
  const [failure, setFailure] = useState("");
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const dirty = useRef(false);
  const inFlight = useRef(false);
  const locked = busy || pending;
  function change(next: Draft) {
    setDraft(next);
    setFailure("");
    if (!dirty.current) { dirty.current = true; onDirtyChange(true); }
  }
  const changeBlock = (index: number, block: EditorBlock) => change({ ...draft, blocks: draft.blocks.map((current, i) => i === index ? block : current) });
  function switchKind(index: number, kind: GoalBlockKind) {
    const block = draft.blocks[index];
    if (block.kind === kind) return;
    const apply = () => changeBlock(index, { ...newBlock(kind), key: block.key, id: block.id, title: block.title, position: block.position });
    const losesContent = block.kind === "checklist" ? block.checklist_items.some(item => item.id || item.title.trim()) : block.categories.length > 0 || block.minimum_total !== null || block.minimum_distinct_categories !== null || block.unit_label !== "次";
    if (losesContent) setConfirm({ title: "切换条件类型？", description: "原类型的清单项、分类与计数规则将被清空。已有记录的分类仍需先处理记录后才能保存。", label: "切换类型", action: apply });
    else apply();
  }
  async function persist(value: GoalDraft) {
    const result = await onSave(value);
    if (result === undefined) throw new Error("保存失败，请重试。");
    dirty.current = false;
    onDirtyChange(false);
  }
  async function run(operation: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setFailure("");
    try { await operation(); }
    catch (caught) { setFailure(caught instanceof Error ? caught.message : "操作失败，请重试。"); }
    finally { inFlight.current = false; setPending(false); }
  }
  function submit() {
    setAttempted(true);
    if (!validName(draft.title) || draft.description.length > 5000 || !draft.blocks.length || draft.blocks.some(block => blockErrors(block).length)) return;
    const value = buildDraft(draft);
    void run(async () => {
      if (onPreview) {
        const preview = await onPreview(value);
        if (!preview) throw new Error("预览失败，请重试。");
        const messages = [...preview.warnings];
        if (preview.current_summary.attained !== preview.proposed_summary.attained) messages.push(`达成结果将从“${preview.current_summary.attained ? "已达成" : "未达成"}”变为“${preview.proposed_summary.attained ? "已达成" : "未达成"}”。`);
        if (messages.length) {
          setConfirm({ title: "保存这些条件修改？", description: messages.join("\n"), label: "仍然保存", action: () => run(() => persist(value)) });
          return;
        }
      }
      await persist(value);
    });
  }

  return <section className="goal-panel goal-editor">
    <header><span className="eyebrow">GOAL STRUCTURE</span><h2>把目标拆成可验证的条件</h2><p className="goal-hint">所有条件都满足，目标即达成。清单逐项完成；计数按已完成记录累计。</p></header>
    {failure && <div className="goal-error" role="alert"><span>{error || failure}</span><Button type="button" variant="ghost" disabled={locked} onClick={submit}>重试</Button></div>}
    <form noValidate onSubmit={event => { event.preventDefault(); submit(); }}>
      <fieldset className="goal-editor-fields" disabled={locked}>
        <div className="goal-editor-basics">
          <label>目标名称<Input value={draft.title} maxLength={200} onChange={event => change({ ...draft, title: event.target.value })} /></label>
          {attempted && !validName(draft.title) && <p className="goal-validation" role="alert">目标名称需为 1–200 个字符</p>}
          <label>目标说明<textarea className="input" value={draft.description} maxLength={5000} rows={3} onChange={event => change({ ...draft, description: event.target.value })} /></label>
        </div>
        {draft.blocks.map((block, blockIndex) => <section className="goal-editor-block" key={block.key} aria-label={`条件 ${blockIndex + 1}`}>
          <div className="goal-editor-block-head"><h3>条件 {String(blockIndex + 1).padStart(2, "0")}</h3><RowActions label={`条件 ${blockIndex + 1}`} index={blockIndex} count={draft.blocks.length} onMove={direction => change({ ...draft, blocks: move(draft.blocks, blockIndex, direction) })} onRemove={() => change({ ...draft, blocks: draft.blocks.filter((_, index) => index !== blockIndex) })} /></div>
          <div className="goal-editor-grid">
            <label>条件名称<Input value={block.title} maxLength={200} onChange={event => changeBlock(blockIndex, { ...block, title: event.target.value })} /></label>
            <label>条件类型<select value={block.kind} onChange={event => switchKind(blockIndex, event.target.value as GoalBlockKind)}><option value="checklist">清单 · 全部完成</option><option value="quota">计数 · 累计与覆盖</option></select></label>
          </div>
          {block.kind === "checklist" ? <>
            <p className="goal-hint">列出明确的完成条件，例如“提交论文初稿”。</p>
            {block.checklist_items.map((item, index) => <div className="goal-editor-row" key={item.key}>
              <label>清单项名称<Input value={item.title} maxLength={200} onChange={event => changeBlock(blockIndex, { ...block, checklist_items: block.checklist_items.map((current, i) => i === index ? { ...item, title: event.target.value } : current) })} /></label>
              <RowActions label={`清单项 ${index + 1}`} index={index} count={block.checklist_items.length} onMove={direction => changeBlock(blockIndex, { ...block, checklist_items: move(block.checklist_items, index, direction) })} onRemove={() => changeBlock(blockIndex, { ...block, checklist_items: block.checklist_items.filter((_, i) => i !== index) })} />
            </div>)}
            <Button type="button" variant="outline" disabled={block.checklist_items.length >= 200} onClick={() => changeBlock(blockIndex, { ...block, checklist_items: [...block.checklist_items, newItem()] })}>添加清单项</Button>
          </> : <>
            <div className="goal-editor-grid goal-quota-rules">
              <label>计数单位<Input value={block.unit_label} maxLength={20} onChange={event => changeBlock(blockIndex, { ...block, unit_label: event.target.value })} /></label>
              <label>最低累计量<Input type="number" min="0" max="1000000" step="any" placeholder="可不填" value={block.minimum_total ?? ""} onChange={event => changeBlock(blockIndex, { ...block, minimum_total: event.target.value === "" ? null : event.target.valueAsNumber })} /></label>
              <label>最少覆盖分类数<Input type="number" min="1" max={block.categories.length || 100} step="1" placeholder="可不填" value={block.minimum_distinct_categories ?? ""} onChange={event => changeBlock(blockIndex, { ...block, minimum_distinct_categories: event.target.value === "" ? null : event.target.valueAsNumber })} /></label>
            </div>
            <p className="goal-hint">累计量、覆盖分类数和必选分类至少设置一项。分类达到自身最低数量才计入覆盖数；所有已设置要求须同时满足。</p>
            {block.categories.map((category, categoryIndex) => {
              const updateCategory = (next: Category) => changeBlock(blockIndex, { ...block, categories: block.categories.map((current, index) => index === categoryIndex ? next : current) });
              return <div className="goal-editor-category" key={category.key}>
                <div className="goal-editor-row"><label>分类名称<Input value={category.name} maxLength={100} onChange={event => updateCategory({ ...category, name: event.target.value })} /></label><RowActions label={`分类 ${categoryIndex + 1}`} index={categoryIndex} count={block.categories.length} onMove={direction => changeBlock(blockIndex, { ...block, categories: move(block.categories, categoryIndex, direction) })} onRemove={() => changeBlock(blockIndex, { ...block, categories: block.categories.filter((_, index) => index !== categoryIndex) })} /></div>
                <div className="goal-editor-grid"><label>分类最低数量<Input type="number" min="0" max="1000000" step="any" value={Number.isNaN(category.minimum_amount) ? "" : category.minimum_amount} onChange={event => updateCategory({ ...category, minimum_amount: event.target.valueAsNumber })} /></label><label className="goal-editor-check"><input type="checkbox" checked={category.is_required} onChange={event => updateCategory({ ...category, is_required: event.target.checked })} />必选分类（必须达到最低数量）</label></div>
                <details><summary>活动名称建议</summary><p className="goal-hint">仅帮助填写，记录时仍可输入任意活动名称。</p>
                  {category.suggestions.map((suggestion, index) => <div className="goal-editor-row" key={suggestion.key}><label>建议名称<Input value={suggestion.title} maxLength={200} onChange={event => updateCategory({ ...category, suggestions: category.suggestions.map((current, i) => i === index ? { ...suggestion, title: event.target.value } : current) })} /></label><RowActions label={`建议 ${index + 1}`} index={index} count={category.suggestions.length} onMove={direction => updateCategory({ ...category, suggestions: move(category.suggestions, index, direction) })} onRemove={() => updateCategory({ ...category, suggestions: category.suggestions.filter((_, i) => i !== index) })} /></div>)}
                  <Button type="button" variant="ghost" disabled={category.suggestions.length >= 100} onClick={() => updateCategory({ ...category, suggestions: [...category.suggestions, newItem()] })}>添加建议</Button>
                </details>
              </div>;
            })}
            <Button type="button" variant="outline" disabled={block.categories.length >= 100} onClick={() => changeBlock(blockIndex, { ...block, categories: [...block.categories, { key: key(), name: "", minimum_amount: 1, is_required: false, position: 0, suggestions: [] }] })}>添加分类</Button>
          </>}
          {attempted && blockErrors(block).map(message => <p key={message} className="goal-validation" role="alert">{message}</p>)}
        </section>)}
        {attempted && !draft.blocks.length && <p className="goal-validation" role="alert">目标至少需要一个条件块</p>}
        <div className="goal-editor-add"><Button type="button" variant="outline" disabled={draft.blocks.length >= 50} onClick={() => change({ ...draft, blocks: [...draft.blocks, newBlock("checklist")] })}>添加清单条件</Button><Button type="button" variant="outline" disabled={draft.blocks.length >= 50} onClick={() => change({ ...draft, blocks: [...draft.blocks, newBlock("quota")] })}>添加计数条件</Button></div>
        <div className="goal-editor-footer"><Button type="button" variant="ghost" onClick={() => { dirty.current = false; onDirtyChange(false); onCancel(); }}>取消编辑</Button><Button type="submit">{locked ? "正在检查与保存…" : "保存目标"}</Button></div>
      </fieldset>
    </form>
    <Confirm value={confirm} onClose={() => setConfirm(null)} />
  </section>;
}
