import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { GoalCard, GoalDetail, GoalTemplate } from "../features/goals/types";
import { useGoals } from "../features/goals/useGoals";

const apiMock = vi.fn();
vi.mock("../api", () => ({ api: (...args: unknown[]) => apiMock(...args) }));

const summary = {
  attained: false,
  blocks: [{
    block_id: "b1",
    title: "论文",
    kind: "checklist" as const,
    attained: false,
    rules: [{ key: "checklist" as const, label: "完成项", current: 0, required: 1, unit: "项", satisfied: false }],
  }],
};

const card: GoalCard = {
  id: "g1",
  title: "毕业目标",
  description: "完成论文",
  archived_at: null,
  updated_at: "2026-09-20T08:00:00Z",
  summary,
};
const detail: GoalDetail = {
  ...card,
  created_at: "2026-09-01T08:00:00Z",
  blocks: [{
    id: "b1",
    kind: "checklist",
    title: "论文",
    unit_label: "项",
    minimum_total: null,
    minimum_distinct_categories: null,
    position: 0,
    checklist_items: [{ id: "i1", title: "提交初稿", completed_on: null, position: 0 }],
    categories: [],
  }],
  entries: [],
};
const updatedDetail: GoalDetail = {
  ...detail,
  title: "毕业目标（更新）",
  description: "完成并提交论文",
  archived_at: "2026-09-21T08:00:00Z",
  updated_at: "2026-09-21T08:00:00Z",
  summary: {
    attained: true,
    blocks: [{
      ...summary.blocks[0],
      attained: true,
      rules: [{ ...summary.blocks[0].rules[0], current: 1, satisfied: true }],
    }],
  },
  blocks: [{
    ...detail.blocks[0],
    checklist_items: [{ ...detail.blocks[0].checklist_items[0], completed_on: "2026-09-20" }],
  }],
};
const template: GoalTemplate = {
  key: "full-time-postgraduate-quality",
  title: "研究生培养",
  description: "研究生目标模板",
};

beforeEach(() => apiMock.mockReset());

it("loads cards and templates once when activated", async () => {
  apiMock.mockImplementation((path: string) => Promise.resolve(
    path === "/goals/templates" ? [template] : [card],
  ));
  const { result, rerender } = renderHook(
    ({ active }) => useGoals(active),
    { initialProps: { active: false } },
  );
  expect(apiMock).not.toHaveBeenCalled();
  rerender({ active: true });
  await waitFor(() => expect(result.current.goals).toEqual([card]));
  expect(result.current.templates).toEqual([template]);
  expect(apiMock).toHaveBeenCalledWith("/goals");
  expect(apiMock).toHaveBeenCalledWith("/goals/templates");
  rerender({ active: false });
  rerender({ active: true });
  expect(apiMock).toHaveBeenCalledTimes(2);
});

it("keeps selected data and exposes retry after a failed mutation", async () => {
  apiMock
    .mockResolvedValueOnce([card])
    .mockResolvedValueOnce([template])
    .mockResolvedValueOnce(detail)
    .mockRejectedValueOnce(new Error("连接失败"))
    .mockResolvedValueOnce(updatedDetail);
  const { result } = renderHook(() => useGoals(true));
  await waitFor(() => expect(result.current.goals).toHaveLength(1));
  await act(() => result.current.selectGoal(card.id));
  await act(() => result.current.setChecklistCompletion("i1", "2026-09-20"));
  expect(result.current.selected).toEqual(detail);
  expect(result.current.error).toBe("连接失败");
  await act(() => result.current.retry?.());
  expect(result.current.selected).toEqual(updatedDetail);
  expect(result.current.goals).toEqual([{
    id: updatedDetail.id,
    title: updatedDetail.title,
    description: updatedDetail.description,
    archived_at: updatedDetail.archived_at,
    updated_at: updatedDetail.updated_at,
    summary: updatedDetail.summary,
  }]);
});

it("returns merged detail from successful detail-producing operations", async () => {
  apiMock.mockResolvedValue(detail);
  const { result } = renderHook(() => useGoals(false));
  const draft = { title: "毕业目标", description: "完成论文", blocks: [] };
  const input = { title: "提交初稿", completed_on: "2026-09-20", category_id: "c1", amount: 1 };
  const results: Array<GoalDetail | undefined> = [];

  await act(async () => { results.push(await result.current.selectGoal(card.id)); });
  await act(async () => { results.push(await result.current.createGoal(draft)); });
  await act(async () => { results.push(await result.current.createFromTemplate(template.key)); });
  await act(async () => { results.push(await result.current.saveStructure(draft)); });
  await act(async () => { results.push(await result.current.setArchived(true)); });
  await act(async () => { results.push(await result.current.setChecklistCompletion("i1", input.completed_on)); });
  await act(async () => { results.push(await result.current.createEntry(input)); });
  await act(async () => { results.push(await result.current.updateEntry("e1", input)); });
  await act(async () => { results.push(await result.current.deleteEntry("e1")); });

  expect(results).toEqual(Array.from({ length: 9 }, () => detail));
  expect(result.current.selected).toEqual(detail);
});
