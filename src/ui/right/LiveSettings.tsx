/**
 * "Steer this life" (SPEC §5): 3–5 generated controls. A change is a nudge: it never rewrites what
 * has happened, it bends the life from next year on, and it goes in the life log.
 *
 * On desktop it is the right pane's second tab ("Decisions | Steer this life", Dialogue.tsx); on
 * the phone, the Steer tab. It is always open where it is shown: a short explainer that says what a
 * nudge does and from which age, then one row per control (two columns only when the pane is truly
 * wide). A nudge shows itself three ways: the row flashes and keeps an "Applied · from 28" tag, a
 * status line at the top says what changed (aria-live), and the life log gets its line.
 */
import * as Select from "@radix-ui/react-select";
import * as Slider from "@radix-ui/react-slider";
import * as Switch from "@radix-ui/react-switch";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { useEffect, useId, useRef, useState } from "react";
import type { LiveSetting, SettingNudge } from "../../../shared/sim";
import { Icon } from "../icons";
import { gsap, reducedMotion } from "../motion";
import { sim, useSim } from "../session";

/** How long the "just applied" line stays at the top of the panel. */
const APPLIED_MS = 6000;

/** The latest nudge, while it is fresh enough to call "just applied" (for the tab's dot). */
export function useFreshNudge(): SettingNudge | null {
  const last = useSim((s) => s.nudges[s.nudges.length - 1] ?? null);
  const [fresh, setFresh] = useState<SettingNudge | null>(null);
  const seen = useRef(last);
  useEffect(() => {
    if (!last || last === seen.current) return;
    seen.current = last;
    setFresh(last);
    const id = window.setTimeout(() => setFresh(null), APPLIED_MS);
    return () => window.clearTimeout(id);
  }, [last]);
  return fresh;
}

export function LiveSettings({ id, labelledBy }: { id?: string; labelledBy?: string }) {
  const settings = useSim((s) => s.settings);
  const age = useSim((s) => s.playhead.age);
  const nudges = useSim((s) => s.nudges);
  const ended = useSim((s) => s.phase === "ended");
  const fresh = useFreshNudge();
  const next = age + 1;
  const freshSetting = fresh ? settings.find((s) => s.id === fresh.settingId) : undefined;

  return (
    <section className="steer scroll" id={id} aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : "Steer this life"}>
      <header className="steer-intro">
        <div className="steer-title">
          <h2 className="steer-h">Steer this life</h2>
          <span className="steer-from" title={`Changes apply from age ${next}`}>
            Applies from <b className="data">{next}</b> <Icon name="arrowRight" size={11} />
          </span>
        </div>
        <p className="steer-lede">
          A nudge doesn't rewrite the past. Change a setting and this life bends from age {next} on. Each nudge goes in the life log, and you can change it again
          any time.
        </p>
      </header>

      <p className="steer-status" role="status" aria-live="polite" data-on={!!fresh}>
        {fresh && (
          <>
            <Icon name="check" size={13} />
            <span>
              <b>Nudge applied</b>
              {freshSetting ? <> · {freshSetting.label} → {valueLabel(freshSetting, fresh.to)}</> : null}. It shapes your life from {fresh.age + 1}.
            </span>
          </>
        )}
      </p>

      <div className="steer-grid">
        {!settings.length && <p className="settings-empty small faint">{ended ? "This life is over: nothing left to steer." : "Writing a few controls from what you told me…"}</p>}
        {settings.map((s) => (
          <SettingRow key={s.id} s={s} nextAge={next} last={nudges.findLast((n) => n.settingId === s.id) ?? null} age={age} disabled={ended} />
        ))}
      </div>
    </section>
  );
}

/** What a value reads as, for the status line ("Work-life balance → 70% All life"). */
function valueLabel(s: LiveSetting, v: string): string {
  if (s.type === "slider") {
    const n = Number(v);
    if (!Number.isFinite(n)) return v;
    if (n === 50) return "even";
    return n > 50 ? `${n}% ${s.rightLabel ?? "right"}` : `${100 - n}% ${s.leftLabel ?? "left"}`;
  }
  if (s.type === "toggle") return v === "true" ? "on" : "off";
  if (s.type === "chips" && s.multi) {
    const vals = v ? v.split(",") : [];
    return vals.length ? vals.map((x) => s.options.find((o) => o.value === x)?.label ?? x).join(", ") : "none";
  }
  return s.options.find((o) => o.value === v)?.label ?? v;
}

/**
 * How long a control waits for the hand to settle before the change becomes one nudge. A slider
 * already commits on release (Radix onValueCommit), but arrow keys commit every step and multi
 * chips get tapped in bursts: those coalesce into a single nudge with the final value.
 */
const settleMs = (s: LiveSetting) => (s.type === "slider" ? 700 : s.type === "chips" && s.multi ? 900 : 0);

function SettingRow({ s, nextAge, last, age, disabled }: { s: LiveSetting; nextAge: number; last: SettingNudge | null; age: number; disabled: boolean }) {
  // What the control shows while a change settles (and until the session echoes it back).
  const [draft, setDraft] = useState<string | null>(null);
  const row = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const labelId = useId();
  const latest = useRef(s);
  latest.current = s;
  const pendingTo = useRef<string | null>(null);
  const timer = useRef<number | null>(null);

  const flush = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    const to = pendingTo.current;
    pendingTo.current = null;
    if (to === null) return;
    const cur = latest.current;
    if (to === cur.value) {
      setDraft(null);
      return;
    }
    void sim().nudge(cur.id, to);
    if (row.current && !reducedMotion()) gsap.fromTo(row.current, { backgroundColor: "var(--sun-soft)" }, { backgroundColor: "rgba(0,0,0,0)", duration: 1.6, ease: "sine.inOut", clearProps: "backgroundColor" });
  };
  const change = (to: string) => {
    setDraft(to);
    pendingTo.current = to;
    if (timer.current !== null) window.clearTimeout(timer.current);
    const wait = settleMs(latest.current);
    if (wait === 0) flush();
    else timer.current = window.setTimeout(flush, wait);
  };

  // The session caught up: drop the draft. If it never does (a refused nudge), let go after a while.
  useEffect(() => {
    if (draft === null) return;
    if (draft === s.value && pendingTo.current === null) {
      setDraft(null);
      return;
    }
    const id = window.setTimeout(() => pendingTo.current === null && setDraft(null), 6000);
    return () => window.clearTimeout(id);
  }, [draft, s.value]);
  // Leaving mid-settle still counts as the user's change.
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = draft === null ? s : { ...s, value: draft };
  const settling = draft !== null && draft !== s.value;
  // The tag stays while the nudge is recent (this year or last): "Applied · from 28".
  const recent = last && last.age >= age - 1 ? last : null;

  return (
    <div className="set-row" ref={row} data-type={s.type} data-nudged={!!recent}>
      <div className="set-top">
        <span className="set-label" id={labelId}>
          {s.label}
        </span>
        {settling ? (
          <span className="set-applies label" data-state="settling">
            Applying…
          </span>
        ) : recent ? (
          <span key={`${recent.age}-${recent.to}`} className="set-applies label" title={`You nudged this at ${recent.age}. It shapes your life from ${recent.age + 1}.`}>
            <Icon name="check" size={11} /> Applied · from {recent.age + 1}
          </span>
        ) : null}
      </div>
      {s.hint && (
        <p className="set-hint" id={hintId}>
          {s.hint}
        </p>
      )}
      <Control s={shown} onChange={change} describedBy={s.hint ? hintId : undefined} disabled={disabled} nextAge={nextAge} />
    </div>
  );
}

function Control({ s, onChange, describedBy, disabled, nextAge }: { s: LiveSetting; onChange: (v: string) => void; describedBy?: string; disabled: boolean; nextAge: number }) {
  if (s.type === "chips") {
    const items = s.options.map((o) => (
      <ToggleGroup.Item key={o.value} value={o.value} className="seg-item">
        {o.label}
      </ToggleGroup.Item>
    ));
    if (s.multi) {
      const vals = s.value ? s.value.split(",") : [];
      return (
        <ToggleGroup.Root type="multiple" className="seg" value={vals} disabled={disabled} onValueChange={(v) => onChange(v.join(","))} aria-label={s.label} aria-describedby={describedBy}>
          {items}
        </ToggleGroup.Root>
      );
    }
    return (
      <ToggleGroup.Root type="single" className="seg" value={s.value} disabled={disabled} onValueChange={(v) => v && onChange(v)} aria-label={s.label} aria-describedby={describedBy}>
        {items}
      </ToggleGroup.Root>
    );
  }
  if (s.type === "select") {
    const current = s.options.find((o) => o.value === s.value)?.label ?? s.value;
    return (
      <Select.Root value={s.value} onValueChange={onChange} disabled={disabled}>
        <Select.Trigger className="sel" aria-label={s.label} aria-describedby={describedBy} title={current}>
          <span className="sel-value">
            <Select.Value />
          </span>
          <Select.Icon className="sel-ico">
            <Icon name="caretDown" size={13} />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className="sel-pop" position="popper" sideOffset={4} collisionPadding={12}>
            <Select.Viewport>
              {s.options.map((o) => (
                <Select.Item key={o.value} value={o.value} className="sel-item">
                  <Select.ItemText>{o.label}</Select.ItemText>
                  <Select.ItemIndicator className="sel-check">
                    <Icon name="check" size={12} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    );
  }
  if (s.type === "slider") return <BalanceSlider s={s} onChange={onChange} describedBy={describedBy} disabled={disabled} nextAge={nextAge} />;
  return (
    <div className="sw-row">
      <Switch.Root className="sw" checked={s.value === "true"} disabled={disabled} onCheckedChange={(c) => onChange(String(c))} aria-label={s.label} aria-describedby={describedBy}>
        <Switch.Thumb className="sw-thumb" />
      </Switch.Root>
      <span className="sw-state">{s.value === "true" ? "Yes, by default" : "Not by default"}</span>
    </div>
  );
}

/**
 * A balance between two ends: both ends are labelled with their share ("All work 30 · 70 All life"),
 * the nearer end in ink; the fill runs from the centre to the thumb, so the lean reads at a glance.
 */
function BalanceSlider({ s, onChange, describedBy, disabled, nextAge }: { s: LiveSetting; onChange: (v: string) => void; describedBy?: string; disabled: boolean; nextAge: number }) {
  const num = (x: string) => (x.trim() !== "" && Number.isFinite(Number(x)) ? Number(x) : 50);
  const [v, setV] = useState(num(s.value));
  useEffect(() => setV(num(s.value)), [s.value]);
  const left = s.leftLabel ?? "Less";
  const right = s.rightLabel ?? "More";
  const lo = Math.min(v, 50);
  const hi = Math.max(v, 50);
  const text = v === 50 ? `Even between ${left} and ${right}` : v > 50 ? `${v}% ${right}, ${100 - v}% ${left}` : `${100 - v}% ${left}, ${v}% ${right}`;
  return (
    <div className="sl">
      <div className="sl-ends" aria-hidden="true">
        <span data-near={v < 50}>
          {left} <b className="data">{100 - v}</b>
        </span>
        <span data-near={v > 50}>
          <b className="data">{v}</b> {right}
        </span>
      </div>
      <Slider.Root
        className="sl-root"
        value={[v]}
        min={0}
        max={100}
        step={5}
        disabled={disabled}
        onValueChange={([x]) => setV(x!)}
        onValueCommit={([x]) => onChange(String(x))}
        aria-label={s.label}
        aria-describedby={describedBy}
      >
        <Slider.Track className="sl-track">
          <span className="sl-mid" aria-hidden="true" />
          <span className="sl-lean" aria-hidden="true" style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
        </Slider.Track>
        <Slider.Thumb className="sl-thumb" aria-label={s.label} aria-valuetext={`${text}, from age ${nextAge}`} />
      </Slider.Root>
    </div>
  );
}
