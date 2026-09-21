import { render, screen, within } from "@testing-library/react";
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
