export type GoalBlockKind = "checklist" | "quota";
export type RuleKey = "checklist" | "total" | "required_category" | "distinct";

export interface GoalRule {
  key: RuleKey;
  label: string;
  current: number;
  required: number;
  unit: string;
  satisfied: boolean;
}

export interface GoalBlockSummary {
  block_id: string;
  title: string;
  kind: GoalBlockKind;
  attained: boolean;
  rules: GoalRule[];
}

export interface GoalSummary {
  attained: boolean;
  blocks: GoalBlockSummary[];
}

export interface GoalSuggestion { id: string; title: string; position: number; }
export interface GoalChecklistItem { id: string; title: string; completed_on: string | null; position: number; }
export interface GoalCategory {
  id: string;
  name: string;
  minimum_amount: number;
  is_required: boolean;
  position: number;
  suggestions: GoalSuggestion[];
}
export interface GoalBlock {
  id: string;
  kind: GoalBlockKind;
  title: string;
  unit_label: string;
  minimum_total: number | null;
  minimum_distinct_categories: number | null;
  position: number;
  checklist_items: GoalChecklistItem[];
  categories: GoalCategory[];
}
export interface GoalEntry {
  id: string;
  block_id: string;
  category_id: string;
  title: string;
  completed_on: string;
  amount: number;
  created_at: string;
  updated_at: string;
}
export interface GoalCard {
  id: string;
  title: string;
  description: string;
  archived_at: string | null;
  updated_at: string;
  summary: GoalSummary;
}
export interface GoalDetail extends GoalCard {
  created_at: string;
  blocks: GoalBlock[];
  entries: GoalEntry[];
}
export interface GoalTemplate { key: string; title: string; description: string; }
export interface GoalPreview {
  current_summary: GoalSummary;
  proposed_summary: GoalSummary;
  warnings: string[];
}
export interface GoalDraft {
  title: string;
  description: string;
  blocks: Array<{
    id?: string;
    kind: GoalBlockKind;
    title: string;
    unit_label: string;
    minimum_total: number | null;
    minimum_distinct_categories: number | null;
    position: number;
    checklist_items: Array<{id?: string; title: string; position: number}>;
    categories: Array<{
      id?: string;
      name: string;
      minimum_amount: number;
      is_required: boolean;
      position: number;
      suggestions: Array<{id?: string; title: string; position: number}>;
    }>;
  }>;
}
