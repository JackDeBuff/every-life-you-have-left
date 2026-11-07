/**
 * Live life settings (SPEC §5): 3–5 generated controls. A change is a nudge: it applies from next
 * year, is logged, and the row says so ("from 35 →").
 */
import * as Select from "@radix-ui/react-select";
import * as Slider from "@radix-ui/react-slider";
import * as Switch from "@radix-ui/react-switch";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { useEffect, useRef, useState } from "react";
import type { LiveSetting } from "../../../shared/sim";
import { Icon } from "../icons";
import { gsap, reducedMotion } from "../motion";
import { sim, useSim } from "../session";

export function LiveSettings({ collapsed }: { collapsed: boolean }) {
  const settings = useSim((s) => s.settings);
  const age = useSim((s) => s.playhead.age);
  const [open, setOpen] = useState(true);
  const body = useRef<HTMLDivElement>(null);
  const show = open && !collapsed;

  useEffect(() => {
    const el = body.current;
    if (!el) return;
    if (reducedMotion()) {
      el.style.height = show ? "auto" : "0px";
      return;
    }
    gsap.to(el, { height: show ? "auto" : 0, opacity: show ? 1 : 0, duration: 0.5, ease: show ? "expo.out" : "expo.inOut" });
  }, [show]);

  return (
    <section className="settings" aria-label="Life settings" data-collapsed={!show}>
      <button className="settings-head" onClick={() => setOpen(!open)} aria-expanded={show} disabled={collapsed}>
        <span className="label">Life settings</span>
        <span className="label faint">{settings.length ? `Nudges apply from ${age + 1}` : ""}</span>
        <Icon name={show ? "caretUp" : "caretDown"} size={13} />
      </button>
      <div className="settings-body" ref={body}>
        {!settings.length && <p className="settings-empty small faint">Writing a few controls from what you told me…</p>}
        {settings.map((s) => (
          <SettingRow key={s.id} s={s} nextAge={age + 1} />
        ))}
      </div>
    </section>
  );
}

function SettingRow({ s, nextAge }: { s: LiveSetting; nextAge: number }) {
  const [flash, setFlash] = useState(0);
  const row = useRef<HTMLDivElement>(null);
  const change = (to: string) => {
    if (to === s.value) return;
    void sim().nudge(s.id, to);
    setFlash((f) => f + 1);
    if (row.current && !reducedMotion()) gsap.fromTo(row.current, { backgroundColor: "var(--sun-soft)" }, { backgroundColor: "rgba(0,0,0,0)", duration: 1.4, ease: "sine.inOut" });
  };
  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(0), 4200);
    return () => clearTimeout(id);
  }, [flash]);

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
      <Control s={s} onChange={change} />
      <p className="set-hint">{s.hint}</p>
    </div>
  );
}

function Control({ s, onChange }: { s: LiveSetting; onChange: (v: string) => void }) {
  if (s.type === "chips") {
    if (s.multi) {
      const vals = s.value ? s.value.split(",") : [];
      return (
        <ToggleGroup.Root type="multiple" className="seg" value={vals} onValueChange={(v) => onChange(v.join(","))} aria-label={s.label}>
          {s.options.map((o) => (
            <ToggleGroup.Item key={o.value} value={o.value} className="seg-item">
              {o.label}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
      );
    }
    return (
      <ToggleGroup.Root type="single" className="seg" value={s.value} onValueChange={(v) => v && onChange(v)} aria-label={s.label}>
        {s.options.map((o) => (
          <ToggleGroup.Item key={o.value} value={o.value} className="seg-item">
            {o.label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
    );
  }
  if (s.type === "select") {
    return (
      <Select.Root value={s.value} onValueChange={onChange}>
        <Select.Trigger className="sel" aria-label={s.label}>
          <Select.Value />
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
  if (s.type === "slider") return <BalanceSlider s={s} onChange={onChange} />;
  return (
    <div className="sw-row">
      <Switch.Root className="sw" checked={s.value === "true"} onCheckedChange={(c) => onChange(String(c))} aria-label={s.label}>
        <Switch.Thumb className="sw-thumb" />
      </Switch.Root>
      <span className="small muted">{s.value === "true" ? "Yes, by default" : "Not by default"}</span>
    </div>
  );
}

function BalanceSlider({ s, onChange }: { s: LiveSetting; onChange: (v: string) => void }) {
  const [v, setV] = useState(Number(s.value) || 50);
  useEffect(() => setV(Number(s.value) || 50), [s.value]);
  return (
    <div className="sl">
      <Slider.Root className="sl-root" value={[v]} min={0} max={100} step={5} onValueChange={([x]) => setV(x!)} onValueCommit={([x]) => onChange(String(x))} aria-label={s.label}>
        <Slider.Track className="sl-track">
          <Slider.Range className="sl-range" />
        </Slider.Track>
        <Slider.Thumb className="sl-thumb" />
      </Slider.Root>
      <div className="sl-ends label">
        <span>{s.leftLabel}</span>
        <span>{s.rightLabel}</span>
      </div>
    </div>
  );
}
