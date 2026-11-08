/** Music on / off (src/ui/music.ts). Remembered per browser; always visible while music can play (WCAG 1.4.2). */
import { Icon } from "./icons";
import { setMuted, useMusic } from "./music";

export function MusicToggle({ variant = "key" }: { variant?: "key" | "btn" }) {
  const muted = useMusic((m) => m.muted);
  const label = muted ? "Turn music on" : "Turn music off";
  if (variant === "btn")
    return (
      <button type="button" className="btn ghost sm" aria-pressed={!muted} aria-label={label} title={label} onClick={() => setMuted(!muted)}>
        <Icon name={muted ? "musicOff" : "musicOn"} size={14} /> {muted ? "Music off" : "Music"}
      </button>
    );
  return (
    <button type="button" className="key musickey" data-on={!muted} aria-pressed={!muted} aria-label={label} title={label} onClick={() => setMuted(!muted)}>
      <span className="led" />
      <Icon name={muted ? "musicOff" : "musicOn"} size={13} />
    </button>
  );
}
