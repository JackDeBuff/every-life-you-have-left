/**
 * Privacy UI (D-101): the notice dialog (read it, or read it and agree before the first year),
 * and "Delete my data" (DELETE /api/session/:id). No session import here: /privacy uses these
 * without opening a game session (the in-game delete is ./mine.tsx).
 * Styles: src/styles/privacy.css.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Privacy } from "../../../shared/sim";
import { Icon } from "../icons";
import { PrivacyText } from "./PrivacyText";
import "../../styles/privacy.css";

/** Erase everything for this session id on the server. Throws when the server didn't confirm. */
export async function deleteSessionData(sessionId: string): Promise<void> {
  const r = await fetch(`/api/session/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`delete failed ${r.status}`);
}

/** A modal on the native <dialog> (focus trap, Esc, inert page behind it). */
export function Modal({ open, onClose, label, children, className }: { open: boolean; onClose: () => void; label: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`pv-modal ${className ?? ""}`}
      aria-label={label}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // a click on the backdrop
      }}
    >
      {open && children}
    </dialog>
  );
}

/** What the person chose, in one line each (the confirm step). */
function Choices({ p }: { p: Privacy }) {
  return (
    <ul className="pv-choices">
      <li>
        <Icon name={p.save ? "lock" : "eyeSlash"} size={16} />
        {p.save ? (
          <span>
            <b>Saved for 30 days,</b> then deleted automatically. Uploads and selfies: encrypted, deleted after 7 days.
          </span>
        ) : (
          <span>
            <b>Incognito.</b> Nothing goes into our database; the session erases itself 24 hours after it starts.
          </span>
        )}
      </li>
      {p.save && (
        <li>
          <Icon name={p.improve ? "check" : "x"} size={16} />
          <span>{p.improve ? "The two of us may read it to fix and improve the app." : "Hidden from the team: our admin page won't show it."}</span>
        </li>
      )}
      <li>
        <Icon name="trash" size={16} />
        <span>You can delete it all, at any time, with Delete my data.</span>
      </li>
    </ul>
  );
}

/**
 * The privacy notice. mode "read": just the text. mode "confirm": the person's choices on top,
 * the full text, and "Agree and start" (Start.tsx opens it when they press Start).
 */
export function PrivacyDialog({ open, onClose, mode, privacy, onAgree }: { open: boolean; onClose: () => void; mode: "read" | "confirm"; privacy?: Privacy; onAgree?: () => void }) {
  return (
    <Modal open={open} onClose={onClose} label="Privacy and terms">
      <header className="pv-head">
        <div>
          <span className="label">Before you start</span>
          <h2>How we handle your life</h2>
        </div>
        <button type="button" className="btn ghost sm pv-x" onClick={onClose} aria-label="Close">
          <Icon name="x" size={16} />
        </button>
      </header>
      <div className="pv-body scroll">
        {mode === "confirm" && privacy && (
          <section className="pv-summary">
            <p className="small">You chose:</p>
            <Choices p={privacy} />
          </section>
        )}
        <PrivacyText />
      </div>
      <footer className="pv-foot">
        {mode === "confirm" ? (
          <>
            <button type="button" className="btn ghost" onClick={onClose}>
              Back
            </button>
            <button type="button" className="btn sun" onClick={onAgree} autoFocus>
              I've read this. Agree and start <Icon name="arrowRight" size={16} />
            </button>
          </>
        ) : (
          <button type="button" className="btn" onClick={onClose} autoFocus>
            Close
          </button>
        )}
      </footer>
    </Modal>
  );
}

/** "Delete my data", with a confirm step. onDeleted runs after the server confirmed. */
export function DeleteData({ run, after, small = true, label = "Delete my data" }: { run: () => Promise<void>; after: () => void; small?: boolean; label?: string }) {
  const [step, setStep] = useState<"idle" | "ask" | "busy" | "done" | "error">("idle");
  return (
    <>
      <button type="button" className={`btn ghost ${small ? "sm" : ""} pv-del`} onClick={() => setStep("ask")}>
        <Icon name="trash" size={14} /> {label}
      </button>
      <Modal
        open={step !== "idle"}
        onClose={() => {
          if (step === "busy") return;
          if (step === "done") after();
          setStep("idle");
        }}
        label="Delete my data"
        className="pv-small"
      >
        <div className="pv-confirm">
          {step === "done" ? (
            <>
              <h2>Deleted.</h2>
              <p>Everything we held for that life is gone: its answers, files, portraits, voice clips, postcards and the live session.</p>
              <div className="pv-row">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setStep("idle");
                    after();
                  }}
                  autoFocus
                >
                  OK
                </button>
              </div>
            </>
          ) : (
            <>
              <h2>Delete this life and everything about it?</h2>
              <p>
                Your answers, uploads, selfie, portraits, voice clips, shared postcards and the life itself are erased from our servers now. This
                can't be undone.
              </p>
              {step === "error" && (
                <p className="pv-err small" role="alert">
                  The server didn't confirm the deletion. Check your connection and try again.
                </p>
              )}
              <div className="pv-row">
                <button type="button" className="btn ghost" onClick={() => setStep("idle")} disabled={step === "busy"} autoFocus>
                  Keep it
                </button>
                <button
                  type="button"
                  className="btn danger"
                  disabled={step === "busy"}
                  onClick={async () => {
                    setStep("busy");
                    try {
                      await run();
                      setStep("done");
                    } catch {
                      setStep("error");
                    }
                  }}
                >
                  <Icon name="trash" size={14} /> {step === "busy" ? "Deleting…" : "Delete everything"}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
