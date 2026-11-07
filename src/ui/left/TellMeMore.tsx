/**
 * "Tell me more": CV / LinkedIn PDF (text via pdf.js) and an AI-app export (paste, with a prompt
 * to copy). Plus the know-me dial that unlocks the twin chat at TWIN_THRESHOLD (D-026).
 */
import * as Popover from "@radix-ui/react-popover";
import { useState } from "react";
import { TWIN_THRESHOLD } from "../../../shared/schema";
import { Icon } from "../icons";
import { AI_EXPORT_PROMPT, pdfText } from "../pdf";
import { sim, useSim } from "../session";

export type DocKind = "cv" | "linkedin" | "ai_export";
export interface AddedDoc {
  kind: DocKind;
  name: string;
  chars: number;
}

const LABEL: Record<DocKind, string> = { cv: "CV", linkedin: "LinkedIn PDF", ai_export: "AI-app export" };

export function UploadSlots({ added, onAdd, dense = false }: { added: AddedDoc[]; onAdd: (kind: DocKind, text: string, name: string) => void; dense?: boolean }) {
  const [busy, setBusy] = useState<DocKind | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const has = (k: DocKind) => added.find((d) => d.kind === k);

  async function onFile(kind: DocKind, f: File | undefined) {
    if (!f) return;
    setErr(null);
    setBusy(kind);
    try {
      const text = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf") ? await pdfText(f) : await f.text();
      if (text.trim().length < 40) throw new Error("That file has almost no text in it. A scanned PDF? Try exporting it again as text.");
      onAdd(kind, text, f.name);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't read that file.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`uploads ${dense ? "dense" : ""}`}>
      {(["cv", "linkedin"] as const).map((k) => (
        <label key={k} className="upload" data-done={!!has(k)} data-busy={busy === k}>
          <input type="file" accept=".pdf,application/pdf,.txt" className="sr-only" onChange={(e) => void onFile(k, e.target.files?.[0])} />
          <Icon name={has(k) ? "check" : "file"} size={15} />
          <span className="upload-name">{has(k) ? has(k)!.name : LABEL[k]}</span>
          <span className="upload-act faint">{busy === k ? "Reading…" : has(k) ? `${Math.round(has(k)!.chars / 100) / 10}k chars` : "PDF"}</span>
        </label>
      ))}
      <AiExport done={!!has("ai_export")} onAdd={(t) => onAdd("ai_export", t, "AI-app export")} />
      {err && <p className="upload-err small">{err}</p>}
    </div>
  );
}

function AiExport({ done, onAdd }: { done: boolean; onAdd: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" className="upload" data-done={done}>
          <Icon name={done ? "check" : "chat"} size={15} />
          <span className="upload-name">{done ? "AI-app export added" : "AI-app export"}</span>
          <span className="upload-act faint">Paste</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="pop ai-pop" side="right" align="start" sideOffset={10} collisionPadding={12}>
          <p className="label">Step 1 · copy this into your AI app</p>
          <div className="prompt-box small">{AI_EXPORT_PROMPT}</div>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              void navigator.clipboard?.writeText(AI_EXPORT_PROMPT);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }}
          >
            <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "Copied" : "Copy the prompt"}
          </button>
          <p className="label" style={{ marginTop: 14 }}>Step 2 · paste what it says</p>
          <textarea className="textarea" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the summary here…" />
          <div className="row-end">
            <button type="button" className="btn sm" disabled={text.trim().length < 40} onClick={() => (onAdd(text.trim()), setOpen(false), setText(""))}>
              Add it
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Left-pane block. */
export function TellMeMore() {
  const score = useSim((s) => s.profile?.knowMeScore ?? 0);
  const [added, setAdded] = useState<AddedDoc[]>([]);
  return (
    <section className="tmm" aria-label="Tell me more">
      <div className="tmm-head">
        <KnowMeDial score={score} />
        <div>
          <h3 className="label">Tell me more</h3>
          <p className="small muted">
            {score >= TWIN_THRESHOLD ? "I know you well enough to write like you." : `I know you ${score}%. At ${TWIN_THRESHOLD}, future-you can talk back in your voice.`}
          </p>
        </div>
      </div>
      <UploadSlots
        dense
        added={added}
        onAdd={(kind, text, name) => {
          setAdded((a) => [...a.filter((d) => d.kind !== kind), { kind, name, chars: text.length }]);
          void sim().addDocument(kind, text);
        }}
      />
    </section>
  );
}

/** A small dial (not a bar): the arc fills toward the twin threshold tick. */
export function KnowMeDial({ score, size = 44 }: { score: number; size?: number }) {
  const r = 17;
  const C = 2 * Math.PI * r;
  const sweep = 0.75;
  const v = Math.max(0, Math.min(100, score)) / 100;
  const tA = -225 + 270 * (TWIN_THRESHOLD / 100);
  const tx = 22 + Math.cos((tA * Math.PI) / 180) * 21.5;
  const ty = 22 + Math.sin((tA * Math.PI) / 180) * 21.5;
  return (
    <svg className="dial" width={size} height={size} viewBox="0 0 44 44" role="img" aria-label={`How well I know you: ${score} of 100`}>
      <circle cx="22" cy="22" r={r} fill="none" stroke="var(--hair-2)" strokeWidth="3" strokeDasharray={`${C * sweep} ${C}`} transform="rotate(135 22 22)" strokeLinecap="round" />
      <circle className="dial-v" cx="22" cy="22" r={r} fill="none" stroke={score >= TWIN_THRESHOLD ? "var(--sun)" : "var(--ink)"} strokeWidth="3" strokeDasharray={`${C * sweep * v} ${C}`} transform="rotate(135 22 22)" strokeLinecap="round" />
      <circle cx={tx} cy={ty} r="1.6" fill="var(--sun)" />
      <text x="22" y="26" textAnchor="middle" className="dial-num">{score}</text>
    </svg>
  );
}
