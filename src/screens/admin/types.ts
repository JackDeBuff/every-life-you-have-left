/** Response shapes of the admin API (worker/admin.ts). */
import type { Ending } from "../../../shared/engine";
import type { Profile } from "../../../shared/schema";
import type { Branch, Decision, LiveSetting, SimYear, StartInput } from "../../../shared/sim";
import type { AgentState, SessionUsage, WarmupState } from "../../../worker/agent/protocol";
import type { ChecksResult } from "../../../worker/admin-types";

export type { AgentState, ChecksResult };
export type { CheckAt, CheckLevel, CheckTab, Violation, CheckGroup } from "../../../worker/admin-types";

export interface ListRow {
  id: string;
  created_at: string;
  updated_at: string;
  first_name: string | null;
  age: number | null;
  city: string | null;
  country: string | null;
  speed: string | null;
  phase: string | null;
  engine: string | null;
  end_age: number | null;
  playhead_year: number | null;
  decisions: number;
  forks: number;
  answers: number;
  answered: number;
  slid: number;
  warm_answered: number;
  years: number;
  chat: number;
  // after migrations/0004_admin.sql
  usage_usd?: number | null;
  warm_asked?: number | null;
  last_error?: string | null;
  errors?: number;
  warnings?: number;
}

export interface ListResponse {
  ok: true;
  migrated: boolean;
  sessions: ListRow[];
}

export interface D1Answer {
  id: number;
  decision_id: string;
  option_id: string | null;
  text: string | null;
  via: string;
  slid: number;
  quote_id: string | null;
  created_at: string;
}

export interface D1Upload {
  id: string;
  kind: string;
  r2_key: string | null;
  filename: string | null;
  chars: number | null;
  text: string | null;
  created_at: string;
}

export interface D1Media {
  key: string;
  kind: string;
  band: string | null;
  model: string | null;
  created_at: string;
  url: string;
}

export interface EngineLogRow {
  level: "error" | "warn";
  code: string;
  life: string | null;
  year: number | null;
  detail: string | null;
  created_at: string;
}

export interface DetailResponse {
  ok: true;
  source: "durable_object" | "d1";
  liveAwake: boolean;
  liveError: string | null;
  session: Record<string, unknown> & {
    id: string;
    created_at?: string;
    updated_at?: string;
    start: StartInput | null;
    profile: Profile | null;
    ending: Ending | null;
    usage: SessionUsage | null;
    warmup: WarmupState | null;
  };
  decisions: Decision[];
  decisionTimes: Record<string, { created: string; updated: string }>;
  answers: D1Answer[];
  years: SimYear[];
  branches: Branch[];
  settings: { at: string; settings: LiveSetting[] }[];
  nudges: { setting_id: string; from_value: string; to_value: string; year: number; age: number; created_at: string }[];
  chat: { id: string; life: string; age: number; role: string; text: string; created_at: string }[];
  uploads: D1Upload[];
  media: D1Media[];
  engineLog: EngineLogRow[];
  live: AgentState | null;
}

export interface ChecksResponse extends ChecksResult {
  ok: true;
  source: "durable_object" | "d1";
  ms: number;
}

export type Tab = "life" | "decisions" | "profile" | "lives" | "settings" | "chat" | "uploads" | "portraits" | "ending" | "health";
