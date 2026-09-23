import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api";
import type {
  GoalCard,
  GoalDetail,
  GoalDraft,
  GoalPreview,
  GoalTemplate,
} from "./types";

export interface GoalEntryInput {
  title: string;
  completed_on: string;
  category_id: string;
  amount: number;
}

type RetryAction = () => Promise<unknown>;
type Operation<T> = () => Promise<T>;

function cardFromDetail(detail: GoalDetail): GoalCard {
  const { created_at: _createdAt, blocks: _blocks, entries: _entries, ...card } = detail;
  return card;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请重试。";
}

export function useGoals(active: boolean) {
  const [goals, setGoals] = useState<GoalCard[]>([]);
  const [selected, setSelected] = useState<GoalDetail | null>(null);
  const [templates, setTemplates] = useState<GoalTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState<RetryAction | undefined>();
  const loaded = useRef(false);

  const run = useCallback(async <T,>(operation: Operation<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    setRetry(undefined);
    try {
      return await operation();
    } catch (caught) {
      setError(errorMessage(caught));
      setRetry(() => () => run(operation));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  const mergeDetail = useCallback((detail: GoalDetail) => {
    const card = cardFromDetail(detail);
    setSelected(detail);
    setGoals((current) => {
      const found = current.some((goal) => goal.id === card.id);
      return found
        ? current.map((goal) => goal.id === card.id ? card : goal)
        : [card, ...current];
    });
  }, []);

  const refresh = useCallback(async () => run(async () => {
    const [cards, availableTemplates] = await Promise.all([
      api<GoalCard[]>("/goals"),
      api<GoalTemplate[]>("/goals/templates"),
    ]);
    if (!Array.isArray(cards) || !Array.isArray(availableTemplates)) {
      throw new Error("目标数据格式不正确，请重试。");
    }
    setGoals(cards);
    setTemplates(availableTemplates);
  }), [run]);

  useEffect(() => {
    if (!active || loaded.current) return;
    loaded.current = true;
    setLoading(true);
    void refresh().finally(() => setLoading(false));
  }, [active, refresh]);

  const selectGoal = useCallback(async (id: string) => run(async () => {
    const detail = await api<GoalDetail>(`/goals/${id}`);
    mergeDetail(detail);
    return detail;
  }), [mergeDetail, run]);

  const createGoal = useCallback(async (draft: GoalDraft) => run(async () => {
    const detail = await api<GoalDetail>("/goals", "POST", draft);
    mergeDetail(detail);
    return detail;
  }), [mergeDetail, run]);

  const createFromTemplate = useCallback(async (key: string) => run(async () => {
    const detail = await api<GoalDetail>(`/goals/from-template/${key}`, "POST");
    mergeDetail(detail);
    return detail;
  }), [mergeDetail, run]);

  const withSelected = useCallback(<T,>(operation: (goalId: string) => Promise<T>) => {
    const goalId = selected?.id;
    return goalId ? run(() => operation(goalId)) : Promise.resolve(undefined);
  }, [run, selected?.id]);

  const saveStructure = useCallback(async (draft: GoalDraft) => withSelected(async (goalId) => {
    const detail = await api<GoalDetail>(`/goals/${goalId}/structure`, "PUT", draft);
    mergeDetail(detail);
    return detail;
  }), [mergeDetail, withSelected]);

  const previewStructure = useCallback((draft: GoalDraft) => withSelected(async (goalId) => (
    api<GoalPreview>(`/goals/${goalId}/structure/preview`, "POST", draft)
  )), [withSelected]);

  const setArchived = useCallback(async (archived: boolean) => withSelected(async (goalId) => {
    const detail = await api<GoalDetail>(`/goals/${goalId}/lifecycle`, "PATCH", { archived });
    mergeDetail(detail);
    return detail;
  }), [mergeDetail, withSelected]);

  const setChecklistCompletion = useCallback(async (itemId: string, completedOn: string | null) => withSelected(async (goalId) => {
    const detail = await api<GoalDetail>(`/goals/${goalId}/checklist/${itemId}`, "PUT", { completed_on: completedOn });
    mergeDetail(detail);
    return detail;
  }), [mergeDetail, withSelected]);

  const createEntry = useCallback(async (input: GoalEntryInput) => withSelected(async (goalId) => {
    const detail = await api<GoalDetail>(`/goals/${goalId}/entries`, "POST", input);
    mergeDetail(detail);
    return detail;
  }), [mergeDetail, withSelected]);

  const updateEntry = useCallback(async (entryId: string, input: GoalEntryInput) => withSelected(async (goalId) => {
    const detail = await api<GoalDetail>(`/goals/${goalId}/entries/${entryId}`, "PUT", input);
    mergeDetail(detail);
    return detail;
  }), [mergeDetail, withSelected]);

  const deleteEntry = useCallback(async (entryId: string) => withSelected(async (goalId) => {
    const detail = await api<GoalDetail>(`/goals/${goalId}/entries/${entryId}`, "DELETE");
    mergeDetail(detail);
    return detail;
  }), [mergeDetail, withSelected]);

  return {
    goals,
    selected,
    templates,
    loading,
    busy,
    error,
    retry,
    selectGoal,
    createGoal,
    createFromTemplate,
    saveStructure,
    previewStructure,
    setArchived,
    setChecklistCompletion,
    createEntry,
    updateEntry,
    deleteEntry,
    refresh,
  };
}

export type GoalsModel = ReturnType<typeof useGoals>;
