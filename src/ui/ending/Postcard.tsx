/**
 * The postcard from 70 (D-031): composed on a canvas so it downloads as a PNG.
 * Left: the long day ending (sun at the horizon, your line and the threads). Right: the message,
 * a rose for a stamp, and a postmark. Once shared (opt-in), a QR code to the share link sits in the
 * address column, on the PNG and beside it on screen, so the person can scan it and take it home.
 */
import { useEffect, useRef, useState } from "react";
import { DOMAINS, FAMILIES, type DomainKey } from "../../../shared/domains";
import type { DomainStates } from "../../../shared/schema";
import { Icon } from "../icons";
import { sunAt } from "../motion";
import { attachPostcard, createShare, drawQr, qrModules, qrPath, savedShare, type SavedShare, type ShareInput } from "./share";

interface DrawOpts {
  /** Share URL to encode as a QR code in the address column. */
  qr: string | null;
  /** Public copy for the share page: no quote (their own words), no age or city of today. The download keeps them. */
  forShare: boolean;
}

interface Props {
  name: string;
  endAge: number;
  endYear: number;
  place: string;
  verdict: string;
  /** Line under the picture; defaults to the verdict (pass the path when the letter quotes the verdict). */
  caption?: string;
  message: string;
  quote: string | null;
  states: DomainStates | null;
  from: { age: number; city: string; year: number };
  /** Opt-in share (D-031): builds exactly what the shared page shows. Omit to hide sharing. */
  share?: { sessionId: string; build: () => ShareInput; hasPortrait: boolean };
}

type ShareState = { kind: "idle" } | { kind: "asking" } | { kind: "making" } | { kind: "shared"; link: SavedShare } | { kind: "error" };

const W = 1500;
const H = 1000;

function css(v: string, el: Element = document.documentElement) {
  return getComputedStyle(el).getPropertyValue(v).trim() || "#000";
}

/** Word-wrap `text` to `maxW` in the current font. */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      out.push(line);
      line = w;
    } else line = test;
  }
  if (line) out.push(line);
  return out;
}

/** Last resort only (absurdly long text at the smallest size): end on a word, one clean ellipsis. */
function clampLines(ls: string[], max: number): string[] {
  if (ls.length <= max) return ls;
  const kept = ls.slice(0, max);
  kept[max - 1] = `${kept[max - 1]!.replace(/[\s.,;:!?…]+$/, "")}…`;
  return kept;
}

function drawLines(ctx: CanvasRenderingContext2D, ls: string[], x: number, y: number, lh: number): number {
  ls.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
  return y + ls.length * lh;
}

export function Postcard(p: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const sid = p.share?.sessionId ?? "";
  const [sh, setSh] = useState<ShareState>(() => {
    const saved = sid ? savedShare(sid) : null;
    return saved ? { kind: "shared", link: saved } : { kind: "idle" };
  });
  const link = sh.kind === "shared" ? sh.link : null;

  useEffect(() => {
    let alive = true;
    void document.fonts.ready.then(() => {
      if (!alive || !ref.current) return;
      draw(ref.current, p, { qr: link?.url ?? null, forShare: false });
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [p, link?.url]);

  const makeLink = async () => {
    if (!p.share) return;
    setSh({ kind: "making" });
    try {
      const made = await createShare(p.share.build());
      setSh({ kind: "shared", link: { id: made.id, url: made.url } });
      // The page's picture and link preview: the same card with its QR, without the quote.
      const off = document.createElement("canvas");
      off.width = W;
      off.height = H;
      draw(off, p, { qr: made.url, forShare: true });
      off.toBlob((b) => {
        if (b) void attachPostcard(made.id, made.token, b).catch(() => {});
      }, "image/png");
    } catch {
      setSh({ kind: "error" });
    }
  };

  const download = () => {
    ref.current?.toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = `postcard-from-${p.endAge}-${p.name.toLowerCase() || "you"}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, "image/png");
  };

  return (
    <div className="postcard">
      <canvas ref={ref} width={W} height={H} className="postcard-canvas" data-ready={ready} aria-label={`A postcard from you at ${p.endAge}: ${p.message}`} />
      <div className="postcard-actions">
        <button className="btn" onClick={download} disabled={!ready}>
          <Icon name="download" size={15} /> Download the postcard
        </button>
        {p.share && !link && (
          <button className="btn ghost" onClick={() => setSh({ kind: "asking" })} disabled={!ready || sh.kind === "making"} aria-expanded={sh.kind !== "idle"}>
            <Icon name="share" size={15} /> Share this postcard
          </button>
        )}
        <span className="small faint">PNG, 1500 × 1000.{link ? " Its QR code opens your shared postcard." : " Nothing private on it unless you shared it here."}</span>
      </div>
      {p.share && (sh.kind === "asking" || sh.kind === "making" || sh.kind === "error") && (
        <div className="share-consent" role="group" aria-label="Share this postcard">
          <p className="share-c-title">Make a link to this postcard?</p>
          <p className="small muted">
            Anyone with the link can see this postcard; your answers stay private. The page shows your first name, the four lives and their verdicts at {p.endAge}
            , and your five-year answer{p.share.hasPortrait ? ", with your portrait" : ""}. Nothing else you typed, said or uploaded.
          </p>
          <div className="share-c-actions">
            <button className="btn sun" onClick={() => void makeLink()} disabled={sh.kind === "making"}>
              <Icon name="link" size={15} /> {sh.kind === "making" ? "Making the link…" : "Make the link"}
            </button>
            <button className="btn quiet" onClick={() => setSh({ kind: "idle" })} disabled={sh.kind === "making"}>
              Not now
            </button>
            {sh.kind === "error" && <span className="small share-err">Couldn't make the link. Check the connection and try again.</span>}
          </div>
        </div>
      )}
      {link && <SharedLink link={link} />}
    </div>
  );
}

/** After sharing: a QR big enough to scan from across the table, the link, copy and open. */
function SharedLink({ link }: { link: SavedShare }) {
  const [copied, setCopied] = useState(false);
  const m = qrModules(link.url);
  const n = m.length;
  const short = link.url.replace(/^https?:\/\//, "");
  return (
    <div className="share-done">
      <svg className="share-qr" viewBox={`-3 -3 ${n + 6} ${n + 6}`} role="img" aria-label={`QR code for ${short}`} shapeRendering="crispEdges">
        <rect x={-3} y={-3} width={n + 6} height={n + 6} fill="#FFFFFF" />
        <path d={qrPath(m)} fill="#0D1A1F" />
      </svg>
      <div className="share-done-text">
        <p className="label">Scan to take this life home</p>
        <p className="share-url data">{short}</p>
        <div className="share-c-actions">
          <button
            className="btn ghost sm"
            onClick={() => {
              void navigator.clipboard?.writeText(link.url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "Copied" : "Copy the link"}
          </button>
          <a className="btn ghost sm" href={link.url} target="_blank" rel="noreferrer">
            Open <Icon name="arrowUpRight" size={13} />
          </a>
        </div>
        <p className="small faint">Anyone with the link can see this postcard; your answers stay private.</p>
      </div>
    </div>
  );
}

function draw(c: HTMLCanvasElement, p: Props, o: DrawOpts) {
  const ctx = c.getContext("2d")!;
  const paper = "#F3F5F6";
  const ink = "#14202A";
  const ink2 = "#4B5963";
  const sun = sunAt(1);
  const fam: Record<string, string> = { work: "#2F6BD8", people: "#D2405E", inner: "#7B55D6", direction: "#23935A" };
  const sans = css("--f-sans");
  const serif = css("--f-voice");

  // card
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);

  // ---- left: the long day, ending ----
  const LW = 700;
  const sky = ctx.createLinearGradient(0, 0, 0, 640);
  sky.addColorStop(0, "#22344A");
  sky.addColorStop(0.55, "#C9775E");
  sky.addColorStop(1, "#F2B27A");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, LW, 640);
  // sun at the horizon
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, LW, 640);
  ctx.clip();
  ctx.fillStyle = sun;
  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  ctx.arc(520, 640, 150, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(520, 640, 78, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // ground / water
  const sea = ctx.createLinearGradient(0, 640, 0, H);
  sea.addColorStop(0, "#1C2B3A");
  sea.addColorStop(1, "#0F1A24");
  ctx.fillStyle = sea;
  ctx.fillRect(0, 640, LW, H - 640);
  // your line (the horizon) and three threads like reflections
  ctx.strokeStyle = "#F7F5F0";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(40, 640);
  ctx.lineTo(LW - 40, 640);
  ctx.stroke();
  const dashes = [[18, 9], [5, 9], [28, 9, 5, 9]];
  [0, 1, 2].forEach((k) => {
    ctx.setLineDash(dashes[k]!);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(247,245,240,0.55)";
    const fx = 120 + k * 120;
    ctx.beginPath();
    ctx.moveTo(fx, 640);
    ctx.bezierCurveTo(fx + 60, 645, fx + 120, 690 + k * 48, LW - 40, 690 + k * 48);
    ctx.stroke();
  });
  ctx.setLineDash([]);
  // fork diamonds
  [0, 1, 2].forEach((k) => {
    const fx = 120 + k * 120;
    ctx.save();
    ctx.translate(fx, 640);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = sun;
    ctx.strokeStyle = "#F7F5F0";
    ctx.lineWidth = 2;
    ctx.fillRect(-9, -9, 18, 18);
    ctx.strokeRect(-9, -9, 18, 18);
    ctx.restore();
  });
  // big type on the picture
  ctx.fillStyle = "#F7F5F0";
  ctx.font = `720 30px ${sans}`;
  ctx.fillText("GREETINGS FROM", 56, 96);
  ctx.font = `760 150px ${sans}`;
  (ctx as unknown as { fontStretch: string }).fontStretch = "expanded";
  ctx.fillText(`${p.endAge}`, 50, 240);
  (ctx as unknown as { fontStretch: string }).fontStretch = "normal";
  ctx.font = `560 26px ${sans}`;
  ctx.fillStyle = "rgba(247,245,240,0.82)";
  ctx.fillText(p.place, 58, 290);

  // ---- right: message ----
  const X = LW + 70;
  // divider
  ctx.strokeStyle = "rgba(20,32,42,0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(X + 400, 300);
  ctx.lineTo(X + 400, H - 90);
  ctx.stroke();

  // stamp: the rose
  const sx = W - 170;
  const sy = 150;
  ctx.strokeStyle = "rgba(20,32,42,0.35)";
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(sx - 82, sy - 92, 164, 184);
  ctx.setLineDash([]);
  if (p.states) {
    const R = 66;
    const r0 = 8;
    let a = -90 + 4;
    for (const f of FAMILIES) {
      for (const d of f.domains as readonly DomainKey[]) {
        const v = p.states[d];
        const r = r0 + (R - r0) * Math.sqrt(v / 100);
        const a0 = ((a + 0.7) * Math.PI) / 180;
        const a1 = ((a + 32.8 - 0.7) * Math.PI) / 180;
        ctx.beginPath();
        ctx.arc(sx, sy, r, a0, a1);
        ctx.arc(sx, sy, r0, a1, a0, true);
        ctx.closePath();
        if (d === "risk") {
          ctx.strokeStyle = fam[DOMAINS[d].family]!;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else {
          ctx.fillStyle = fam[DOMAINS[d].family]!;
          ctx.fill();
        }
        a += 32.8;
      }
      a += 8;
    }
  }
  // postmark
  ctx.save();
  ctx.translate(W - 380, 170);
  ctx.rotate(-0.18);
  ctx.strokeStyle = "rgba(20,32,42,0.55)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, 74, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 60, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(20,32,42,0.65)";
  ctx.font = `700 17px ${sans}`;
  ctx.textAlign = "center";
  ctx.fillText(`AGE ${p.endAge}`, 0, -6);
  ctx.font = `600 22px ${sans}`;
  ctx.fillText(`${p.endYear}`, 0, 22);
  ctx.textAlign = "left";
  [-1, 0, 1].forEach((k) => {
    ctx.beginPath();
    ctx.moveTo(84, k * 16);
    ctx.bezierCurveTo(120, k * 16 - 10, 150, k * 16 + 10, 200, k * 16);
    ctx.stroke();
  });
  ctx.restore();

  // message: the whole letter always fits. Step the size down until the letter, the quote and the
  // signature sit above the bottom margin; never cut a sentence off mid-way.
  const MW = 360;
  const DEAR = 340;
  const SIGN_MAX = H - 70;
  const quoteText = p.quote && !o.forShare ? `You once said “${p.quote}”` : null;
  let fit: { fs: number; lh: number; m: string[]; qs: number; qlh: number; q: string[] } | null = null;
  for (const fs of [28, 26, 24, 22, 20, 18]) {
    const lh = Math.round(fs * 1.43);
    ctx.font = `italic 420 ${fs}px ${serif}`;
    const m = wrapLines(ctx, p.message, MW);
    const qs = Math.max(16, Math.round(fs * 0.75));
    const qlh = Math.round(qs * 1.43);
    ctx.font = `500 ${qs}px ${sans}`;
    const q = quoteText ? wrapLines(ctx, quoteText, MW) : [];
    const sign = DEAR + 54 + m.length * lh + (q.length ? 10 + q.length * qlh : 0) + 34;
    fit = { fs, lh, m, qs, qlh, q };
    if (sign <= SIGN_MAX) break;
  }
  const f = fit!;
  // Still too long at the smallest size: the quote gives way first, then the letter ends on a word.
  const room = (SIGN_MAX - 34 - DEAR - 54) / f.lh;
  if (DEAR + 54 + f.m.length * f.lh + (f.q.length ? 10 + f.q.length * f.qlh : 0) + 34 > SIGN_MAX) {
    f.q = [];
    f.m = clampLines(f.m, Math.max(1, Math.floor(room)));
  }
  ctx.fillStyle = ink;
  ctx.font = `italic 420 34px ${serif}`;
  ctx.fillText(`Dear ${p.name},`, X, DEAR);
  ctx.font = `italic 420 ${f.fs}px ${serif}`;
  let y = drawLines(ctx, f.m, X, DEAR + 54, f.lh);
  if (f.q.length) {
    y += 10;
    ctx.fillStyle = ink2;
    ctx.font = `500 ${f.qs}px ${sans}`;
    y = drawLines(ctx, f.q, X, y, f.qlh);
  }
  ctx.fillStyle = ink;
  ctx.font = `italic 420 ${Math.min(28, f.fs + 2)}px ${serif}`;
  ctx.fillText(`— ${p.name}, at ${p.endAge}`, X, Math.min(SIGN_MAX, y + 34));

  // address
  ctx.fillStyle = ink2;
  ctx.font = `600 16px ${sans}`;
  ctx.fillText("TO", X + 440, 420);
  ctx.fillStyle = ink;
  ctx.font = `560 30px ${sans}`;
  const lines = o.forShare ? [p.name, `${p.from.year}`] : [p.name, `aged ${p.from.age}`, p.from.city, `${p.from.year}`];
  lines.forEach((l, i) => {
    ctx.fillText(l, X + 440, 470 + i * 64);
    ctx.strokeStyle = "rgba(20,32,42,0.25)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(X + 440, 484 + i * 64);
    ctx.lineTo(W - 70, 484 + i * 64);
    ctx.stroke();
  });
  // The share QR (once shared): under the address, above the small print.
  if (o.qr) {
    const size = drawQr(ctx, o.qr, X + 440, 706, 168, ink, "#FFFFFF");
    ctx.fillStyle = ink2;
    ctx.font = `650 13px ${sans}`;
    ctx.fillText("SCAN TO KEEP THIS POSTCARD", X + 440, 706 + size + 20);
  }
  // The small print wraps inside the address column (it used to run off the card's right edge).
  ctx.fillStyle = ink2;
  ctx.font = `500 15px ${sans}`;
  const fine = wrapLines(ctx, "A projection, not a prediction · Every Life You Have Left", W - 70 - (X + 440));
  drawLines(ctx, fine, X + 440, H - 60 - (fine.length - 1) * 21, 21);
  // caption under the picture (the path you took, or the verdict): bottom-anchored, below the
  // threads, stepping down a size rather than cutting off.
  const caption = (p.caption ?? p.verdict).trim();
  if (caption) {
    ctx.fillStyle = "rgba(247,245,240,0.9)";
    const CW = LW - 110;
    const LAST = H - 58;
    const TOP = 812;
    let cap: { fs: number; lh: number; ls: string[] } | null = null;
    for (const fs of [28, 25, 22, 20, 18]) {
      ctx.font = `600 ${fs}px ${sans}`;
      const lh = Math.round(fs * 1.36);
      const ls = wrapLines(ctx, caption, CW);
      cap = { fs, lh, ls };
      if (LAST - (ls.length - 1) * lh - fs >= TOP) break;
    }
    const c = cap!;
    const ls = clampLines(c.ls, Math.max(1, Math.floor((LAST - TOP + c.lh - c.fs) / c.lh)));
    ctx.font = `600 ${c.fs}px ${sans}`;
    drawLines(ctx, ls, 56, LAST - (ls.length - 1) * c.lh, c.lh);
  }
}
