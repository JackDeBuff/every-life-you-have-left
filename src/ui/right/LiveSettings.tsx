/**
 * Live life settings (SPEC §5): 3–5 generated controls. A change is a nudge: it applies from next
 * year, is logged, and the row says so ("from 35 →").
 *
 * In the right pane the decision card comes first: while a decision is open the panel folds into a
 * one-line summary bar ("Life settings · 4 · nudges apply from 32"), and it opens again on its own
 * once nothing is pending (or whenever the user clicks the bar). Open, it is one column of rows
 * (two only when the panel is truly wide), capped at ~40% of the pane with its own scroll.
 */
import * as Select from "@radix-ui/react-select";
import * as Slider from "@radix-ui/react-slider";
import * as Switch from "@radix-ui/react-switch";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { LiveSetting } from "../../../shared/sim";
import { Icon } from "../icons";
import { gsap, reducedMotion } from "../motion";
import { sim, useSim } from "../session";

/** The open decision the right pane is showing, if any. */
export type PendingCard = { id: string; big: boolean } | null;

/** After a card resolves, wait a beat before re-opening: at 2×/4× the next small card is often seconds away. */
const REOPEN_MS = 1400;

/**
 * `pending` drives the right pane's auto-collapse (undefined = a plain panel, e.g. the phone's
 * Settings tab: open, toggled by hand). `collapsed` is the older prop: true forces it shut.
 */
export function LiveSettings({ pending, collapsed = false }: { pending?: PendingCard; collapsed?: boolean }) {
  const settings = useSim((s) => s.settings);
  const age = useSim((s) => s.playhead.age);
  const auto = pending !== undefined;
  const key = pending?.id ?? "none";
  // The user's own click wins, but only for the card (or the idle stretch) it was made under.
  const [choice, setChoice] = useState<{ key: string; open: boolean } | null>(null);
  const [idleOpen, setIdleOpen] = useState(!pending);
  const chose = choice && choice.key === key ? choice.open : null;
  const prevKey = useRef(key);

  // Before paint, so a card never shows under an open panel even for a frame.
  useLayoutEffect(() => {
    const was = prevKey.current;
    if (!auto || was === key) return;
    prevKey.current = key;
    // Opened by hand during the card that just resolved: stay open, no flap.
    const keepOpen = !pending && choice?.key === was && choice.open;
    setChoice(null);
    if (pending) {
      setIdleOpen(false);
      return;
    }
    if (keepOpen) {
      setIdleOpen(true);
      return;
    }
    const id = window.setTimeout(() => setIdleOpen(true), REOPEN_MS);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, key]);

  const big = !!pending?.big;
  const open = collapsed || big ? false : auto ? (chose ?? (!pending && idleOpen)) : (chose ?? true);
  const nudgeNote = settings.length ? `nudges apply from ${age + 1}` : "being written";
  const bodyId = useId();

  return (
    <section className="settings" aria-label="Life settings" data-open={open} data-big={big}>
      <button
        type="button"
        className="settings-head"
        onClick={() => setChoice({ key, open: !open })}
        aria-expanded={open}
        aria-controls={bodyId}
        disabled={collapsed || big}
        title={open ? "Fold the life settings" : "Open the life settings"}
      >
        <span className="label">Life settings</span>
        {settings.length > 0 && (
          <>
            <span className="settings-dot" aria-hidden="true">·</span>
            <span className="set-count" aria-label={`${settings.length} settings`}>
              {settings.length}
            </span>
          </>
        )}
        <span className="settings-dot" aria-hidden="true">·</span>
        <span className="settings-note label">{nudgeNote}</span>
        <Icon name="caretDown" size={13} className="settings-caret" aria-hidden="true" />
      </button>
      <div className="settings-fold" inert={!open}>
        <div className="settings-body scroll" id={bodyId}>
          <div className="settings-grid">
            {!settings.length && <p className="settings-empty small faint">Writing a few controls from what you told me…</p>}
            {settings.map((s) => (
              <SettingRow key={s.id} s={s} nextAge={age + 1} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * How long a control waits for the hand to settle before the change becomes one nudge. A slider
 * already commits on release (Radix onValueCommit), but arrow keys commit every step and multi
 * chips get tapped in bursts: those coalesce into a single nudge with the final value.
 */
const settleMs = (s: LiveSetting) => (s.type === "slider" ? 700 : s.type === "chips" && s.multi ? 900 : 0);

function SettingRow({ s, nextAge }: { s: LiveSetting; nextAge: number }) {
  const [flash, setFlash] = useState(0);
  // What the control shows while a change settles (and until the session echoes it back).
  const [draft, setDraft] = useState<string | null>(null);
  const row = useRef<HTMLDivElement>(null);
  const hintId = useId();
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
    setFlash((f) => f + 1);
    if (row.current && !reducedMotion()) gsap.fromTo(row.current, { backgroundColor: "var(--sun-soft)" }, { backgroundColor: "rgba(0,0,0,0)", duration: 1.4, ease: "sine.inOut" });
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

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(0), 4200);
    return () => clearTimeout(id);
  }, [flash]);
  const shown = draft === null ? s : { ...s, value: draft };

  return (
    <div className="set-row" ref={row} data-type={s.type}>
      <div className="set-top">
        <span className="set-label">{s.label}</span>
        {flash > 0 && (
          <span key={flash} className="set-applies label">
            from {nextAge} <Icon name="arrowRight" size={10} />
          </span>
        )}
      </div>
      {s.hint && (
        <p className="set-hint" id={hintId}>
          {s.hint}
        </p>
      )}
      <Control s={shown} onChange={change} describedBy={s.hint ? hintId : undefined} />
    </div>
  );
}

function Control({ s, onChange, describedBy }: { s: LiveSetting; onChange: (v: string) => void; describedBy?: string }) {
  if (s.type === "chips") {
    const items = s.options.map((o) => (
      <ToggleGroup.Item key={o.value} value={o.value} className="seg-item">
        {o.label}
      </ToggleGroup.Item>
    ));
    if (s.multi) {
      const vals = s.value ? s.value.split(",") : [];
      return (
        <ToggleGroup.Root type="multiple" className="seg" value={vals} onValueChange={(v) => onChange(v.join(","))} aria-label={s.label} aria-describedby={describedBy}>
          {items}
        </ToggleGroup.Root>
      );
    }
    return (
      <ToggleGroup.Root type="single" className="seg" value={s.value} onValueChange={(v) => v && onChange(v)} aria-label={s.label} aria-describedby={describedBy}>
        {items}
      </ToggleGroup.Root>
    );
  }
  if (s.type === "select") {
    const current = s.options.find((o) => o.value === s.value)?.label ?? s.value;
    return (
      <Select.Root value={s.value} onValueChange={onChange}>
        <Select.Trigger className="sel" aria-label={s.label} aria-describedby={describedBy} title={current}>
          <span className="sel-value">
            <Select.Value />
          </span>
          <Select.Icon className="sel-ico">
            <Icon name="caretDown" size={12} />
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
  if (s.type === "slider") return <BalanceSlider s={s} onChange={onChange} describedBy={describedBy} />;
  return (
    <div className="sw-row">
      <Switch.Root className="sw" checked={s.value === "true"} onCheckedChange={(c) => onChange(String(c))} aria-label={s.label} aria-describedby={describedBy}>
        <Switch.Thumb className="sw-thumb" />
      </Switch.Root>
      <span className="small muted">{s.value === "true" ? "Yes, by default" : "Not by default"}</span>
    </div>
  );
}

function BalanceSlider({ s, onChange, describedBy }: { s: LiveSetting; onChange: (v: string) => void; describedBy?: string }) {
  const num = (x: string) => (x.trim() !== "" && Number.isFinite(Number(x)) ? Number(x) : 50);
  const [v, setV] = useState(num(s.value));
  useEffect(() => setV(num(s.value)), [s.value]);
  return (
    <div className="sl">
      <Slider.Root className="sl-root" value={[v]} min={0} max={100} step={5} onValueChange={([x]) => setV(x!)} onValueCommit={([x]) => onChange(String(x))} aria-label={s.label} aria-describedby={describedBy}>
        <Slider.Track className="sl-track">
          <Slider.Range className="sl-range" />
        </Slider.Track>
        <Slider.Thumb className="sl-thumb" aria-label={s.label} />
      </Slider.Root>
      <div className="sl-ends label">
        <span>{s.leftLabel}</span>
        <span>{s.rightLabel}</span>
      </div>
    </div>
  );
}
