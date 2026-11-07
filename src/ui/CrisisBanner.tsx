/** Calm crisis resources when the safety screen flags a message (CLAUDE.md "Safety"). */
import { Icon } from "./icons";
import { sim, useSim } from "./session";

export function CrisisBanner() {
  const safety = useSim((s) => s.safety);
  if (!safety?.flagged) return null;
  const abuse = safety.kind === "abuse";
  return (
    <aside className="crisis" role="alert" aria-live="assertive">
      <Icon name="info" size={18} className="icon" />
      <div>
        <p>
          <b>You don't have to carry this alone.</b>{" "}
          {abuse
            ? "If someone is hurting you, the National Domestic Violence Hotline is free and confidential, any time: call 1-800-799-7233 or text START to 88788."
            : "If you're thinking about hurting yourself, you can call or text 988 to reach the Suicide & Crisis Lifeline, any time, free and confidential."}{" "}
          Outside the US, <a href="https://findahelpline.com" target="_blank" rel="noreferrer">findahelpline.com</a> lists local lines.
        </p>
        <div className="actions">
          <a className="btn sm" href={abuse ? "tel:18007997233" : "tel:988"}>
            <Icon name="phone" size={13} /> {abuse ? "Call the hotline" : "Call 988"}
          </a>
          {!abuse && (
            <a className="btn ghost sm" href="sms:988">
              Text 988
            </a>
          )}
          <a className="btn ghost sm" href={abuse ? "https://www.thehotline.org" : "https://988lifeline.org"} target="_blank" rel="noreferrer">
            {abuse ? "thehotline.org" : "988lifeline.org"}
          </a>
        </div>
      </div>
      <button className="btn quiet sm" onClick={() => sim().dismissSafety()} aria-label="Dismiss">
        <Icon name="x" size={14} />
      </button>
    </aside>
  );
}
