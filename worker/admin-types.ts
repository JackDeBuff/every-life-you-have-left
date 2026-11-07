/**
 * Types of the /api/admin/session/:id/checks response (worker/admin-checks.ts), shared with the
 * /admin page (src/screens/admin/). No imports: the browser build reads this file too.
 */
export type CheckLevel = "error" | "warn" | "info";
export type CheckTab = "life" | "decisions" | "lives" | "ending" | "profile";

export interface CheckAt {
  tab: CheckTab;
  year?: number;
  age?: number;
  decisionId?: string;
  eventId?: string;
  branchId?: string;
}

export interface Violation {
  id: string;
  group: string;
  kind: string;
  level: CheckLevel;
  msg: string;
  at: CheckAt;
  /** The text that was checked (shortened), when it helps to see it next to the message. */
  text?: string;
}

export interface CheckGroup {
  group: string;
  label: string;
  /** Where the logic lives. */
  source: string;
  count: number;
}

export interface ChecksResult {
  groups: CheckGroup[];
  violations: Violation[];
  /** Per level. */
  counts: Record<CheckLevel, number>;
  /** How many items each pass looked at. */
  scanned: { years: number; decisions: number; branches: number };
}
