# 04 — Tech stack: Gemini on Google Cloud + Cloudflare Workers

Researched Fri Nov 6 2026, ~10pm EST, against official docs (Google AI Studio docs, which `ai.google.dev`
now redirects to; Google Cloud "Gemini Enterprise Agent Platform" docs, the new name for Vertex AI; and
Cloudflare docs). Anything marked **[UNVERIFIED]** was not confirmed in an official source tonight. Test
it before you rely on it.

**Known facts from the coordinator (not researched):** Cloudflare is on **Workers Paid**, with 5 min of
CPU per request, 10,000 subrequests and AI Gateway available. GCP project **`triangle-ai-hack-2026`** is
linked to billing account `013251-22802C-A06EE2`, with both `generativelanguage.googleapis.com` (Gemini
API) and `aiplatform.googleapis.com` (Agent Platform API) enabled. No key has been created yet.

---

## TL;DR

| Decision | Recommendation |
|---|---|
| **API surface** | **Agent Platform (Vertex) `generateContent` / `streamGenerateContent`**, called by plain `fetch` from the Worker. Do not call Gemini from the browser. |
| **Key to create now** | A **Google Cloud API key bound to a service account** (role `roles/aiplatform.user`) and restricted to the Agent Platform API. Steps are in §7. If the key is rejected, fall back to a service-account JSON key and a JWT signed in the Worker (code in §3.4). The AI Studio Gemini API key is the last resort. |
| **Why not the AI Studio key** | Gemini API billing now runs through Prepay. Google's docs say *"Prepay users must first purchase Prepaid credits before any eligible Google Cloud credits can be applied,"* and they say nothing about education credits. A forum thread asking exactly that question got no answer. Agent Platform is billed as an ordinary Cloud service, and the coupon says "any service on this billing account". |
| **Heavy model (4 lives, re-tune, profile)** | **`gemini-3.8-flash`** with `thinkingLevel: "low"`. Price: **$0.75 in / $3.75 out per 1M tokens** (introductory through Dec 31 2026). 1M context, 64K output, structured output, thinking levels low/medium/high. |
| **Fast model (questions, chat, transcription)** | **`gemini-3.5-flash-lite`**: **$0.30 in / $2.50 out**, 1M context, structured output, and audio and PDF input. |
| **Quality upgrade (optional)** | **`gemini-4-argon`**: $2 in / $10 out until Nov 30, then double. The flagship reasoning model, likely slower to first token. Use it for the owner's pre-generated demo, or A/B test it on Saturday morning. |
| **Fallback chain** | `gemini-3.8-flash` → `gemini-3.6-flash` (same price, previous generation) → `gemini-3.5-flash-lite` |
| **Cost** | About **$0.25 per judge "fast path" session** and about **$0.60 per full session**. $100 buys about 120 full or about 300 quick sessions after a $25 reserve for development. |
| **Streaming** | One fast **"plan" call** names the 4 lives, then **4 parallel streaming calls** generate one life each. Each is schema-constrained JSON. The Worker **pipes the upstream SSE unchanged** to the browser, and the browser parses partial JSON as it arrives. |
| **Voice in** | `MediaRecorder` in the browser → `/api/transcribe` → `gemini-3.5-flash-lite` with audio input → the text drops into the editable answer box. The Web Speech API is optional and only adds live captions in Chrome. Skip the Live API. |
| **Voice out (stretch)** | `gemini-3.8-flash-tts` with voice **Gacrux ("Mature")** or **Algenib ("Gravelly")**. About $0.0135 per minute of audio. |
| **Images** | Skip AI images. Draw share cards with HTML/SVG on the client, or with `workers-og` (Satori) on the Worker. Nano Banana 2 Lite would cost about $0.034 per image if you want one later. |
| **Front end + API** | Vite + React + TS as Workers Static Assets, a Hono API in the same Worker (`run_worker_first: ["/api/*"]`), and `@cloudflare/vite-plugin`. No database. KV only for opt-in share cards. |

---

## 1. Gemini models available now (Nov 2026)

Source: [AI Studio models](https://aistudio.google.com/docs/models), [pricing](https://aistudio.google.com/docs/pricing),
[3.8 Flash model page](https://aistudio.google.com/docs/models/gemini-3.8-flash),
[What's new in 3.8](https://aistudio.google.com/docs/whats-new-gemini-3.8), and
[Agent Platform release notes](https://docs.cloud.google.com/gemini-enterprise-agent-platform/release-notes?hl=en).

Prices are paid Standard tier, USD per 1M tokens, text, prompts ≤200K tokens. Agent Platform lists the
same introductory price for 3.8 Flash. **[UNVERIFIED]** that every other price below matches on Agent
Platform, because its pricing page would not render for me.

| Model | ID | Status | In / Out per 1M | Context / max out | Notes |
|---|---|---|---|---|---|
| Gemini 4 Argon | `gemini-4-argon` | GA on Agent Platform Oct 13 2026 | $2.00 / $10.00, rising to $4 / $20 from Dec 1 2026 | 1M / 65K (1M with "long decode") | Flagship reasoning model. Structured output; thinking low/medium/high; implicit caching only. No free tier. |
| **Gemini 3.8 Flash** | `gemini-3.8-flash` | Stable; GA on Agent Platform Sep 2 2026 | **$0.75 / $3.75**, rising to $1.50 / $7.50 from Jan 1 2027 | 1M / 64K | Thinking levels **low / medium / high**, default `medium`; *"`minimal` is not supported and returns an error."* `temperature`, `top_p` and `top_k` are **silently ignored** from 3.6 onward. Described as verbose. |
| Gemini 3.6 Flash | `gemini-3.6-flash` | Stable, previous generation | $0.75 / $3.75 | 1M | Use as the fallback. The docs suggest it if 3.8's token use is a problem. |
| **Gemini 3.5 Flash-Lite** | `gemini-3.5-flash-lite` | Stable; GA on Agent Platform Jul 21 2026 | **$0.30 / $2.50** | 1M / 65K | "Fastest 3.5 model". Text, image, video, **audio** and **PDF** in. Structured output and thinking supported; the thinking levels are not listed. |
| Gemini 3.1 Flash-Lite | `gemini-3.1-flash-lite` | Stable | $0.25 / $1.50 (audio in $0.50) | — | The cheapest option. |
| Gemini 3.1 Pro | `gemini-3.1-pro-preview` | Preview | $2 / $12 | — | Older Pro. Argon supersedes it. |
| 3.8 Flash TTS | `gemini-3.8-flash-tts` | GA on Agent Platform Oct 26 2026 (global, us, eu) | $0.50 text in / $9.00 audio out (≈ $0.00225 per 10 s) | — | 30 prebuilt voices, style prompts. |
| 3.8 Flash-Lite TTS | `gemini-3.8-flash-lite-tts` | GA | $0.50 / $6.00 | — | Cheaper and faster. |
| 3.5 Transcribe | `gemini-3.5-transcribe` | Stable | ≈ $0.003/min in, $0.002/min out | — | Dedicated speech-to-text. **[UNVERIFIED]** request shape; I would use Flash-Lite with audio input instead. |
| Nano Banana 2 Lite | `gemini-3.1-flash-lite-image` | Stable | ≈ $0.0336 per 1K image | — | No free tier. |
| Nano Banana 2 | `gemini-3.1-flash-image` | Stable | ≈ $0.067 per 1K image | — | |
| Nano Banana 2.1 | `gemini-nano-banana-2.1` | New | ≈ $0.0336 per 1K image | — | |
| Live API | `gemini-3.8-live` | New | audio in $0.005/min, out $0.018/min | — | WebSocket. Not supported in Agent Platform express mode. |

Deprecated or not to be used: `gemini-2.5-pro` and `gemini-2.5-flash`, both auto-routed elsewhere from
Dec 1 2026. `gemini-3-pro-preview`, `gemini-2.0-*` and Imagen 4 are shut down.

**Latency class.** These are third-party figures from Artificial Analysis and **[UNVERIFIED]**. 3.8 Flash
at **high** thinking streams at about **300 tokens/s**, but its time to first answer token is **13–25 s**,
because the thinking happens first. **That is why you use `low` thinking for anything the user is
waiting on.** For Argon, assume a slower first token than Flash (no published numbers found). Measure both
on Saturday morning.

### Recommendation
- **Profile build, 4 lives, re-tune:** `gemini-3.8-flash`, `thinkingLevel: "low"`. Try `"medium"` for
  the profile build only, which happens once and while the user is answering questions anyway.
- **Adaptive questions, chat, transcription, and "plan" if speed matters:** `gemini-3.5-flash-lite`.
- **Owner's showcase demo:** generate it ahead of time with `gemini-4-argon` and save it as JSON. That
  gives the best quality, and the demo works offline.
- **Diversity between the 4 lives cannot come from temperature**, which is ignored. It has to come from
  the plan call (§3.2), which gives each life a different premise and pivot.

### Cost per session (3.8 Flash for heavy calls, 3.5 Flash-Lite for fast calls)

Token counts are estimates. Thinking tokens are billed as output.

| Step | Calls | Input tok | Output tok (incl. thinking) | Cost |
|---|---|---|---|---|
| Profile from uploads | 1 × 3.8F | 10K | 2.5K | $0.017 |
| 5 adaptive questions | 5 × 3.5FL | 6K each | 0.6K each | $0.017 |
| Plan (4 premises) | 1 × 3.8F | 8K | 1.5K | $0.012 |
| 4 lives, about 45 years × ~110 tok | 4 × 3.8F | 10K each | 6K each | $0.12 |
| 4 re-tunes (4 lives × half the remaining years) | 16 × 3.8F | 12K each | 3.5K each | $0.35 |
| 10 chat turns | 10 × 3.5FL | 10K each | 0.4K each | $0.04 |
| Voice in, about 2.5 min audio | 5 × 3.5FL | ~5K total | small | <$0.01 |
| Voice out, 10 × 15 s | 10 × TTS | — | — | $0.03 |
| **Full session** | | | | **≈ $0.60** |
| **Judge fast path** (5 questions, plan, 4 lives, 1 re-tune, 3 chats + TTS) | | | | **≈ $0.25** |

- **$100**, less about $25 for prompt tuning, leaves about **120 full sessions or about 300 judge
  sessions**. Re-tunes dominate the cost. Generating segment by segment (only up to the next pause)
  roughly halves it (§3.2).
- Using **Argon for the lives and re-tunes** costs about **$1.35 per session**, so about 55 sessions.
- **Priority PayGo** (see §2.4), if used during judging hours, costs about 1.8×.

---

## 2. Gemini API (AI Studio key) vs Agent Platform (Vertex)

### 2.1 Do the $100 education credits apply?

- **Gemini Developer API** ([billing doc](https://aistudio.google.com/docs/billing)): new users default
  to **Prepay**, and switching to Postpay is not supported. *"Upgrading from the Free Tier to the Paid
  Tier means linking a billing account and prepaying to add a minimum of $5."* *"Prepay users must first
  purchase Prepaid credits before any eligible Google Cloud credits can be applied."* *"Not all Google
  Cloud credits ... can be used towards Gemini API and AI Studio."* The doc **does not say whether
  education or coupon credits are eligible**. A [forum thread asking exactly this](https://discuss.ai.google.dev/t/can-gcp-educational-coupons-be-used-for-ai-studio-credits/141658)
  closed on Nov 5 2026 with no answer, and several threads report credits not being applied
  ([example](https://discuss.ai.google.dev/t/google-ai-studio-do-not-use-my-1300-credits-shown-on-google-cloud/140442)).
  **Risk:** you may need a card for the $5 minimum, and the $100 may never be drawn down.
- **Agent Platform / Vertex AI** is a normal Google Cloud service billed to the Cloud Billing account, so
  coupon credits scoped to "any service on this billing account" should apply. **[UNVERIFIED for this
  exact coupon]**, but it is the standard behaviour, and the community workaround is the same
  ([DEV post](https://dev.to/bravian1/how-to-use-your-google-cloud-credits-for-gemini-again-via-vertex-ai-and-adc-7ei)).
  Check it Saturday morning in Billing → Reports with credits shown. Cost data lags by a few hours.
- **Privacy:** both paid paths keep prompts out of model training (Gemini API paid tier: *"your prompts
  and responses are not used to improve Google products"*; Cloud terms for Agent Platform). **The Gemini
  API free tier does use your data**, so do not fall back to it for real users without changing the
  consent sentence.

**Decision: use Agent Platform.** The request and response JSON is the same `generateContent` shape as
the Gemini API, so switching to an AI Studio key later means changing one base URL and one header.

### 2.2 Auth from a Worker

| Option | How | Pros | Cons |
|---|---|---|---|
| **A. API key bound to a service account (recommended)** | Header `x-goog-api-key: <key>` on `aiplatform.googleapis.com` | One secret, no token refresh, about 3 lines of code | The docs for standard (non-express) projects are thin. **[UNVERIFIED]** which URL form accepts the key (see §7 smoke test) |
| B. Service-account JSON key + JWT (RS256) signed with WebCrypto → OAuth token | `Authorization: Bearer <token>`, cached 1 h | Fully documented, works on every endpoint, works with AI Gateway's Vertex provider | About 40 lines of code (in §3.4). An org policy could block JSON keys; unlikely on a personal account |
| C. AI Studio Gemini API key | `x-goog-api-key` on `generativelanguage.googleapis.com` | Best-documented path; the Interactions API is available | Billing and credit risk (§2.1). New keys are "auth keys" bound to a service account. Unrestricted keys are rejected |

### 2.3 Quotas and avoiding 429s at the expo

- **Gemini API tiers** ([rate limits](https://aistudio.google.com/docs/rate-limits)): Tier 1 means billing
  is linked, with a $250 monthly cap and a **spend-rate limit of $10 per rolling 10 minutes** (exceeding
  it returns a 429). Per-model RPM and TPM are no longer in the docs; they show only in AI Studio. Limits
  apply **per project** and tiers per billing account.
- **Agent Platform** uses Standard PayGo with tiers by 30-day spend (release notes Sep 10 2026 mention
  Tiers 3 and 4). A new project sits in the lowest tier, and Gemini requests share capacity dynamically,
  so 429s are possible under contention. **[UNVERIFIED]** exact limits for a new project.
- **Mitigations to build in:**
  1. Use the **`global`** location, which routes across regions.
  2. **Retry before the first byte only**: on 429 or 5xx, retry twice with backoff of 400 ms × 2^n plus
     jitter, then move to the next model in the chain. Never retry a stream that has already started
     sending; the browser restarts that life instead.
  3. **Fallback chain:** 3.8 Flash → 3.6 Flash → 3.5 Flash-Lite. Different models have separate capacity.
  4. **Client watchdog:** if no bytes arrive within 20 s, abort and retry once.
  5. **Priority PayGo** for 10am–12:15pm Sunday: Agent Platform added it with *"throughput limits
     available immediately, no ramp-up"*. **[UNVERIFIED]** that it is enabled by the request header
     `X-Vertex-AI-LLM-Shared-Request-Type: priority`. Check the docs before Sunday. It costs about 1.8×.
  6. **Pre-generated demo** of the owner's life, bundled as JSON. It plays with zero network and is the
     safety net if the Wi-Fi or the API fails. Keep a phone hotspot ready.
  7. Load test on Saturday: run 6 sessions at once (24 parallel streams) and watch for 429s.
- **Cloudflare AI Gateway:** optional, not on the critical path. Its value here is analytics and
  automatic retries; caching is useless because every prompt is unique. Its Vertex provider expects a
  Bearer token or stored service-account credentials, so it fits option B, not option A. If you use it,
  send **`cf-aig-collect-log-payload: false`** so prompts are not stored
  ([logging doc](https://developers.cloudflare.com/ai-gateway/observability/logging/)). Retries go
  through the `cf-aig-max-attempts`, `cf-aig-retry-delay` and `cf-aig-backoff` headers (max 5).

### 2.4 generateContent vs the new Interactions API

Google now calls `generateContent` **"legacy … remains fully supported"**. The new **Interactions API**
(`POST /v1beta/interactions`, events `step.delta` and so on) is recommended for new projects, and all of
the AI Studio doc examples use it. **Use `generateContent` anyway**, for three reasons: it is the same
shape on Agent Platform and the Gemini API; it is stateless by design, whereas Interactions stores data
unless you send `store: false` (stored data is kept 55 days on the paid tier); and Cloudflare AI Gateway
supports it natively. **[UNVERIFIED]** that `gemini-3.8-flash` takes
`generationConfig.thinkingConfig.thinkingLevel` through `generateContent`. The 3.8 migration notes refer
to generateContent users, so it is very likely. Confirm it with the smoke test in §7.

---

## 3. Structured output and streaming

### 3.1 What the API supports ([structured output doc](https://aistudio.google.com/docs/structured-output))
- JSON Schema subset: types (including `["string","null"]`), `properties`, `required`,
  `additionalProperties`, `enum`, `format` (date/time), `minimum` and `maximum`, `items`,
  `prefixItems`, and `minItems` / `maxItems` (**enforced**), plus `anyOf` and `$ref` / `$defs`.
- `minLength`, `maxLength`, `uniqueItems` and `min/maxProperties` are **silently dropped**. Put length
  guidance in `description`, and validate with **zod** on the client.
- No published size limit, but schemas that are too complex return **400 INVALID_ARGUMENT** (state
  machine limits). Keep the schema flat, use short property names, and keep enums small.
- **Streaming works with structured output.** Chunks are *"valid partial JSON strings that can be
  concatenated."*
- In generateContent, set `generationConfig.responseMimeType: "application/json"` plus
  `responseJsonSchema: {…}`. (The Interactions equivalent is
  `response_format: {type:"text", mime_type:"application/json", schema}`.)
- **Property order [UNVERIFIED for 3.8]:** Gemini has emitted keys in schema order since 2.5. Put
  `years` **last but one** and small header fields first, so the UI gets the title within a second.

### 3.2 Pattern: plan, then 4 parallel lives

```
browser ──POST /api/plan──▶ Worker ──▶ 3.8 Flash (low), non-streaming, ~3–6 s
        ◀── {lives:[{id,kind,title,premise,pivot_decision,user_quotes[]}×4]}
browser ──4 × POST /api/life {profile, plan, lifeId}──▶ Worker ──▶ 4 parallel streamGenerateContent
        ◀── 4 SSE streams (piped unchanged) → partial-JSON parse → years appear one by one
```
- **Why parallel rather than one call:** the user waits for one life's latency instead of four. Each
  life fails and retries on its own. The 4 lanes animate side by side. Input is repeated about 4 × 10K
  tokens, roughly $0.03, and implicit caching may discount the shared prefix.
- **Why the plan call:** without it, 4 independent calls produce overlapping lives. It also lets the UI
  show four titled cards within about 5 s.
- **Re-tune (owner decides, see the end):** either (a) generate all 4 lives to 70 and regenerate from
  the pause year forward after each answer, or (b) **generate segment by segment**, from today to pause
  1, then pause 1 to pause 2, and so on. Each segment is about 1–1.5K output tokens per life and takes
  about 5–8 s. Option (b) is cheaper, the latency per pause is smaller, and no years are generated and
  then thrown away. Send the previous years in compact form, not in full.
- **NDJSON alternative:** use `text/plain`, one JSON object per line (one year per line), and parse line
  by line. It is simpler to parse but has no schema guarantee. Keep it only as a fallback if the
  partial-JSON approach misbehaves.

### 3.3 Example life schema (shared/schema.ts)

```ts
export const lifeJsonSchema = {
  type: "object",
  properties: {
    title:   { type: "string", description: "3–6 words, e.g. 'The Singapore Years'" },
    premise: { type: "string", description: "One sentence: the choice that makes this life different" },
    years: {
      type: "array",
      items: {
        type: "object",
        properties: {
          age:      { type: "integer" },
          year:     { type: "integer" },
          headline: { type: "string", description: "≤ 12 words" },
          detail:   { type: "string", description: "1–2 sentences, concrete, no clichés" },
          meters: {
            type: "object",
            properties: {
              health: { type: "integer", minimum: 0, maximum: 100 },
              happiness: { type: "integer", minimum: 0, maximum: 100 },
              money: { type: "integer", minimum: 0, maximum: 100 },
              relationships: { type: "integer", minimum: 0, maximum: 100 },
            },
            required: ["health", "happiness", "money", "relationships"],
          },
          turning_point: {
            type: ["object", "null"],
            properties: {
              what: { type: "string" },
              why: { type: "string", description: "Cause, tied to the user's own words" },
              user_quote: { type: "string", description: "Verbatim phrase the user said" },
              basis: { type: "string", description: "Real-world tendency/statistic, or empty" },
            },
            required: ["what", "why", "user_quote"],
          },
        },
        required: ["age", "year", "headline", "meters", "turning_point"],
      },
    },
    at_70: { type: "string", description: "Two sentences: who you are at 70" },
  },
  required: ["title", "premise", "years", "at_70"],
} as const;
```
45 years at about 110 tokens each comes to about 5K output tokens per life. At about 150–300 tokens/s
**[UNVERIFIED]**, that is roughly 15–35 s per life, with the 4 lives running in parallel.

### 3.4 Worker → Agent Platform streaming (worker/gemini.ts)

```ts
export interface Env {
  GCP_PROJECT: string;          // "triangle-ai-hack-2026" (var)
  GCP_API_KEY?: string;         // option A (secret)
  GCP_SA_JSON?: string;         // option B (secret): whole service-account JSON
  MODEL_HEAVY: string;          // "gemini-3.8-flash"
  MODEL_FAST: string;           // "gemini-3.5-flash-lite"
}

const BASE = "https://aiplatform.googleapis.com/v1";
const endpoint = (env: Env, model: string, stream: boolean) =>
  `${BASE}/projects/${env.GCP_PROJECT}/locations/global/publishers/google/models/${model}:` +
  (stream ? "streamGenerateContent?alt=sse" : "generateContent");

async function authHeaders(env: Env): Promise<Record<string, string>> {
  if (env.GCP_API_KEY) return { "x-goog-api-key": env.GCP_API_KEY };
  return { authorization: `Bearer ${await getAccessToken(env.GCP_SA_JSON!)}` };
}

/** Retries 429/5xx before the first byte, then falls through the model chain. */
export async function gemini(
  env: Env, models: string[], body: unknown,
  opts: { stream?: boolean; signal?: AbortSignal } = {},
): Promise<{ res: Response; model: string }> {
  const stream = opts.stream ?? true;
  let last = "";
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(endpoint(env, model, stream), {
        method: "POST",
        headers: { "content-type": "application/json", ...(await authHeaders(env)) },
        body: JSON.stringify(body),
        signal: opts.signal,           // client disconnect cancels the upstream call, which stops the spend
      });
      if (res.ok) return { res, model };
      last = `${model} ${res.status} ${(await res.text()).slice(0, 400)}`;
      if (res.status !== 429 && res.status < 500) throw new Error(last); // 400 = our bug (schema/prompt)
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt + Math.random() * 300));
    }
  }
  throw new Error(last);
}

// ---- Option B: service-account JWT → OAuth access token (WebCrypto, no deps) ----
let cached: { token: string; exp: number } | null = null;
const b64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function getAccessToken(saJson: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 120 > now) return cached.token;
  const sa = JSON.parse(saJson);
  const enc = (o: object) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  })}`;
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----|\s/g, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${b64url(sig)}` }),
  });
  const j = (await r.json()) as { access_token: string; expires_in: number };
  cached = { token: j.access_token, exp: now + j.expires_in };
  return j.access_token;
}
```

### 3.5 Route: pipe the SSE straight through (worker/index.ts, Hono)

```ts
import { Hono } from "hono";
import { gemini, type Env } from "./gemini";
import { lifeJsonSchema } from "../shared/schema";
import { lifeSystemPrompt, lifeUserPrompt } from "./prompts/life";

const app = new Hono<{ Bindings: Env }>();

app.post("/api/life", async (c) => {
  const { profile, plan, lifeId } = await c.req.json();   // prompts stay server-side
  const body = {
    systemInstruction: { parts: [{ text: lifeSystemPrompt }] },
    contents: [{ role: "user", parts: [{ text: lifeUserPrompt(profile, plan, lifeId) }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: lifeJsonSchema,
      thinkingConfig: { thinkingLevel: "low" },
      maxOutputTokens: 12000,
    },
  };
  try {
    const { res, model } = await gemini(
      c.env, [c.env.MODEL_HEAVY, "gemini-3.6-flash", c.env.MODEL_FAST], body,
      { signal: c.req.raw.signal },
    );
    // Zero-parse passthrough: low CPU, the browser does the parsing.
    return new Response(res.body, {
      headers: { "content-type": "text/event-stream", "cache-control": "no-store", "x-model": model },
    });
  } catch (e) {
    return c.json({ error: String(e) }, 502);   // never log request bodies (personal data)
  }
});

export default app;
```

### 3.6 Browser: read the SSE, parse partial JSON (src/lib/stream.ts)

```ts
import { createParser } from "eventsource-parser";   // v3 API
import { parse as parsePartial } from "partial-json";

export async function streamJson<T>(url: string, payload: unknown, onPartial: (p: Partial<T>) => void, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal });
  if (!res.ok || !res.body) throw new Error(`${res.status} ${await res.text()}`);
  let text = "";
  const parser = createParser({
    onEvent(ev) {
      const chunk = JSON.parse(ev.data);                               // a GenerateContentResponse
      for (const p of chunk.candidates?.[0]?.content?.parts ?? []) if (p.text && !p.thought) text += p.text;
      try { onPartial(parsePartial(text) as Partial<T>); } catch { /* not parseable yet */ }
    },
  });
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  for (;;) { const { value, done } = await reader.read(); if (done) break; parser.feed(value); }
  return JSON.parse(text) as T;   // then validate with zod; on failure, re-request that one life
}
```
Render a year only once the **next** year has started, or the array has closed, so a half-streamed
headline never flickers on screen.

### 3.7 Timeouts and limits
- Workers HTTP requests have **no wall-clock limit** while the client stays connected. Waiting on
  `fetch` does not count as CPU time. On the Paid plan, CPU is 30 s by default and up to 5 min.
  Piping a stream uses almost none.
- During runtime updates, in-flight streams get up to 20 minutes to finish.
- Pass the request's `signal` upstream (as above), so closing the tab stops the Gemini spend.
- Browser: an `AbortController` per life, a 20 s first-byte watchdog, and a 90 s total cap.

---

## 4. Multimodal input

### 4.1 PDFs (CV, LinkedIn "Save to PDF")
- Gemini takes PDFs natively: up to **50 MB or 1000 pages**, both inline and through the Files API, at
  **258 tokens per page**. Embedded text is extracted, and on Gemini 3 those extracted-text tokens are
  not charged ([doc](https://aistudio.google.com/docs/document-processing)).
- **Recommendation: extract the text in the browser with `pdfjs-dist`** and send only the text, for
  three reasons:
  - **Privacy:** only text leaves the browser, and you can show the user "here's what we read".
  - **Payload:** a few KB instead of MBs of base64.
  - **Robustness:** LinkedIn and most CVs are text PDFs.
- **Fallback:** if the extracted text is under about 200 characters (a scanned PDF), send the PDF inline
  as `{ inlineData: { mimeType: "application/pdf", data: <base64> } }`, capped at about 8 MB client-side.
- Treat the ChatGPT or Claude export as plain pasted text. Truncate it to about 30K tokens.

### 4.2 Speech input (Chrome and Safari)

| Option | Chrome | Safari | Verdict |
|---|---|---|---|
| Web Speech API (`webkitSpeechRecognition`) | Yes (Google servers) | Yes since 14.1, prefixed, uses Apple servers, asks permission ([addpipe, Aug 2026](https://blog.addpipe.com/apple-speechanalyzer-api/)) | Quality and behaviour differ by browser and stop on silence. **Use it only for live captions while recording, in Chrome.** |
| **MediaRecorder → `/api/transcribe` → Gemini** | `audio/webm;codecs=opus` | `audio/mp4` (AAC) | **Recommended.** Same quality everywhere and still Google-only. 32 tokens per second of audio, so 1 minute is about 1,920 tokens and costs well under a cent. Inline request limit is 20 MB, and 2 minutes of Opus is about 0.5 MB. |
| Gemini Live API (WebSocket + ephemeral tokens) | Yes | Yes | Overkill for one-shot paragraph answers, with more moving parts. **Skip it.** |

- Gemini lists `audio/webm` and `audio/m4a` as supported ([audio doc](https://aistudio.google.com/docs/audio)).
  **[UNVERIFIED]** that Safari's `audio/mp4` is accepted as-is. Test on an iPhone on Saturday; if it
  fails, send it with the MIME type `audio/m4a`, or record WAV with an AudioWorklet (16 kHz mono is about
  32 KB/s).
- Prompt: *"Transcribe verbatim. Keep filler words out. Return only the transcript."* Put the transcript
  into the editable textarea; never submit it automatically.

---

## 5. Voice out and images (extras)

### 5.1 TTS
- `gemini-3.8-flash-tts` (expressive) or `gemini-3.8-flash-lite-tts` (cheaper and faster), with 30
  prebuilt voices ([speech doc](https://aistudio.google.com/docs/speech-generation)).
- **Older-sounding voices:** **Gacrux ("Mature")** and **Algenib ("Gravelly")**; **Sulafat ("Warm")**
  and **Vindemiatrix ("Gentle")** also work. Style can be set in natural language ("warm, unhurried,
  reflective"), and tags such as `<sigh>` or `<short pause>` are supported. The docs **advise against
  putting age in the style prompt** and suggest picking a voice, or "Voice design" (Preview) for a custom
  voice.
- Output: unary requests return WAV (24 kHz, mono, 16-bit). Streaming returns raw PCM (`audio/l16`),
  which you play with Web Audio.
- **Cost** is about $0.00225 per 10 s, so a 15 s reply costs about $0.003. **Latency [UNVERIFIED]:**
  measure it. Synthesize only when the user taps the speaker icon, then stream it.
- The AI Studio doc shows TTS through the Interactions API. On Agent Platform, use generateContent with
  `generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Gacrux" } } } }`.
  **[UNVERIFIED]** for the 3.8 TTS models. The audio comes back as base64 PCM in `inlineData`, so add a
  44-byte WAV header on the client.

### 5.2 Images and share cards
- Nano Banana 2 Lite (`gemini-3.1-flash-lite-image`) costs about $0.034 per 1K image; Nano Banana 2
  costs about $0.067. There is no free tier, and generation takes several seconds **[UNVERIFIED]**.
- **Recommendation:** make share cards typographic and data-driven: four life titles, the meters, and
  one quote. They are on brand, instant and free.
  - **Client-side:** render a hidden DOM node to PNG with `modern-screenshot` or `html-to-image`, then
    use `navigator.share({ files })` on mobile or offer a download. No server and nothing stored.
  - **Link previews (OG):** `workers-og` (Satori + resvg-wasm) on the Worker. CPU is fine on the Paid
    plan. This needs **opt-in** storage of card data in **KV** with a TTL (for example 30 days): only the
    card text, never the answers.
- An AI illustration ("you at 70 in life B") is a Sunday-morning stretch at best.

---

## 6. Project structure

### 6.1 Scaffold
```bash
# C3 React template = Vite + React SPA + Worker API + @cloudflare/vite-plugin
npm create cloudflare@latest -- app --framework=react     # then move files to repo root, or keep app/
cd app
npm i hono zod partial-json eventsource-parser pdfjs-dist motion
npm i -D @cloudflare/workers-types        # if the template doesn't already generate types (`wrangler types`)
# optional: npm i workers-og modern-screenshot zustand
```
- **Do not use `@google/genai` in the Worker.** Plain `fetch` is about 30 lines (§3.4), has no
  edge-runtime surprises, and works with both auth options. **[UNVERIFIED]** whether the current SDK runs
  cleanly on workerd.
- Wrangler is not installed globally. Use `npx wrangler` (4.158.0 resolves).

### 6.2 Layout
```
every-life-you-have-left/
├── wrangler.jsonc
├── vite.config.ts            # plugins: [react(), cloudflare()]
├── index.html
├── .dev.vars                 # GCP_API_KEY=...  (gitignored, local dev only)
├── shared/                   # imported by both sides
│   ├── schema.ts             # zod + JSON Schemas: Profile, Plan, Life, Year, ChatMsg
│   └── types.ts
├── worker/                   # the API (Hono)
│   ├── index.ts              # routes: /api/profile /api/question /api/plan /api/life
│   │                         #         /api/retune /api/chat /api/transcribe /api/tts /api/card
│   ├── gemini.ts             # fetch wrapper, retries, fallback chain, SA-JWT (§3.4)
│   └── prompts/              # profile.ts questions.ts plan.ts life.ts retune.ts chat.ts
├── src/                      # React SPA
│   ├── main.tsx  App.tsx
│   ├── screens/              # Explainer Consent Upload Questions Story Chat Result
│   ├── components/           # LifeLane YearGrid Meter PauseCard WhyPopover MicButton
│   ├── lib/
│   │   ├── stream.ts         # SSE + partial JSON (§3.6)
│   │   ├── pdf.ts            # pdfjs-dist text extraction
│   │   ├── recorder.ts       # MediaRecorder → base64
│   │   └── session.ts        # state in memory + IndexedDB/localStorage ("data stays in your browser")
│   └── demo/owner-life.json  # pre-generated showcase (offline fallback)
└── public/                   # fonts, og fallback image
```

### 6.3 wrangler.jsonc
```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "every-life-you-have-left",
  "main": "./worker/index.ts",
  "compatibility_date": "2026-11-06",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]          // SPA routes never wake the Worker
  },
  "observability": { "enabled": true },     // never console.log request bodies
  "limits": { "cpu_ms": 60000 },            // Paid plan; headroom for workers-og
  "vars": {
    "GCP_PROJECT": "triangle-ai-hack-2026",
    "MODEL_HEAVY": "gemini-3.8-flash",
    "MODEL_FAST": "gemini-3.5-flash-lite"
  }
  // secrets (not here): GCP_API_KEY  — or GCP_SA_JSON for option B
  // share cards (only if built):
  // "kv_namespaces": [{ "binding": "CARDS", "id": "<from wrangler kv namespace create CARDS>" }]
}
```

### 6.4 Dev and deploy
```bash
npm run dev                               # Vite + workerd locally; reads .dev.vars
npx wrangler secret put GCP_API_KEY       # paste key (or: GCP_SA_JSON < sa.json)
npm run build && npx wrangler deploy      # or `npm run deploy`; serves on *.workers.dev
```
- Workers Builds (Git CI) is optional. A manual `deploy` from one laptop is fine for a 2-person team.
  Agree on one deployer.
- **Protecting the public URL:** after submission the link is public and anyone can spend the credits.
  Options, simplest first:
  1. A Workers rate-limit binding, around 60 requests/min per IP. Keep it loose: judges share the expo
     Wi-Fi IP. **[UNVERIFIED]** the current config key `ratelimits`.
  2. An `EXPO_MODE` variable that turns the API off.
  3. The budget alert.
  4. **Delete the key after judging.**

---

## 7. GCP setup: exactly what to click (no gcloud needed)

### 7.1 Create the key (option A, recommended)
1. **Service account:**
   <https://console.cloud.google.com/iam-admin/serviceaccounts/create?project=triangle-ai-hack-2026>
   - Name `elyl-worker`. Grant role **Vertex AI User** (`roles/aiplatform.user`; the console may label
     it "Agent Platform User"). Click Done.
2. **API key bound to it:** <https://console.cloud.google.com/apis/credentials?project=triangle-ai-hack-2026>
   - Click **Create credentials → API key**.
   - Tick **"Authenticate API calls through a service account"** and choose `elyl-worker`.
   - Under **Restrict key → API restrictions**, select only **Agent Platform API**
     (`aiplatform.googleapis.com`). Save.
3. **Smoke test** (about 2 minutes). It answers the open questions about which URL form accepts the key
   and whether `thinkingLevel` works on 3.8 Flash:
   ```bash
   KEY=...   # paste
   # project-scoped (preferred)
   curl -sS "https://aiplatform.googleapis.com/v1/projects/triangle-ai-hack-2026/locations/global/publishers/google/models/gemini-3.8-flash:generateContent" \
     -H "x-goog-api-key: $KEY" -H "content-type: application/json" \
     -d '{"contents":[{"role":"user","parts":[{"text":"Say hi in 3 words"}]}],"generationConfig":{"thinkingConfig":{"thinkingLevel":"low"}}}'
   # if that 401/403s, try the express-style global form:
   curl -sS "https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.8-flash:generateContent" \
     -H "x-goog-api-key: $KEY" -H "content-type: application/json" \
     -d '{"contents":[{"role":"user","parts":[{"text":"Say hi in 3 words"}]}]}'
   # streaming check:
   curl -N "https://aiplatform.googleapis.com/v1/projects/triangle-ai-hack-2026/locations/global/publishers/google/models/gemini-3.8-flash:streamGenerateContent?alt=sse" \
     -H "x-goog-api-key: $KEY" -H "content-type: application/json" \
     -d '{"contents":[{"role":"user","parts":[{"text":"Count to 20"}]}]}'
   ```
   Repeat it for `gemini-3.5-flash-lite` and `gemini-4-argon`, to confirm the models are available in
   `global`. **[UNVERIFIED]**
4. **If both forms reject the key, use option B:** service account `elyl-worker` → **Keys → Add key →
   Create new key → JSON**, then `npx wrangler secret put GCP_SA_JSON` and paste the file contents. The
   code in §3.4 switches automatically. If JSON key creation is blocked by the org policy
   `iam.disableServiceAccountKeyCreation`, go to option C.
5. **Option C, last resort:** <https://aistudio.google.com/api-keys>
   - Dashboard → Projects → **Import projects** → `triangle-ai-hack-2026`, then **Create API key**.
   - Restrict it to **Gemini API only**.
   - Check the Billing tier column. If it asks you to **Prepay with a card**, stop and let the owner
     decide.
   - Change `BASE` to
     `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`.

### 7.2 Budget and credit check
- **Budget alert:**
  <https://console.cloud.google.com/billing/013251-22802C-A06EE2/budgets?project=triangle-ai-hack-2026>
  - Create a budget scoped to project `triangle-ai-hack-2026`, amount **$100**, with thresholds at
    25/50/75/90/100% and email alerts.
  - Budgets **alert only; they do not cap spend**. The kill switch is deleting the key.
- **Credits present:** <https://console.cloud.google.com/billing/013251-22802C-A06EE2/credits>. Check
  that the $100 education credit is active and scoped to all services.
- **Credits actually applied:** on Saturday morning, after about $0.50 of test traffic, open Billing →
  **Reports**, filter to the project, and show credits. The Agent Platform SKUs should be offset. If they
  are not, raise it at once (fallback: the Thinking Machines credit cannot replace Gemini, so the owner
  would decide whether to pay a few dollars by card).

### 7.3 Is gcloud worth installing?
**No, not for option A.** The console steps above take about 10 minutes. Install it only if you go with
option B and want to debug tokens (`brew install --cask google-cloud-sdk` **[UNVERIFIED cask name]**,
about 5 min, then `gcloud auth print-access-token`).

---

## 8. Questions the owner must decide

1. **Key path:** approve option A (Agent Platform API key bound to a service account). If both URL forms
   in the smoke test fail, it becomes B. Option C (AI Studio) only if Prepay is acceptable.
2. **Model for the lives:** default to `gemini-3.8-flash` at low thinking, or A/B test against
   `gemini-4-argon` on Saturday morning? Argon costs about 3× and is likely slower to first token. Use it
   at least for the pre-generated owner demo.
3. **Re-tune semantics:** does an answer at a pause reshape all 4 lives, or only "your own" life?
   Generate the full life to 70 and regenerate after each answer, or **generate segment by segment**
   (recommended for cost and latency)?
4. **Voice out (TTS):** in or out, and which voice: Gacrux or Algenib? The same voice for all 4 lives, or
   a different one per life?
5. **Share cards:** client-side PNG only (nothing stored), or opt-in KV and OG link previews? AI
   illustration: recommended no.
6. **Expo protection:** per-IP rate limit, an `EXPO_MODE` switch, or a passcode? Delete the key after
   12:15pm Sunday?
7. **Priority PayGo during judging** (about 1.8× cost) for fewer 429s: yes or no? Check the header name
   first.
8. **AI Gateway:** skip it (recommended), or add it on Saturday with payload logging off, for an
   analytics screenshot in the pitch?
9. **Scaffold location:** repo root or an `app/` subfolder?

---

## Sources
- Google AI Studio docs: [models](https://aistudio.google.com/docs/models) · [pricing](https://aistudio.google.com/docs/pricing) · [3.8 Flash](https://aistudio.google.com/docs/models/gemini-3.8-flash) · [4 Argon](https://aistudio.google.com/docs/models/gemini-4-argon) · [3.5 Flash-Lite](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite) · [What's new in 3.8](https://aistudio.google.com/docs/whats-new-gemini-3.8) · [rate limits](https://aistudio.google.com/docs/rate-limits) · [billing](https://aistudio.google.com/docs/billing) · [API keys](https://aistudio.google.com/docs/api-key) · [structured output](https://aistudio.google.com/docs/structured-output) · [Interactions API](https://aistudio.google.com/docs/interactions) · [Interactions reference](https://aistudio.google.com/api-reference/interactions-api) · [generateContent reference](https://aistudio.google.com/api-reference/generate-content) · [text generation](https://aistudio.google.com/docs/text-generation) · [PDF / documents](https://aistudio.google.com/docs/document-processing) · [audio](https://aistudio.google.com/docs/audio) · [speech generation](https://aistudio.google.com/docs/speech-generation)
- Google Cloud: [Agent Platform release notes](https://docs.cloud.google.com/gemini-enterprise-agent-platform/release-notes?hl=en) · [express mode overview](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/start/express-mode/overview) · [API keys](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/start/api-keys) · [Vertex → Agent Platform rename (Wikipedia)](https://en.wikipedia.org/wiki/Gemini_Enterprise_Agent_Platform)
- Forums and community: [educational coupon question (unanswered)](https://discuss.ai.google.dev/t/can-gcp-educational-coupons-be-used-for-ai-studio-credits/141658) · [credits not used by AI Studio](https://discuss.ai.google.dev/t/google-ai-studio-do-not-use-my-1300-credits-shown-on-google-cloud/140442) · [credits via Vertex + ADC (DEV)](https://dev.to/bravian1/how-to-use-your-google-cloud-credits-for-gemini-again-via-vertex-ai-and-adc-7ei) · [Artificial Analysis 3.8 Flash](https://artificialanalysis.ai/models/gemini-3-8-flash/providers) · [Safari speech (addpipe)](https://blog.addpipe.com/apple-speechanalyzer-api/)
- Cloudflare: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) · [subrequests changelog](https://developers.cloudflare.com/changelog/post/2026-02-11-subrequests-limit/) · [React + Vite guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/) · [Static Assets](https://developers.cloudflare.com/workers/static-assets/) · [Vite plugin tutorial](https://developers.cloudflare.com/workers/vite-plugin/tutorial/) · [AI Gateway: Google AI Studio](https://developers.cloudflare.com/ai-gateway/usage/providers/google-ai-studio/) · [AI Gateway logging](https://developers.cloudflare.com/ai-gateway/observability/logging/) · [AI Gateway request handling](https://developers.cloudflare.com/ai-gateway/configuration/request-handling/) · [Unified Billing (provider auth table)](https://developers.cloudflare.com/ai-gateway/features/unified-billing/)
