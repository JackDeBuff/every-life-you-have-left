/**
 * Share link + QR for the postcard (D-031, opt-in). The browser asks the Worker for a link
 * (POST /api/share, only what's on the postcard), then attaches the postcard PNG for the page and
 * its preview. The link is remembered per session so a reload keeps the same QR.
 */
import qrcode from "qrcode-generator";
import type { ShareCreated, ShareInput } from "../../../worker/share-card";

export type { ShareInput };

export interface SavedShare {
  id: string;
  url: string;
}

const KEY = (sessionId: string) => `elyl.share.${sessionId}`;

export function savedShare(sessionId: string): SavedShare | null {
  try {
    const raw = localStorage.getItem(KEY(sessionId));
    const v = raw ? (JSON.parse(raw) as SavedShare) : null;
    return v?.id && v.url ? v : null;
  } catch {
    return null;
  }
}

export async function createShare(input: ShareInput): Promise<ShareCreated> {
  const res = await fetch("/api/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  const body = (await res.json().catch(() => null)) as (ShareCreated & { error?: string }) | null;
  if (!res.ok || !body?.ok) throw new Error(body?.error ?? `share ${res.status}`);
  if (input.sessionId) {
    try {
      localStorage.setItem(KEY(input.sessionId), JSON.stringify({ id: body.id, url: body.url } satisfies SavedShare));
    } catch {
      /* private mode: the link still works, it just won't survive a reload */
    }
  }
  return body;
}

export async function attachPostcard(id: string, token: string, png: Blob): Promise<void> {
  const res = await fetch(`/api/share/${encodeURIComponent(id)}/postcard`, { method: "PUT", headers: { "content-type": "image/png", "x-share-token": token }, body: png });
  if (!res.ok) throw new Error(`attach ${res.status}`);
}

/** The QR as a module grid (error correction M: survives a glare spot on a laptop screen). */
export function qrModules(text: string): boolean[][] {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/** One SVG path for all dark modules (unit = one module). */
export function qrPath(m: boolean[][]): string {
  let d = "";
  m.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (!row[c]) {
        c++;
        continue;
      }
      let w = 1;
      while (row[c + w]) w++;
      d += `M${c} ${r}h${w}v1h-${w}z`;
      c += w;
    }
  });
  return d;
}

/** Draw the QR into a canvas square (x, y, size), on its own light tile with a quiet zone. */
export function drawQr(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, ink: string, paper: string) {
  const m = qrModules(text);
  const n = m.length;
  const quiet = 3;
  const cell = Math.floor(size / (n + quiet * 2));
  const total = cell * (n + quiet * 2);
  ctx.save();
  ctx.fillStyle = paper;
  ctx.fillRect(x, y, total, total);
  ctx.fillStyle = ink;
  const o = quiet * cell;
  m.forEach((row, r) => row.forEach((on, c) => on && ctx.fillRect(x + o + c * cell, y + o + r * cell, cell, cell)));
  ctx.restore();
  return total;
}
