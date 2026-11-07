/**
 * Media routes (Hono, beside the session agent):
 *   POST /api/transcribe   audio body (audio/*) or multipart "audio" → { text }            (fast model)
 *   POST /api/portrait     JSON { sessionId, band?, age, appearance?, selfie? (data URL or base64), selfieMime? }
 *                          → { url, band, forAge, model }. band "now" (default) draws the base portrait;
 *                          "35" | "50" | "70" ages the stored base image (same person, same style).
 *   POST /api/tts          JSON { text, voice?: "future" | "interviewer" | <voice name>, sessionId? } → audio/wav
 *                          (cached in R2 by hash; x-media-url header has the same-origin URL)
 *   POST /api/upload       multipart { sessionId, kind: cv|linkedin|ai_export, text?, file? } → { ok, chars, key }
 *                          Raw file → R2; text (pdf.js in the browser, or Gemini for scans) → agent.addDocument
 *   GET  /media/<key>      R2 object, same origin
 * Never log bodies. Portraits are illustrated, never photoreal; race is never inferred (D-011, D-086).
 */
import { getAgentByName } from "agents";
import { Hono } from "hono";
import { Appearance, PortraitAgeBand, type Portrait } from "../shared/sim";
import { MEDIA_USD, recordSpend } from "./spend";
import { GeminiError, GenerationDisabledError, VOICES, b64ToBytes, bindLlm, bytesToB64, generateImage, generateText, transcribe, tts, type LlmEnv } from "./llm";

type AppEnv = { Bindings: Env };
export const media = new Hono<AppEnv>();

const MAX_AUDIO = 15 * 1024 * 1024;
const MAX_IMAGE = 8 * 1024 * 1024;
const MAX_FILE = 20 * 1024 * 1024;

media.use("*", async (c, next) => {
  bindLlm(c.env as unknown as LlmEnv);
  await next();
});

function fail(e: unknown) {
  if (e instanceof GenerationDisabledError) return { status: 503 as const, body: { ok: false, error: "generation_disabled" } };
  if (e instanceof GeminiError) return { status: 502 as const, body: { ok: false, error: "model_error", status: e.status } };
  return { status: 500 as const, body: { ok: false, error: "internal" } };
}

const safeId = (s: unknown) => (typeof s === "string" && /^[A-Za-z0-9_-]{4,80}$/.test(s) ? s : null);

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

async function noteMedia(env: Env, key: string, sessionId: string | null, kind: string, band: string | null, model: string | null) {
  try {
    await env.DB.prepare(`INSERT OR REPLACE INTO sim_media (key, session_id, kind, band, model) VALUES (?1, ?2, ?3, ?4, ?5)`)
      .bind(key, sessionId, kind, band, model)
      .run();
  } catch (e) {
    console.error("media row failed", e instanceof Error ? e.name : "error");
  }
}

function sessionStub(env: Env, sessionId: string) {
  return getAgentByName(env.SessionAgent, sessionId);
}

// ---------------------------------------------------------------------------------------------

media.post("/api/transcribe", async (c) => {
  const ct = c.req.header("content-type") ?? "";
  let mime = "audio/webm";
  let bytes: Uint8Array;
  if (ct.startsWith("multipart/form-data")) {
    const form = await c.req.formData();
    const f = form.get("audio");
    if (!f || typeof f === "string") return c.json({ ok: false, error: "missing_audio" }, 400);
    mime = f.type || mime;
    bytes = new Uint8Array(await f.arrayBuffer());
  } else {
    mime = ct.split(";")[0]?.trim() || mime;
    bytes = new Uint8Array(await c.req.arrayBuffer());
  }
  if (!bytes.length) return c.json({ ok: false, error: "empty_audio" }, 400);
  if (bytes.length > MAX_AUDIO) return c.json({ ok: false, error: "too_large" }, 413);
  try {
    const t0 = Date.now();
    const text = await transcribe({ mimeType: mime, data: bytesToB64(bytes) }, { signal: c.req.raw.signal });
    await recordSpend(c.env, MEDIA_USD.transcribe, { now: true });
    return c.json({ ok: true, text, ms: Date.now() - t0 });
  } catch (e) {
    const f = fail(e);
    return c.json(f.body, f.status);
  }
});

// ---------------------------------------------------------------------------------------------

const HAIR: Record<string, string> = {
  short: "short hair", medium: "medium-length hair", long: "long hair", curly: "curly hair", coily: "coily hair", shaved: "a shaved head", bun: "hair in a bun",
};
const SKIN: Record<string, string> = {
  tone1: "very light skin", tone2: "light skin", tone3: "light-medium skin", tone4: "medium-tan skin", tone5: "brown skin", tone6: "deep brown skin",
};

/** Who to draw, from the gender they gave (never inferred). Not set / prefer not to say = no gendered styling. */
const WHO: Record<string, string> = {
  woman: "a woman",
  man: "a man",
  nonbinary: "a non-binary person with androgynous styling",
  undisclosed: "a person",
};

function describe(app: Appearance | null): string {
  if (!app) return "a friendly, neutral-looking person";
  const who = (app.gender && WHO[app.gender]) || "a person";
  const parts = [
    app.hairStyle ? HAIR[app.hairStyle] : null,
    app.hairColor ? `${app.hairColor.replace("_", " ")} hair colour` : null,
    app.skinTone ? SKIN[app.skinTone] : null,
    app.glasses ? "glasses" : null,
    app.facialHair === true ? "a short beard" : app.facialHair === false ? "clean-shaven" : null,
  ].filter(Boolean);
  if (!parts.length) return who === "a person" ? "a friendly, neutral-looking person" : `${who}, friendly and natural-looking`;
  return `${who} with ${parts.join(", ")}`;
}

/** For a selfie: the gender they gave, stated (never read from the photo). */
function selfieWho(app: Appearance | null): string {
  if (app?.gender === "woman") return " They identify as a woman.";
  if (app?.gender === "man") return " They identify as a man.";
  if (app?.gender === "nonbinary") return " They identify as non-binary; add no gendered styling.";
  return "";
}

const STYLE =
  "Illustrated portrait in a warm editorial storybook style: soft gouache and ink texture, gentle flat shapes, " +
  "subtle paper grain, muted natural palette with one warm accent, plain softly lit background. Head and shoulders, " +
  "facing slightly to the side, calm expression. NOT a photo, not photorealistic, not 3D render, no text, no frame.";

const AGED = (n: number) =>
  `Redraw this exact same person, in exactly the same illustration style, palette and framing, aged to about ${n} years old. ` +
  `Keep their identity, face shape, skin tone and features. Show age naturally and kindly (hair, lines, posture). ${STYLE}`;

function parseDataUrl(s: string, mime?: string): { mimeType: string; data: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/.exec(s);
  if (m) return { mimeType: m[1]!, data: m[2]! };
  if (/^[A-Za-z0-9+/=\s]+$/.test(s.slice(0, 200))) return { mimeType: mime ?? "image/jpeg", data: s.replace(/\s+/g, "") };
  return null;
}

media.post("/api/portrait", async (c) => {
  let body: { sessionId?: string; band?: string; age?: number; appearance?: unknown; selfie?: string; selfieMime?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "bad_json" }, 400);
  }
  const sessionId = safeId(body.sessionId);
  if (!sessionId) return c.json({ ok: false, error: "bad_session" }, 400);
  const band = PortraitAgeBand.safeParse(body.band ?? "now");
  if (!band.success) return c.json({ ok: false, error: "bad_band" }, 400);
  const appearance = body.appearance ? Appearance.safeParse(body.appearance) : null;
  const nowAge = Math.max(18, Math.min(100, Math.round(Number(body.age) || 25)));
  const forAge = band.data === "now" ? nowAge : Number(band.data);

  try {
    let image: { mimeType: string; data: string } | undefined;
    let prompt: string;
    if (band.data === "now") {
      const selfie = body.selfie ? parseDataUrl(body.selfie, body.selfieMime) : null;
      if (selfie && selfie.data.length * 0.75 > MAX_IMAGE) return c.json({ ok: false, error: "too_large" }, 413);
      if (selfie) {
        image = selfie;
        const key = `selfies/${sessionId}.${selfie.mimeType.split("/")[1] ?? "jpg"}`;
        await c.env.UPLOADS.put(key, b64ToBytes(selfie.data), { httpMetadata: { contentType: selfie.mimeType } });
        void noteMedia(c.env, key, sessionId, "selfie", null, null);
        prompt =
          `Turn the person in this photo into an illustration, about ${forAge} years old. Keep their real features, ` +
          `face shape, hair and skin tone exactly as in the photo; do not change or guess their ethnicity or gender.` +
          `${selfieWho(appearance?.success ? appearance.data : null)} ${STYLE}`;
      } else {
        prompt = `Draw ${describe(appearance?.success ? appearance.data : null)}, about ${forAge} years old. ${STYLE}`;
      }
    } else {
      const base = await c.env.UPLOADS.get(`portraits/${sessionId}/base`);
      if (base) {
        image = { mimeType: base.httpMetadata?.contentType ?? "image/png", data: bytesToB64(new Uint8Array(await base.arrayBuffer())) };
        prompt = AGED(forAge);
      } else {
        prompt = `Draw ${describe(appearance?.success ? appearance.data : null)}, about ${forAge} years old. ${STYLE}`;
      }
    }
    const img = await generateImage(prompt, { image, aspectRatio: "1:1", signal: c.req.raw.signal });
    await recordSpend(c.env, MEDIA_USD.image, { now: true });
    const ext = img.mimeType.includes("jpeg") ? "jpg" : img.mimeType.split("/")[1] ?? "png";
    const unique = `portraits/${sessionId}/${band.data}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const meta = { httpMetadata: { contentType: img.mimeType } };
    await Promise.all([c.env.UPLOADS.put(unique, img.bytes, meta), band.data === "now" ? c.env.UPLOADS.put(`portraits/${sessionId}/base`, img.bytes, meta) : null]);
    void noteMedia(c.env, unique, sessionId, "portrait", band.data, img.model);
    const portrait: Portrait = { band: band.data, url: `/media/${unique}`, forAge };
    try {
      const stub = await sessionStub(c.env, sessionId);
      await stub.addPortrait(portrait);
    } catch (e) {
      console.error("addPortrait failed", e instanceof Error ? e.name : "error");
    }
    return c.json({ ok: true, ...portrait, model: img.model });
  } catch (e) {
    const f = fail(e);
    return c.json(f.body, f.status);
  }
});

// ---------------------------------------------------------------------------------------------

media.post("/api/tts", async (c) => {
  let body: { text?: string; voice?: string; sessionId?: string; style?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "bad_json" }, 400);
  }
  const text = String(body.text ?? "").trim().slice(0, 2000);
  if (!text) return c.json({ ok: false, error: "empty_text" }, 400);
  const voice =
    body.voice === "interviewer" ? VOICES.interviewer
    : !body.voice || body.voice === "future" ? VOICES.future
    : /^[A-Za-z]{3,20}$/.test(body.voice) ? body.voice
    : VOICES.future;
  const style =
    body.style?.slice(0, 200) ??
    (voice === VOICES.interviewer ? "calm, friendly" : "slow, warm, older voice, looking back on a life");
  const key = `tts/${await sha256(`${voice}|${style}|${text}`)}.wav`;
  const hit = await c.env.UPLOADS.get(key);
  if (hit) return new Response(hit.body, { headers: { "content-type": "audio/wav", "cache-control": "public, max-age=31536000, immutable", "x-media-url": `/media/${key}` } });
  try {
    const audio = await tts(text, { voice, style, signal: c.req.raw.signal });
    await recordSpend(c.env, MEDIA_USD.tts, { now: true });
    await c.env.UPLOADS.put(key, audio.bytes, { httpMetadata: { contentType: "audio/wav" } });
    void noteMedia(c.env, key, safeId(body.sessionId), "tts", voice, audio.model);
    return new Response(audio.bytes, { headers: { "content-type": "audio/wav", "cache-control": "no-store", "x-media-url": `/media/${key}`, "x-model": audio.model } });
  } catch (e) {
    const f = fail(e);
    return c.json(f.body, f.status);
  }
});

// ---------------------------------------------------------------------------------------------

const KINDS = new Set(["cv", "linkedin", "ai_export"]);

media.post("/api/upload", async (c) => {
  const ct = c.req.header("content-type") ?? "";
  let sessionId: string | null;
  let kind: string;
  let text = "";
  let file: File | null = null;
  if (ct.startsWith("multipart/form-data")) {
    const form = await c.req.formData();
    sessionId = safeId(form.get("sessionId"));
    kind = String(form.get("kind") ?? "");
    text = String(form.get("text") ?? "");
    const f = form.get("file");
    file = f && typeof f !== "string" ? f : null;
  } else {
    const b = (await c.req.json().catch(() => ({}))) as { sessionId?: string; kind?: string; text?: string };
    sessionId = safeId(b.sessionId);
    kind = String(b.kind ?? "");
    text = String(b.text ?? "");
  }
  if (!sessionId) return c.json({ ok: false, error: "bad_session" }, 400);
  if (!KINDS.has(kind)) return c.json({ ok: false, error: "bad_kind" }, 400);
  if (file && file.size > MAX_FILE) return c.json({ ok: false, error: "too_large" }, 413);

  let key: string | null = null;
  try {
    if (file) {
      const name = (file.name || "upload").replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
      key = `uploads/${sessionId}/${crypto.randomUUID().slice(0, 8)}-${name}`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      await c.env.UPLOADS.put(key, bytes, { httpMetadata: { contentType: file.type || "application/octet-stream" } });
      void noteMedia(c.env, key, sessionId, `upload_${kind}`, null, null);
      // Scanned PDF (no text from pdf.js): let Gemini read it (D-066).
      if (!text.trim() && (file.type === "application/pdf" || name.toLowerCase().endsWith(".pdf"))) {
        const r = await generateText("fast", [
          { role: "user", parts: [{ inlineData: { mimeType: "application/pdf", data: bytesToB64(bytes) } }, { text: "Extract all the text of this document as plain text. No commentary." }] },
        ], { timeoutMs: 45_000 });
        await recordSpend(c.env, MEDIA_USD.image, { now: true }); // a PDF read: about an image's worth
        text = r.text;
      }
    }
    text = text.slice(0, 60_000);
    if (text.trim()) {
      const stub = await sessionStub(c.env, sessionId);
      await stub.addDocument(kind as "cv" | "linkedin" | "ai_export", text);
    }
    return c.json({ ok: true, chars: text.length, key });
  } catch (e) {
    const f = fail(e);
    return c.json({ ...f.body, key }, f.status);
  }
});

// ---------------------------------------------------------------------------------------------

media.get("/media/*", async (c) => {
  const key = decodeURIComponent(c.req.path.slice("/media/".length));
  if (!key || key.includes("..") || key.startsWith("uploads/") || key.startsWith("selfies/")) return c.json({ ok: false, error: "not_found" }, 404);
  const obj = await c.env.UPLOADS.get(key);
  if (!obj) return c.json({ ok: false, error: "not_found" }, 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", key.endsWith("/base") ? "no-cache" : "public, max-age=31536000, immutable");
  return new Response(obj.body, { headers });
});
