import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { GoalsPanel } from "../features/goals/GoalsPanel";
import type { GoalsModel } from "../features/goals/useGoals";
import type { GoalDetail } from "../features/goals/types";

const today = new Date().toLocaleDateString("sv-SE");

const detail: GoalDetail = {
  id: "goal-1",
  title: "研究生综合素质",
  description: "在日常记录中完成培养要求",
  archived_at: null,
  created_at: "2026-09-01T08:00:00Z",
  updated_at: "2026-09-20T08:00:00Z",
  summary: {
    attained: true,
    blocks: [
      { block_id: "check", title: "论文", kind: "checklist", attained: true, rules: [{ key: "checklist", label: "清单项目", current: 1, required: 1, unit: "项", satisfied: true }] },
      { block_id: "quota", title: "学术活动", kind: "quota", attained: false, rules: [
        { key: "total", label: "累计数量", current: 6, required: 8, unit: "次", satisfied: false },
        { key: "distinct", label: "覆盖分类", current: 2, required: 3, unit: "类", satisfied: false },
      ] },
    ],
  },
  blocks: [
    { id: "check", kind: "checklist", title: "论文", unit_label: "项", minimum_total: null, minimum_distinct_categories: null, position: 0, categories: [], checklist_items: [{ id: "draft", title: "提交初稿", completed_on: null, position: 0 }] },
    { id: "quota", kind: "quota", title: "学术活动", unit_label: "次", minimum_total: 8, minimum_distinct_categories: 3, position: 1, checklist_items: [], categories: [
      { id: "seminar", name: "学术讲座", minimum_amount: 1, is_required: true, position: 0, suggestions: [{ id: "talk", title: "学院讲座", position: 0 }] },
      { id: "conference", name: "学术会议", minimum_amount: 1, is_required: true, position: 1, suggestions: [] },
      { id: "training", name: "学术培训", minimum_amount: 1, is_required: false, position: 2, suggestions: [] },
    ] },
  ],
  entries: [{ id: "entry-1", block_id: "quota", category_id: "seminar", title: "学院讲座", completed_on: "2026-09-18", amount: 1, created_at: "2026-09-18T08:00:00Z", updated_at: "2026-09-18T08:00:00Z" }],
};

function modelFor(overrides: Partial<GoalsModel> = {}): GoalsModel {
  return {
    goals: [{ ...detail }, { ...detail, id: "archived", title: "旧目标", archived_at: "2026-09-19T08:00:00Z", summary: { ...detail.summary, attained: false } }],
    selected: detail,
    templates: [{ key: "full-time-postgraduate-quality", title: "综合素质模板", description: "" }],
    loading: false,
    busy: false,
    error: null,
    retry: undefined,
    selectGoal: vi.fn(),
    createGoal: vi.fn(),
    createFromTemplate: vi.fn(),
    saveStructure: vi.fn(),
    previewStructure: vi.fn(),
    setArchived: vi.fn(),
    setChecklistCompletion: vi.fn(),
    createEntry: vi.fn().mockResolvedValue(detail),
    updateEntry: vi.fn(),
    deleteEntry: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  };
}

it("offers template creation and a new goal from the empty ledger", () => {
  render(<GoalsPanel model={modelFor({ goals: [], selected: null })} onDraftChange={vi.fn()} />);
  expect(screen.getByRole("button", { name: "从综合素质模板创建" })).toBeVisible();
  expect(screen.getByRole("button", { name: "新建目标" })).toBeVisible();
});

it("keeps attained and archived badges distinct in the goal list", async () => {
  render(<GoalsPanel model={modelFor({ selected: null })} onDraftChange={vi.fn()} />);
  const activeRow = screen.getByText("研究生综合素质").closest(".goal-list-row") as HTMLElement;
  expect(within(activeRow).getByText("已达成")).toBeVisible();
  expect(within(activeRow).queryByText("已归档")).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole("button", { name: "已归档" }));
  const archivedRow = screen.getByText("旧目标").closest(".goal-list-row") as HTMLElement;
  expect(within(archivedRow).getByText("已归档")).toBeVisible();
  expect(within(archivedRow).queryByText("已达成")).not.toBeInTheDocument();
});

it("opens the selected goal after a successful list selection", async () => {
  const model = modelFor({ selected: null });
  model.selectGoal = vi.fn().mockImplementation(async () => {
    model.selected = detail;
    return detail;
  });
  const user = userEvent.setup();
  render(<GoalsPanel model={model} onDraftChange={vi.fn()} />);
  await user.click(screen.getByText("研究生综合素质").closest("button")!);
  expect(await screen.findByRole("heading", { name: "研究生综合素质" })).toBeVisible();
});

it("opens the template detail after successful template creation", async () => {
  const model = modelFor({ goals: [], selected: null });
  model.createFromTemplate = vi.fn().mockImplementation(async () => {
    model.selected = detail;
    return detail;
  });
  const user = userEvent.setup();
  render(<GoalsPanel model={model} onDraftChange={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "从综合素质模板创建" }));
  expect(await screen.findByRole("heading", { name: "研究生综合素质" })).toBeVisible();
});

it("shows rule totals without an overall percentage", () => {
  render(<GoalsPanel model={modelFor()} onDraftChange={vi.fn()} />);
  expect(screen.getByText("累计数量")).toBeVisible();
  expect(screen.getByText("6 / 8 次")).toBeVisible();
  expect(screen.getByText("覆盖分类")).toBeVisible();
  expect(screen.getByText("2 / 3 类")).toBeVisible();
  expect(screen.queryByText(/%/)).not.toBeInTheDocument();
});

it("records checklist completion with today's local date", async () => {
  const model = modelFor();
  const user = userEvent.setup();
  render(<GoalsPanel model={model} onDraftChange={vi.fn()} />);
  await user.click(screen.getByRole("checkbox", { name: "提交初稿" }));
  expect(model.setChecklistCompletion).toHaveBeenCalledWith("draft", today);
});

it("keeps checklist and progress form touch targets at least 40px high", async () => {
  const user = userEvent.setup();
  render(<GoalsPanel model={modelFor()} onDraftChange={vi.fn()} />);
  expect(getComputedStyle(screen.getByRole("checkbox", { name: "提交初稿" }).closest("label")!).minHeight).toBe("40px");
  expect(getComputedStyle(screen.getByLabelText("活动名称")).minHeight).toBe("40px");
  expect(getComputedStyle(screen.getByLabelText("完成日期")).minHeight).toBe("40px");
  await user.click(screen.getByRole("button", { name: "高级字段" }));
  expect(getComputedStyle(screen.getByLabelText("数量")).minHeight).toBe("40px");
});

it("records a custom activity title after choosing block and category", async () => {
  const model = modelFor();
  const user = userEvent.setup();
  render(<GoalsPanel model={model} onDraftChange={vi.fn()} />);
  await user.selectOptions(screen.getByLabelText("记录区块"), "quota");
  await user.selectOptions(screen.getByLabelText("记录分类"), "seminar");
  await user.type(screen.getByLabelText("活动名称"), "自定义工作坊");
  await user.click(screen.getByRole("button", { name: "记录进度" }));
  expect(model.createEntry).toHaveBeenCalledWith({ title: "自定义工作坊", completed_on: today, category_id: "seminar", amount: 1 });
});

it("clears only the title and resets the amount after recording progress", async () => {
  const model = modelFor();
  const user = userEvent.setup();
  render(<GoalsPanel model={model} onDraftChange={vi.fn()} />);
  await user.type(screen.getByLabelText("活动名称"), "自定义工作坊");
  await user.click(screen.getByRole("button", { name: "高级字段" }));
  await user.clear(screen.getByLabelText("数量"));
  await user.type(screen.getByLabelText("数量"), "3");
  await user.click(screen.getByRole("button", { name: "记录进度" }));
  expect(screen.getByLabelText("活动名称")).toHaveValue("");
  expect(screen.getByLabelText("数量")).toHaveValue(1);
  expect(screen.getByLabelText("完成日期")).toHaveValue(today);
  expect(screen.getByLabelText("记录区块")).toHaveValue("quota");
  expect(screen.getByLabelText("记录分类")).toHaveValue("seminar");
});

it("exits entry edit mode after a successful update", async () => {
  const model = modelFor({ updateEntry: vi.fn().mockResolvedValue(detail) });
  const user = userEvent.setup();
  render(<GoalsPanel model={model} onDraftChange={vi.fn()} />);
  const row = screen.getByText("学院讲座").closest("tr")!;
  await user.click(within(row).getByRole("button", { name: "编辑记录：学院讲座" }));
  expect(screen.getByLabelText("编辑活动名称")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "保存" }));
  expect(screen.queryByLabelText("编辑活动名称")).not.toBeInTheDocument();
  expect(within(row).getByRole("button", { name: "编辑记录：学院讲座" })).toBeVisible();
});

it("confirms before deleting a progress record", async () => {
  const model = modelFor();
  const user = userEvent.setup();
  render(<GoalsPanel model={model} onDraftChange={vi.fn()} />);
  const row = screen.getByText("学院讲座").closest("tr")!;
  await user.click(within(row).getByRole("button", { name: "删除记录：学院讲座" }));
  expect(screen.getByText("删除这条进度记录？")).toBeVisible();
  expect(model.deleteEntry).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "删除记录" }));
  expect(model.deleteEntry).toHaveBeenCalledWith("entry-1");
});

it("keeps a model error visible with a retry action", async () => {
  const retry = vi.fn();
  const user = userEvent.setup();
  render(<GoalsPanel model={modelFor({ error: "保存失败", retry })} onDraftChange={vi.fn()} />);
  expect(screen.getByRole("alert")).toHaveTextContent("保存失败");
  await user.click(screen.getByRole("button", { name: "重试" }));
  expect(retry).toHaveBeenCalledOnce();
});

it("keeps record labels available to the 360px table layout", () => {
  render(<GoalsPanel model={modelFor()} onDraftChange={vi.fn()} />);
  const row = screen.getByText("学院讲座").closest("tr")!;
  expect(within(row).getByText("2026-09-18").closest("td")?.getAttribute("data-label")).toBe("完成日期");
  expect(within(row).getByText("学院讲座").closest("td")?.getAttribute("data-label")).toBe("活动");
});

async function newEditor(overrides: Partial<GoalsModel> = {}) {
  const model = modelFor({ goals: [], selected: null, ...overrides });
  const dirty = vi.fn();
  const user = userEvent.setup();
  render(<GoalsPanel model={model} onDraftChange={dirty} />);
  await user.click(screen.getByRole("button", { name: "新建目标" }));
  return { model, dirty, user };
}

it("starts a new goal with one checklist and one empty item", async () => {
  await newEditor();
  expect(screen.getAllByLabelText("条件名称")).toHaveLength(1);
  expect(screen.getByLabelText("条件类型")).toHaveValue("checklist");
  expect(screen.getAllByLabelText("清单项名称")).toHaveLength(1);
  expect(screen.getByLabelText("清单项名称")).toHaveValue("");
});

it("confirms before a kind switch discards entered fields", async () => {
  const { user } = await newEditor();
  await user.type(screen.getByLabelText("清单项名称"), "初稿");
  await user.selectOptions(screen.getByLabelText("条件类型"), "quota");
  expect(screen.getByRole("alertdialog")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "取消" }));
  expect(screen.getByLabelText("清单项名称")).toHaveValue("初稿");
  await user.selectOptions(screen.getByLabelText("条件类型"), "quota");
  await user.click(screen.getByRole("button", { name: "切换类型" }));
  expect(screen.queryByLabelText("清单项名称")).not.toBeInTheDocument();
  expect(screen.getByLabelText("最低累计量")).toHaveValue(null);
});

it("rejects quota blocks without categories or a rule", async () => {
  const { user, model } = await newEditor();
  await user.type(screen.getByLabelText("目标名称"), "准备毕业");
  await user.selectOptions(screen.getByLabelText("条件类型"), "quota");
  await user.type(screen.getByLabelText("条件名称"), "活动");
  await user.click(screen.getByRole("button", { name: "保存目标" }));
  expect(screen.getByText("计数型条件至少需要一个统计分类")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "添加分类" }));
  await user.type(screen.getByLabelText("分类名称"), "自定分类");
  await user.click(screen.getByRole("button", { name: "保存目标" }));
  expect(screen.getByText("计数型条件至少需要一项达标规则")).toBeVisible();
  expect(model.createGoal).not.toHaveBeenCalled();
});

it("saves a mixed goal with exact custom category and suggestion structure", async () => {
  const { user, model } = await newEditor();
  await user.type(screen.getByLabelText("目标名称"), "准备毕业");
  await user.type(screen.getByLabelText("目标说明"), "毕业准备");
  await user.type(screen.getByLabelText("条件名称"), "论文");
  await user.type(screen.getByLabelText("清单项名称"), "提交初稿");
  await user.click(screen.getByRole("button", { name: "添加计数条件" }));
  await user.type(screen.getAllByLabelText("条件名称")[1], "学术活动");
  await user.type(screen.getByLabelText("最低累计量"), "2");
  await user.click(screen.getByRole("button", { name: "添加分类" }));
  await user.type(screen.getByLabelText("分类名称"), "自定分类");
  await user.click(screen.getByText("活动名称建议"));
  await user.click(screen.getByRole("button", { name: "添加建议" }));
  await user.type(screen.getByLabelText("建议名称"), "自定工作坊");
  await user.click(screen.getByRole("button", { name: "保存目标" }));
  expect(model.createGoal).toHaveBeenCalledWith({ title: "准备毕业", description: "毕业准备", blocks: [
    { kind: "checklist", title: "论文", unit_label: "次", minimum_total: null, minimum_distinct_categories: null, position: 0, checklist_items: [{ title: "提交初稿", position: 0 }], categories: [] },
    { kind: "quota", title: "学术活动", unit_label: "次", minimum_total: 2, minimum_distinct_categories: null, position: 1, checklist_items: [], categories: [{ name: "自定分类", minimum_amount: 1, is_required: false, position: 0, suggestions: [{ title: "自定工作坊", position: 0 }] }] },
  ] });
  expect(model.previewStructure).not.toHaveBeenCalled();
});

it("previews an existing goal before saving and strips completion fields", async () => {
  const order: string[] = [];
  const model = modelFor({ previewStructure: vi.fn(async () => { order.push("preview"); return { current_summary: detail.summary, proposed_summary: detail.summary, warnings: [] }; }), saveStructure: vi.fn(async () => { order.push("save"); return detail; }) });
  const user = userEvent.setup();
  render(<GoalsPanel model={model} onDraftChange={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "编辑目标结构" }));
  await user.type(screen.getByLabelText("目标名称"), "新版");
  await user.click(screen.getByRole("button", { name: "保存目标" }));
  expect(order).toEqual(["preview", "save"]);
  const draft = vi.mocked(model.saveStructure).mock.calls[0][0];
  expect(draft.blocks[0].checklist_items[0]).toEqual({ id: "draft", title: "提交初稿", position: 0 });
});

it("shows preview warnings and attainment impact, with cancel preserving dirty draft", async () => {
  const dirty = vi.fn();
  const model = modelFor({ previewStructure: vi.fn().mockResolvedValue({ current_summary: detail.summary, proposed_summary: { ...detail.summary, attained: false }, warnings: ["清单完成状态将被删除"] }) });
  const user = userEvent.setup();
  render(<GoalsPanel model={model} onDraftChange={dirty} />);
  await user.click(screen.getByRole("button", { name: "编辑目标结构" }));
  await user.type(screen.getByLabelText("目标名称"), "新版");
  await user.click(screen.getByRole("button", { name: "保存目标" }));
  expect(screen.getByRole("alertdialog")).toHaveTextContent("清单完成状态将被删除");
  expect(screen.getByRole("alertdialog")).toHaveTextContent("未达成");
  await user.click(screen.getByRole("button", { name: "取消" }));
  expect(model.saveStructure).not.toHaveBeenCalled();
  expect(dirty).toHaveBeenLastCalledWith(true);
  expect(screen.getByLabelText("目标名称")).toHaveValue("研究生综合素质新版");
  await user.click(screen.getByRole("button", { name: "保存目标" }));
  await user.click(screen.getByRole("button", { name: "仍然保存" }));
  expect(model.saveStructure).toHaveBeenCalledOnce();
});

it("preserves all typed values after save rejection and retries the same draft", async () => {
  const createGoal = vi.fn().mockRejectedValueOnce(new Error("网络中断")).mockResolvedValue(detail);
  const { user, dirty } = await newEditor({ createGoal });
  await user.type(screen.getByLabelText("目标名称"), "准备毕业");
  await user.type(screen.getByLabelText("条件名称"), "论文");
  await user.type(screen.getByLabelText("清单项名称"), "初稿");
  await user.click(screen.getByRole("button", { name: "保存目标" }));
  expect(screen.getByRole("alert")).toHaveTextContent("网络中断");
  expect(screen.getByLabelText("目标名称")).toHaveValue("准备毕业");
  expect(screen.getByLabelText("条件名称")).toHaveValue("论文");
  expect(screen.getByLabelText("清单项名称")).toHaveValue("初稿");
  expect(dirty).toHaveBeenLastCalledWith(true);
  await user.click(screen.getByRole("button", { name: "重试" }));
  await waitFor(() => expect(dirty).toHaveBeenLastCalledWith(false));
  expect(createGoal.mock.calls[0]).toEqual(createGoal.mock.calls[1]);
});

it("preserves an existing draft on preview failure and retries preview before save", async () => {
  const previewStructure = vi.fn().mockRejectedValueOnce(new Error("预览失败")).mockResolvedValue({ current_summary: detail.summary, proposed_summary: detail.summary, warnings: [] });
  const model = modelFor({ previewStructure, saveStructure: vi.fn().mockResolvedValue(detail) });
  const user = userEvent.setup();
  render(<GoalsPanel model={model} onDraftChange={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "编辑目标结构" }));
  await user.type(screen.getByLabelText("目标说明"), "保留草稿");
  await user.click(screen.getByRole("button", { name: "保存目标" }));
  expect(model.saveStructure).not.toHaveBeenCalled();
  expect(screen.getByLabelText("目标说明")).toHaveValue("在日常记录中完成培养要求保留草稿");
  await user.click(screen.getByRole("button", { name: "重试" }));
  expect(previewStructure).toHaveBeenCalledTimes(2);
  expect(model.saveStructure).toHaveBeenCalledOnce();
});
