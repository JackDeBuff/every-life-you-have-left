/**
 * "Tell me more": CV / LinkedIn PDF (text via pdf.js; click or drop, with LinkedIn's own export
 * steps) and an AI-app export (copy the prompt, open ChatGPT or Claude, paste the answer back).
 * Plus the know-me dial that unlocks the twin chat at TWIN_THRESHOLD (D-026).
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

const LABEL: Record<DocKind, string> = { cv: "CV", linkedin: "LinkedIn", ai_export: "AI export" };

/** LinkedIn's own steps (help article "Save a profile as a PDF", checked Nov 2026): Me > your profile > More or Resources > Save to PDF. */
export const LINKEDIN_PROFILE_URL = "https://www.linkedin.com/in/me/";

function LinkedInSteps() {
  return (
    <div className="howto">
      <ol className="steps small">
        <li>
          <a href={LINKEDIN_PROFILE_URL} target="_blank" rel="noopener noreferrer" className="ext">
            Open your LinkedIn profile <Icon name="arrowUpRight" size={12} />
          </a>
        </li>
        <li>
          Under your name, click <b>Resources</b> (or <b>More</b>), then <b>Save to PDF</b>.
        </li>
        <li>Drop that PDF on the LinkedIn box, or click the box to choose it.</li>
      </ol>
      <p className="faint small">On a computer, not the app. It exports best when your profile is in English.</p>
    </div>
  );
}

/** Copy text, with a fallback for browsers that block the async clipboard. */
async function copyText(t: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = t;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export function UploadSlots({ added, onAdd, dense = false }: { added: AddedDoc[]; onAdd: (kind: DocKind, text: string, name: string, file?: File) => void; dense?: boolean }) {
  const [busy, setBusy] = useState<DocKind | null>(null);
  const [drag, setDrag] = useState<DocKind | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const has = (k: DocKind) => added.find((d) => d.kind === k);

  async function onFile(kind: DocKind, f: File | undefined) {
    if (!f) return;
    setErr(null);
    setBusy(kind);
    try {
      const text = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf") ? await pdfText(f) : await f.text();
      if (text.trim().length < 40) throw new Error("That file has almost no text in it. A scanned PDF? Try exporting it again as text.");
      onAdd(kind, text, f.name, f);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't read that file.");
    } finally {
      setBusy(null);
    }
  }

  /** A file slot you can click or drop a PDF on. */
  const slot = (k: "cv" | "linkedin", label = LABEL[k]) => (
    <label
      key={k}
      className="upload"
      data-done={!!has(k)}
      data-busy={busy === k}
      data-drag={drag === k}
      onDragOver={(e) => {
        e.preventDefault();
        if (drag !== k) setDrag(k);
      }}
      onDragLeave={() => setDrag(null)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(null);
        void onFile(k, e.dataTransfer.files?.[0]);
      }}
    >
      <input type="file" accept=".pdf,application/pdf,.txt" className="sr-only" onChange={(e) => void onFile(k, e.target.files?.[0])} />
      <Icon name={has(k) ? "check" : "file"} size={15} />
      <span className="upload-name" title={has(k)?.name}>{has(k) ? (dense ? `${LABEL[k]} added` : has(k)!.name) : label}</span>
      <span className="upload-act faint">{busy === k ? "Reading…" : has(k) ? `${Math.round(has(k)!.chars / 100) / 10}k chars` : drag === k ? "Drop it" : "PDF"}</span>
    </label>
  );

  return (
    <div className={`uploads ${dense ? "dense" : ""}`}>
      {slot("cv")}
      {dense ? (
        <Popover.Root>
          <Popover.Trigger asChild>
            <button type="button" className="upload" data-done={!!has("linkedin")}>
              <Icon name={has("linkedin") ? "check" : "file"} size={15} />
              <span className="upload-name">{has("linkedin") ? "LinkedIn added" : "LinkedIn"}</span>
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content className="pop ai-pop" side="right" align="start" sideOffset={10} collisionPadding={12}>
              <p className="label">Your LinkedIn, as a PDF</p>
              <LinkedInSteps />
              <div className="uploads">{slot("linkedin", "Choose or drop the PDF")}</div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      ) : (
        <>
          {slot("linkedin", "LinkedIn profile PDF")}
          {!has("linkedin") && <LinkedInSteps />}
        </>
      )}
      <AiExport done={!!has("ai_export")} dense={dense} onAdd={(t) => onAdd("ai_export", t, "AI-app export")} />
      {err && <p className="upload-err small">{err}</p>}
    </div>
  );
}

function AiExport({ done, onAdd, dense }: { done: boolean; onAdd: (t: string) => void; dense: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (await copyText(AI_EXPORT_PROMPT)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" className="upload" data-done={done}>
          <Icon name={done ? "check" : "chat"} size={15} />
          <span className="upload-name">{done ? (dense ? "Added" : "AI-app export added") : dense ? "AI export" : "What your AI app knows about you"}</span>
          <span className="upload-act faint">Paste</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="pop ai-pop" side={dense ? "right" : "bottom"} align={dense ? "start" : "end"} sideOffset={10} collisionPadding={12} onFocusOutside={(e) => e.preventDefault()}>
          <p className="label">1 · Copy this prompt</p>
          <div className="prompt-box small" onClick={() => void copy()} title="Click to copy">
            {AI_EXPORT_PROMPT}
          </div>
          <div className="ai-row">
            <button type="button" className="btn sun sm" onClick={() => void copy()}>
              <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "Copied" : "Copy prompt"}
            </button>
            <a className="btn ghost sm" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">
              ChatGPT <Icon name="arrowUpRight" size={12} />
            </a>
            <a className="btn ghost sm" href="https://claude.ai/new" target="_blank" rel="noopener noreferrer">
              Claude <Icon name="arrowUpRight" size={12} />
            </a>
          </div>
          <p className="label" style={{ marginTop: 10 }}>2 · Paste its answer here</p>
          <textarea className="textarea" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste what your AI app wrote back…" />
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
        onAdd={(kind, text, name, file) => {
          setAdded((a) => [...a.filter((d) => d.kind !== kind), { kind, name, chars: text.length }]);
          void sim().addDocument(kind, text, file).catch(() => {});
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
