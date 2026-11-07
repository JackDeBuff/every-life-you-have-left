/**
 * Shared postcards (D-031, opt-in):
 *   POST /api/share                 store the postcard (ShareInput) → { id, url, token }
 *   PUT  /api/share/:id/postcard    attach the postcard PNG (x-share-token), used as the page's hero + og:image
 *   GET  /s/:id                     a small server-rendered page with Open Graph tags
 *   GET  /s/:id/postcard.png        the PNG     GET /s/:id/portrait   the portrait (copied, never the session's URL)
 *
 * Only what is on the postcard is stored (worker/share-card.ts). The session id stays private: the
 * portrait is copied under shares/<id>/ so its URL (which contains the session id) never leaks.
 * Table: migrations/0003_postcard_shares.sql.
 */
import { Hono } from "hono";
import { ShareCardV2, ShareInput, type ShareCreated } from "./share-card";

export const share = new Hono<{ Bindings: Env }>();

const MAX_PNG = 4 * 1024 * 1024;
const ID_ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";

function randomId(n: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  let s = "";
  for (const b of bytes) s += ID_ALPHABET[b % ID_ALPHABET.length];
  return s;
}

async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const validId = (id: string | undefined): id is string => !!id && /^[A-Za-z0-9]{6,16}$/.test(id);

interface Row {
  id: string;
  card_json: string;
  image_key: string | null;
}

share.post("/api/share", async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "bad_json" }, 400);
  }
  const parsed = ShareInput.safeParse(raw);
  if (!parsed.success) return c.json({ ok: false, error: "bad_card" }, 400);
  const input = parsed.data;
  const db = c.env.DB;
  const origin = new URL(c.req.url).origin;

  const card: Omit<ShareCardV2, "portraitKey"> = {
    v: 2,
    firstName: input.firstName?.trim() || null,
    endAge: input.endAge,
    endYear: input.endYear,
    place: input.place.trim(),
    lives: input.lives.map((l) => ({ ...l, title: l.title.trim(), verdict: l.verdict.trim() })),
    fiveYear: input.fiveYear?.trim() || null,
  };
  const cardHash = await sha256(JSON.stringify({ ...card, portrait: input.portraitUrl ?? null }));
  const token = randomId(24);
  const tokenHash = await sha256(token);

  try {
    // The same postcard shared twice from the same session keeps its link (new upload token).
    if (input.sessionId) {
      const prev = await db
        .prepare(`SELECT id FROM postcard_shares WHERE session_id = ?1 AND card_hash = ?2 ORDER BY created_at DESC LIMIT 1`)
        .bind(input.sessionId, cardHash)
        .first<{ id: string }>();
      if (prev) {
        await db.prepare(`UPDATE postcard_shares SET token_hash = ?1 WHERE id = ?2`).bind(tokenHash, prev.id).run();
        return c.json({ ok: true, id: prev.id, url: `${origin}/s/${prev.id}`, token } satisfies ShareCreated);
      }
    }

    const id = randomId(9);
    let portraitKey: string | null = null;
    const pu = input.portraitUrl;
    if (pu && /^\/media\/portraits\/[A-Za-z0-9_\-./]+$/.test(pu) && !pu.includes("..")) {
      const obj = await c.env.UPLOADS.get(decodeURIComponent(pu.slice("/media/".length)));
      if (obj && obj.size < MAX_PNG) {
        const type = obj.httpMetadata?.contentType ?? "image/png";
        portraitKey = `shares/${id}/portrait`;
        await c.env.UPLOADS.put(portraitKey, await obj.arrayBuffer(), { httpMetadata: { contentType: type } });
      }
    }
    const stored: ShareCardV2 = { ...card, portraitKey };
    await db
      .prepare(`INSERT INTO postcard_shares (id, session_id, card_json, card_hash, token_hash) VALUES (?1, ?2, ?3, ?4, ?5)`)
      .bind(id, input.sessionId, JSON.stringify(stored), cardHash, tokenHash)
      .run();
    return c.json({ ok: true, id, url: `${origin}/s/${id}`, token } satisfies ShareCreated);
  } catch (e) {
    console.error("share failed", e instanceof Error ? e.name : "error");
    return c.json({ ok: false, error: "share_failed" }, 500);
  }
});

share.put("/api/share/:id/postcard", async (c) => {
  const id = c.req.param("id");
  if (!validId(id)) return c.json({ ok: false, error: "not_found" }, 404);
  const token = c.req.header("x-share-token") ?? "";
  const row = await c.env.DB.prepare(`SELECT token_hash FROM postcard_shares WHERE id = ?1`).bind(id).first<{ token_hash: string }>();
  if (!row || !token || (await sha256(token)) !== row.token_hash) return c.json({ ok: false, error: "forbidden" }, 403);
  const body = new Uint8Array(await c.req.arrayBuffer());
  const isPng = body.length > 8 && body[0] === 0x89 && body[1] === 0x50 && body[2] === 0x4e && body[3] === 0x47;
  if (!isPng || body.length > MAX_PNG) return c.json({ ok: false, error: "bad_image" }, 400);
  const key = `shares/${id}/postcard.png`;
  await c.env.UPLOADS.put(key, body, { httpMetadata: { contentType: "image/png" } });
  await c.env.DB.prepare(`UPDATE postcard_shares SET image_key = ?1 WHERE id = ?2`).bind(key, id).run();
  return c.json({ ok: true });
});

async function serveR2(env: Env, key: string, maxAge: number): Promise<Response> {
  const obj = await env.UPLOADS.get(key);
  if (!obj) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", `public, max-age=${maxAge}`);
  return new Response(obj.body, { headers });
}

share.get("/s/:id/postcard.png", async (c) => {
  const id = c.req.param("id");
  if (!validId(id)) return c.text("Not found", 404);
  return serveR2(c.env, `shares/${id}/postcard.png`, 300);
});

share.get("/s/:id/portrait", async (c) => {
  const id = c.req.param("id");
  if (!validId(id)) return c.text("Not found", 404);
  return serveR2(c.env, `shares/${id}/portrait`, 86400);
});

share.get("/s/:id", async (c) => {
  const id = c.req.param("id");
  const origin = new URL(c.req.url).origin;
  let row: Row | null = null;
  if (validId(id)) {
    try {
      row = await c.env.DB.prepare(`SELECT id, card_json, image_key FROM postcard_shares WHERE id = ?1`).bind(id).first<Row>();
    } catch (e) {
      console.error("share read failed", e instanceof Error ? e.name : "error");
    }
  }
  const card = row ? ShareCardV2.safeParse(JSON.parse(row.card_json)) : null;
  if (!row || !card?.success) return c.html(notFoundPage(origin), 404);
  c.executionCtx.waitUntil(c.env.DB.prepare(`UPDATE postcard_shares SET views = views + 1 WHERE id = ?1`).bind(id).run().catch(() => undefined));
  return c.html(sharePage(card.data, { id, origin, image: !!row.image_key }), 200, { "cache-control": "public, max-age=60" });
});

// ---------------------------------------------------------------------------------------------
// The page (server-rendered, no JS). Our type: Mona Sans for everything, Source Serif 4 italic only
// for the five-year answer (it is written from their own words). Light "Daylight", dark "Blue hour".
// ---------------------------------------------------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

const FONTS = "https://fonts.googleapis.com/css2?family=Mona+Sans:wdth,wght@75..125,300..900&family=Source+Serif+4:ital,opsz,wght@1,8..60,400..500&display=swap";

const STYLE = `
:root{--canvas:#E4E9EB;--panel:#F4F7F8;--raised:#fff;--ink:#0D1A1F;--ink-2:#44555C;--ink-3:#6B7C83;--hair:rgb(13 26 31/.12);--sun:rgb(255 95 74);--sun-soft:rgb(255 95 74/.2);
--f-sans:"Mona Sans","Mona Sans Variable",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;--f-voice:"Source Serif 4","Iowan Old Style",Georgia,serif;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--canvas:#05090B;--panel:#0A1215;--raised:#101B1F;--ink:#E3EBEC;--ink-2:#A2B3B8;--ink-3:#6E8288;--hair:rgb(227 235 236/.1);--sun-soft:rgb(255 95 74/.24);color-scheme:dark}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--panel);color:var(--ink);font-family:var(--f-sans);font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased}
a{color:inherit}
.bar{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:12px;height:52px;padding:0 16px;background:var(--panel);border-bottom:1px solid var(--hair)}
.wm{font-size:12px;font-weight:700;font-stretch:118%;letter-spacing:.08em;text-transform:uppercase;text-decoration:none}
.bar .go{font-size:13px;font-weight:600;text-decoration:none;color:var(--ink-2)}
main{max-width:980px;margin:0 auto;padding:28px 16px 64px}
.card{display:block;width:100%;height:auto;border-radius:2px;box-shadow:0 1px 0 rgb(13 26 31/.04),0 18px 40px -16px rgb(13 26 31/.35);background:var(--canvas)}
.sky{position:relative;overflow:hidden;border-radius:2px;aspect-ratio:3/2;max-height:420px;width:100%;background:linear-gradient(#22344A 0%,#C9775E 52%,#F2B27A 64%,#1C2B3A 64%,#0F1A24 100%);color:#F7F5F0;padding:clamp(20px,5vw,44px)}
.sky .sun{position:absolute;right:16%;top:64%;width:clamp(90px,16vw,150px);aspect-ratio:1;border-radius:50%;transform:translate(50%,-50%);background:var(--sun);box-shadow:0 0 0 clamp(30px,6vw,70px) rgb(255 95 74/.22)}
.sky .greet{margin:0;font-size:clamp(12px,1.8vw,18px);font-weight:720;letter-spacing:.08em;text-transform:uppercase}
.sky .age{margin:0;font-size:clamp(84px,17vw,170px);font-weight:760;font-stretch:125%;letter-spacing:-.05em;line-height:.9}
.sky .place{margin:6px 0 0;font-size:clamp(15px,2vw,22px);font-weight:560;opacity:.85}
.who{display:grid;grid-template-columns:auto 1fr;gap:20px;align-items:end;margin:40px 0 8px}
.who.solo{grid-template-columns:1fr}
.arch{width:88px;height:108px;border-radius:44px 44px 2px 2px;overflow:hidden;background:color-mix(in oklab,var(--sun) 24%,var(--canvas));border:1px solid var(--hair)}
.arch img{width:100%;height:100%;object-fit:cover;display:block}
h1{margin:0;font-size:clamp(40px,8vw,84px);font-weight:760;font-stretch:122%;letter-spacing:-.045em;line-height:.95;text-wrap:balance}
.lede{margin:16px 0 0;max-width:36rem;color:var(--ink-2);font-size:17px}
.label{font-size:11px;font-weight:650;font-stretch:82%;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3)}
.lives{list-style:none;margin:36px 0 0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:var(--hair);border:1px solid var(--hair)}
.lives li{background:var(--panel);padding:20px 20px 24px;display:grid;gap:8px;align-content:start}
.lives li[data-you="true"]{box-shadow:inset 0 3px 0 var(--sun)}
.num{font-size:11px;font-weight:760;font-stretch:82%;letter-spacing:.08em;color:var(--ink-3)}
.lives li[data-you="true"] .num{color:color-mix(in oklab,var(--sun) 60%,var(--ink))}
.lives h2{margin:0;font-size:21px;font-weight:680;font-stretch:118%;letter-spacing:-.02em;line-height:1.1}
.verdict{margin:6px 0 0;padding-top:10px;border-top:1px solid var(--hair);font-size:17px;font-weight:600;font-stretch:112%;letter-spacing:-.01em;line-height:1.3}
.five{margin:40px 0 0;padding:24px;background:var(--raised);border:1px solid var(--hair);border-left:3px solid var(--sun);border-radius:2px;display:grid;gap:12px}
.voice{margin:0;font-family:var(--f-voice);font-style:italic;font-weight:420;font-size:clamp(19px,2.6vw,23px);line-height:1.45}
.cta-row{display:flex;flex-wrap:wrap;align-items:center;gap:12px 20px;margin:40px 0 0}
.cta{display:inline-flex;align-items:center;gap:10px;height:48px;padding:0 22px;border-radius:2px;background:var(--ink);color:var(--panel);font-weight:650;font-size:15px;text-decoration:none}
.cta:hover{background:color-mix(in oklab,var(--ink) 86%,var(--sun))}
.cta-row p{margin:0;color:var(--ink-2);font-size:14px;max-width:30rem}
.fine{margin:40px 0 0;color:var(--ink-3);font-size:12.5px}
@media (max-width:640px){.lives{grid-template-columns:1fr}.who{gap:14px}.arch{width:64px;height:80px;border-radius:32px 32px 2px 2px}.five{padding:18px}main{padding-top:16px}}
`;

const ARROW = `<svg width="15" height="15" viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="m221.66 133.66l-72 72a8 8 0 0 1-11.32-11.32L196.69 136H40a8 8 0 0 1 0-16h156.69l-58.35-58.34a8 8 0 0 1 11.32-11.32l72 72a8 8 0 0 1 0 11.32"/></svg>`;

function head(title: string, desc: string, url: string, image: string | null, alt: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><meta name="robots" content="noindex">
<meta property="og:type" content="website"><meta property="og:site_name" content="Every Life You Have Left">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">
${image ? `<meta property="og:image" content="${esc(image)}"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1500"><meta property="og:image:height" content="1000"><meta property="og:image:alt" content="${esc(alt)}">` : ""}
<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}">${image ? `<meta name="twitter:image" content="${esc(image)}">` : ""}
<meta name="theme-color" content="#F4F7F8" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#0A1215" media="(prefers-color-scheme: dark)">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${FONTS}">
<style>${STYLE}</style></head>`;
}

function sharePage(card: ShareCardV2, o: { id: string; origin: string; image: boolean }): string {
  const name = card.firstName || "Someone";
  const possessive = card.firstName ? `${card.firstName}'s` : "A";
  const url = `${o.origin}/s/${o.id}`;
  const image = o.image ? `${o.origin}/s/${o.id}/postcard.png` : null;
  const others = card.lives.filter((l) => !l.you).map((l) => l.title);
  const title = `${possessive} postcard from ${card.endAge}`;
  const desc =
    `${name} at ${card.endAge}${card.place ? `, in ${card.place}` : ""}.` +
    (others.length ? ` The lives ${name} didn't choose: ${others.join(", ")}.` : "") +
    " Every Life You Have Left plays out the lives you could still live.";
  const hero = o.image
    ? `<img class="card" src="/s/${esc(o.id)}/postcard.png" width="1500" height="1000" alt="${esc(`${title}, from ${card.place}`)}">`
    : `<div class="sky" role="img" aria-label="${esc(`Greetings from ${card.endAge}, ${card.place}`)}"><span class="sun"></span><p class="greet">Greetings from</p><p class="age">${card.endAge}</p><p class="place">${esc(card.place)}</p></div>`;
  const lives = card.lives
    .map(
      (l) =>
        `<li data-you="${l.you}"><span class="num">${esc(l.you ? "CHOSEN" : l.numeral)}</span><h2>${esc(l.title)}</h2>${l.verdict ? `<p class="verdict">${esc(l.verdict)}</p>` : ""}</li>`,
    )
    .join("");
  return `${head(title, desc, url, image, `${title}, from ${card.place}`)}<body>
<header class="bar"><a class="wm" href="/">Every Life You Have Left</a><a class="go" href="/">Live yours</a></header>
<main>
${hero}
<div class="who${card.portraitKey ? "" : " solo"}">${card.portraitKey ? `<div class="arch"><img src="/s/${esc(o.id)}/portrait" alt="${esc(`${name}, illustrated`)}" width="88" height="108"></div>` : ""}<h1>${esc(name)}, at ${card.endAge}.</h1></div>
<p class="lede">These are the lives ${esc(name)} has left, played out to ${card.endYear}. Side by side, not ranked. None of them is the right one.</p>
<ol class="lives" aria-label="Four lives">${lives}</ol>
${card.fiveYear ? `<section class="five"><p class="label">“Where do you see yourself in five years?”</p><p class="voice">${esc(card.fiveYear)}</p></section>` : ""}
<div class="cta-row"><a class="cta" href="/">Live yours ${ARROW}</a><p>Tell it who you are. It plays out four lives you could still live, and shows you why each one turned.</p></div>
<p class="fine">A projection, not a prediction. Shared by ${esc(name)}; their answers stay private.</p>
</main></body></html>`;
}

function notFoundPage(origin: string): string {
  return `${head("A postcard from the future", "Every Life You Have Left plays out four lives you could still live.", origin, null, "")}<body>
<header class="bar"><a class="wm" href="/">Every Life You Have Left</a></header>
<main><h1>This postcard is gone.</h1><p class="lede">The link may be mistyped, or it was taken down.</p>
<div class="cta-row"><a class="cta" href="/">Live yours ${ARROW}</a></div></main></body></html>`;
}
