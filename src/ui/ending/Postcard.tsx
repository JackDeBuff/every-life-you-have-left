/**
 * The postcard from 70 (D-031): composed on a canvas so it downloads as a PNG.
 * Left: the long day ending (sun at the horizon, your line and the threads). Right: the message,
 * a rose for a stamp, and a postmark.
 */
import { useEffect, useRef, useState } from "react";
import { DOMAINS, FAMILIES, type DomainKey } from "../../../shared/domains";
import type { DomainStates } from "../../../shared/schema";
import { Icon } from "../icons";
import { sunAt } from "../motion";

interface Props {
  name: string;
  endAge: number;
  endYear: number;
  place: string;
  verdict: string;
  message: string;
  quote: string | null;
  states: DomainStates | null;
  from: { age: number; city: string; year: number };
}

const W = 1500;
const H = 1000;

function css(v: string, el: Element = document.documentElement) {
  return getComputedStyle(el).getPropertyValue(v).trim() || "#000";
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines = 99): number {
  const words = text.split(/\s+/);
  let line = "";
  let lines = 0;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      y += lh;
      line = w;
      if (++lines >= maxLines - 1) {
        ctx.fillText(`${line}…`, x, y);
        return y + lh;
      }
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y);
  return y + lh;
}

export function Postcard(p: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void document.fonts.ready.then(() => {
      if (!alive || !ref.current) return;
      draw(ref.current, p);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [p]);

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
        <span className="small faint">PNG, 1500 × 1000. Nothing private on it unless you shared it here.</span>
      </div>
    </div>
  );
}

function draw(c: HTMLCanvasElement, p: Props) {
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

  // message
  ctx.fillStyle = ink;
  ctx.font = `italic 420 34px ${serif}`;
  let y = 340;
  y = wrap(ctx, `Dear ${p.name},`, X, y, 360, 46);
  y += 8;
  ctx.font = `italic 420 28px ${serif}`;
  y = wrap(ctx, p.message, X, y, 360, 40, 9);
  if (p.quote) {
    y += 10;
    ctx.fillStyle = ink2;
    ctx.font = `500 21px ${sans}`;
    y = wrap(ctx, `You once said “${p.quote}”`, X, y, 360, 30, 3);
  }
  ctx.fillStyle = ink;
  ctx.font = `italic 420 28px ${serif}`;
  ctx.fillText(`— ${p.name}, at ${p.endAge}`, X, Math.min(H - 70, y + 34));

  // address
  ctx.fillStyle = ink2;
  ctx.font = `600 16px ${sans}`;
  ctx.fillText("TO", X + 440, 420);
  ctx.fillStyle = ink;
  ctx.font = `560 30px ${sans}`;
  const lines = [p.name, `aged ${p.from.age}`, p.from.city, `${p.from.year}`];
  lines.forEach((l, i) => {
    ctx.fillText(l, X + 440, 470 + i * 64);
    ctx.strokeStyle = "rgba(20,32,42,0.25)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(X + 440, 484 + i * 64);
    ctx.lineTo(W - 70, 484 + i * 64);
    ctx.stroke();
  });
  ctx.fillStyle = ink2;
  ctx.font = `500 15px ${sans}`;
  ctx.fillText("A projection, not a prediction · Every Life You Have Left", X + 440, H - 60);
  // verdict as a caption under the picture
  ctx.fillStyle = "rgba(247,245,240,0.9)";
  ctx.font = `600 28px ${sans}`;
  wrap(ctx, p.verdict, 56, 880, LW - 110, 38, 3);
}
