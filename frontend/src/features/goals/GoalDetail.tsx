import { useMemo, useState } from "react";
import { Button, Confirm, Input, type Confirmation } from "../../components/ui";
import type { GoalsModel } from "./useGoals";
import type { GoalBlock, GoalEntry } from "./types";

function localDate() {
  return new Date().toLocaleDateString("sv-SE");
}

function entryBlock(blocks: GoalBlock[], entry: GoalEntry) {
  return blocks.find((block) => block.id === entry.block_id);
}

function entryCategory(blocks: GoalBlock[], entry: GoalEntry) {
  return entryBlock(blocks, entry)?.categories.find((category) => category.id === entry.category_id);
}

function EntryRow({ entry, blocks, model, onDelete }: { entry: GoalEntry; blocks: GoalBlock[]; model: GoalsModel; onDelete: (entry: GoalEntry) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: entry.title, completed_on: entry.completed_on, category_id: entry.category_id, amount: entry.amount });
  const block = entryBlock(blocks, entry);
  const category = entryCategory(blocks, entry);
  const editBlock = blocks.find((item) => item.categories.some((itemCategory) => itemCategory.id === draft.category_id));
  const cancel = () => { setDraft({ title: entry.title, completed_on: entry.completed_on, category_id: entry.category_id, amount: entry.amount }); setEditing(false); };
  const save = async () => { const result = await model.updateEntry(entry.id, draft); if (result !== undefined) setEditing(false); };
  return <tr>
    <td data-label="完成日期">{editing ? <Input aria-label="编辑完成日期" type="date" value={draft.completed_on} onChange={(event) => setDraft({ ...draft, completed_on: event.target.value })} disabled={model.busy} /> : <time dateTime={entry.completed_on}>{entry.completed_on}</time>}</td>
    <td data-label="活动">{editing ? <Input aria-label="编辑活动名称" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} disabled={model.busy} /> : entry.title}</td>
    <td data-label="区块">{block?.title ?? "—"}</td>
    <td data-label="分类">{editing ? <select aria-label="编辑记录分类" value={draft.category_id} onChange={(event) => setDraft({ ...draft, category_id: event.target.value })} disabled={model.busy}>{editBlock?.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : category?.name ?? "—"}</td>
    <td data-label="数量">{editing ? <Input aria-label="编辑数量" type="number" min="1" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: Number(event.target.value) || 1 })} disabled={model.busy} /> : `${entry.amount} ${block?.unit_label ?? "次"}`}</td>
    <td data-label="操作" className="goal-table-actions">{editing ? <><Button type="button" variant="outline" onClick={() => void save()} disabled={model.busy || !draft.title.trim()}>保存</Button><Button type="button" variant="ghost" onClick={cancel} disabled={model.busy}>取消</Button></> : <><Button type="button" variant="ghost" aria-label={`编辑记录：${entry.title}`} onClick={() => setEditing(true)} disabled={model.busy}>编辑</Button><Button type="button" variant="ghost" aria-label={`删除记录：${entry.title}`} onClick={() => onDelete(entry)} disabled={model.busy}>删除</Button></>}</td>
  </tr>;
}

export function GoalDetail({ model, onBack, onEditStructure }: { model: GoalsModel; onBack: () => void; onEditStructure: () => void }) {
  const goal = model.selected;
  const quotaBlocks = useMemo(() => goal?.blocks.filter((block) => block.kind === "quota") ?? [], [goal]);
  const [blockId, setBlockId] = useState(() => quotaBlocks[0]?.id ?? "");
  const selectedBlock = quotaBlocks.find((block) => block.id === blockId) ?? quotaBlocks[0];
  const [categoryId, setCategoryId] = useState(() => quotaBlocks[0]?.categories[0]?.id ?? "");
  const selectedCategory = selectedBlock?.categories.find((category) => category.id === categoryId) ?? selectedBlock?.categories[0];
  const [title, setTitle] = useState("");
  const [completedOn, setCompletedOn] = useState(localDate);
  const [amount, setAmount] = useState(1);
  const [advanced, setAdvanced] = useState(false);
  const [confirm, setConfirm] = useState<Confirmation | null>(null);

  if (!goal) return <section className="goal-detail"><Button type="button" variant="ghost" onClick={onBack}>返回目标列表</Button><div className="goal-empty"><p>正在读取目标记录…</p></div></section>;

  const selectBlock = (nextBlockId: string) => {
    const nextBlock = quotaBlocks.find((block) => block.id === nextBlockId);
    setBlockId(nextBlockId);
    setCategoryId(nextBlock?.categories[0]?.id ?? "");
    setAdvanced(nextBlock?.unit_label !== "次");
  };
  const submitEntry = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCategory || !title.trim()) return;
    const result = await model.createEntry({ title: title.trim(), completed_on: completedOn, category_id: selectedCategory.id, amount });
    if (result !== undefined) { setTitle(""); setAmount(1); }
  };
  const askDelete = (entry: GoalEntry) => setConfirm({ title: "删除这条进度记录？", description: "删除后，累计数量与达成状态可能会改变。", label: "删除记录", action: async () => { await model.deleteEntry(entry.id); } });

  return <section className="goal-detail" aria-label={`${goal.title}的目标详情`}>
    <div className="goal-detail-top"><Button type="button" variant="ghost" onClick={onBack}>返回目标列表</Button><div className="goal-detail-tools"><Button type="button" variant="outline" onClick={onEditStructure} disabled={model.busy}>编辑目标结构</Button><Button type="button" variant={goal.archived_at ? "outline" : "ghost"} onClick={() => void model.setArchived(!goal.archived_at)} disabled={model.busy}>{goal.archived_at ? "恢复进行中" : "归档目标"}</Button></div></div>
    {model.error && <div className="goal-error" role="alert"><span>{model.error}</span>{model.retry && <Button type="button" variant="ghost" onClick={() => void model.retry?.()} disabled={model.busy}>重试</Button>}</div>}
    <header className="goal-detail-heading"><span className="eyebrow">RULED PROGRESS</span><h2>{goal.title}</h2>{goal.description && <p>{goal.description}</p>}<div className="goal-detail-badges"><span className={`goal-status ${goal.summary.attained ? "attained" : ""}`}>{goal.summary.attained ? "已达成" : "进行中"}</span>{goal.archived_at && <span className="goal-status archived">已归档</span>}</div></header>

    <section className="goal-section"><div className="goal-section-heading"><span className="eyebrow">RULES</span><h3>完成规则</h3></div><table className="goal-table"><thead><tr><th>区块</th><th>条件</th><th>当前</th><th>状态</th></tr></thead><tbody>{goal.summary.blocks.flatMap((block) => block.rules.map((rule) => <tr key={`${block.block_id}-${rule.key}`}><td data-label="区块">{block.title}</td><td data-label="条件">{rule.label}</td><td data-label="当前">{rule.current} / {rule.required} {rule.unit}</td><td data-label="状态"><span className={`goal-rule-state ${rule.satisfied ? "satisfied" : ""}`}>{rule.satisfied ? "已满足" : "待完成"}</span></td></tr>))}</tbody></table></section>

    {goal.blocks.some((block) => block.kind === "checklist") && <section className="goal-section"><div className="goal-section-heading"><span className="eyebrow">CHECKLIST</span><h3>清单项目</h3></div><div className="goal-checklists">{goal.blocks.filter((block) => block.kind === "checklist").map((block) => <fieldset key={block.id}><legend>{block.title}</legend>{block.checklist_items.map((item) => <label key={item.id} className={item.completed_on ? "completed" : ""}><input type="checkbox" aria-label={item.title} checked={item.completed_on !== null} disabled={model.busy} onChange={() => void model.setChecklistCompletion(item.id, item.completed_on ? null : localDate())} /><span>{item.title}</span>{item.completed_on && <time dateTime={item.completed_on}>{item.completed_on}</time>}</label>)}</fieldset>)}</div></section>}

    <section className="goal-section"><div className="goal-section-heading"><span className="eyebrow">DAILY RECORD</span><h3>添加进度</h3></div>{quotaBlocks.length ? <form className="goal-entry-form" onSubmit={(event) => void submitEntry(event)}><label>记录区块<select aria-label="记录区块" value={selectedBlock?.id ?? ""} onChange={(event) => selectBlock(event.target.value)} disabled={model.busy}>{quotaBlocks.map((block) => <option key={block.id} value={block.id}>{block.title}</option>)}</select></label><label>记录分类<select aria-label="记录分类" value={selectedCategory?.id ?? ""} onChange={(event) => setCategoryId(event.target.value)} disabled={model.busy}>{selectedBlock?.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="goal-entry-title">活动名称<Input aria-label="活动名称" list={`goal-suggestions-${selectedCategory?.id ?? "none"}`} placeholder="可自由输入活动名称" value={title} onChange={(event) => setTitle(event.target.value)} disabled={model.busy} />{selectedCategory && <datalist id={`goal-suggestions-${selectedCategory.id}`}>{selectedCategory.suggestions.map((suggestion) => <option key={suggestion.id} value={suggestion.title} />)}</datalist>}</label><label>完成日期<Input aria-label="完成日期" type="date" value={completedOn} onChange={(event) => setCompletedOn(event.target.value)} disabled={model.busy} /></label>{selectedBlock?.unit_label !== "次" || advanced ? <label>数量<Input aria-label="数量" type="number" min="1" value={amount} onChange={(event) => setAmount(Number(event.target.value) || 1)} disabled={model.busy} /></label> : <Button type="button" variant="ghost" className="goal-advanced" onClick={() => setAdvanced(true)} disabled={model.busy}>高级字段</Button>}<Button type="submit" disabled={model.busy || !title.trim() || !selectedCategory}>记录进度</Button></form> : <p className="goal-hint">这个目标暂时没有可记录的数量区块。</p>}</section>

    <section className="goal-section"><div className="goal-section-heading"><span className="eyebrow">PROGRESS LOG</span><h3>进度记录</h3></div>{goal.entries.length ? <table className="goal-table goal-record-table"><thead><tr><th>完成日期</th><th>活动</th><th>区块</th><th>分类</th><th>数量</th><th>操作</th></tr></thead><tbody>{goal.entries.map((entry) => <EntryRow key={entry.id} entry={entry} blocks={goal.blocks} model={model} onDelete={askDelete} />)}</tbody></table> : <p className="goal-hint">还没有记录。留下第一条日常推进吧。</p>}</section>
    <Confirm value={confirm} onClose={() => setConfirm(null)} />
  </section>;
}
