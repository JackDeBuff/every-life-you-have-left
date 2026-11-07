/**
 * "Meanwhile, in your other lives…" (SPEC §4). Plays over the world: the title wipes in, then one
 * cut per branch. Between cuts the world BLINKS (Before Your Eyes): two lids close to a line and
 * open on another life. Ends with a blink back to yours, then resumes the clock.
 */
import { useEffect, useRef, useState } from "react";
import { ROMAN } from "../format";
import { Icon } from "../icons";
import { gsap, reducedMotion } from "../motion";
import { sim, useSim } from "../session";
import type { InterludeCut } from "../types";
import { WorldSlot } from "./WorldSlot";

export function Interlude({ cuts }: { cuts: InterludeCut[] }) {
  const speed = useSim((s) => s.speed);
  const root = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(-1);
  const done = useRef(false);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    void sim().pause(false);
  };

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduce = reducedMotion();
    const q = gsap.utils.selector(el);
    // Auto keeps the whole run under three minutes: ~8 s here, ~10 s at 1×/2×.
    const cutDur = speed === "auto" ? 1.45 : 2.2;
    const tl = gsap.timeline({ onComplete: finish });
    const blink = (to: number) => {
      if (reduce) {
        tl.to(q(".il-stage"), { opacity: 0, duration: 0.2 });
        tl.call(() => setI(to));
        tl.to(q(".il-stage"), { opacity: 1, duration: 0.2 });
        return;
      }
      tl.to(q(".lid"), { scaleY: 1, duration: 0.17, ease: "expo.in" });
      tl.call(() => setI(to));
      tl.to({}, { duration: 0.06 });
      tl.to(q(".lid"), { scaleY: 0, duration: 0.24, ease: "expo.out" });
    };
    tl.set(q(".lid"), { scaleY: 0 });
    tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "sine.inOut" });
    if (!reduce) {
      tl.fromTo(q(".il-title .ln"), { yPercent: 110 }, { yPercent: 0, duration: 0.75, ease: "expo.out", stagger: 0.1 }, "<0.05");
      tl.fromTo(q(".il-dots i"), { opacity: 0 }, { opacity: 1, duration: 0.18, stagger: 0.14 }, "-=0.4");
    }
    tl.to({}, { duration: 0.2 });
    cuts.forEach((_, k) => {
      blink(k);
      if (k === 0) {
        // The title shrinks into a running header while the first life opens.
        tl.to(q(".il-title"), { opacity: 0, y: -8, duration: 0.3, ease: "expo.in" }, "<");
        tl.fromTo(q(".il-head"), { opacity: 0 }, { opacity: 1, duration: 0.4 }, "<0.1");
      }
      if (!reduce) tl.fromTo(q(".il-cap"), { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: 0.45, ease: "expo.out" }, "-=0.1");
      tl.to({}, { duration: cutDur });
      if (!reduce) tl.to(q(".il-cap"), { opacity: 0, duration: 0.15 });
    });
    blink(-2);
    tl.to(el, { opacity: 0, duration: 0.3, ease: "sine.inOut" });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        tl.kill();
        finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      tl.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cut = i >= 0 ? cuts[i] : null;
  return (
    <div className="interlude" ref={root} role="region" aria-label="Meanwhile, in your other lives" aria-live="polite">
      <div className="il-stage">{cut && <WorldSlot spec={cut.scene} bare />}</div>
      <div className="il-tint" data-cut={!!cut} />
      <h2 className="il-title">
        <span className="mask">
          <span className="ln">Meanwhile,</span>
        </span>
        <span className="mask">
          <span className="ln">
            in your other lives
            <span className="il-dots" aria-hidden="true">
              <i>.</i>
              <i>.</i>
              <i>.</i>
            </span>
          </span>
        </span>
      </h2>
      <div className="il-cap">
        {cut && (
          <>
            <p className="il-meta">
              <span className="numeral">{ROMAN[i]}</span>
              <span className="label">{cut.title}</span>
              <span className="label faint">
                {cut.age} · {cut.scene.placeLabel}
              </span>
            </p>
            <p className="il-line">{cut.caption.replace(/^[^.]+\.\s*/, "")}</p>
          </>
        )}
      </div>
      <p className="il-head label" aria-hidden="true">
        Meanwhile, in your other lives
        {cut && (
          <span className="il-count">
            {" "}
            · {i + 1} of {cuts.length}
          </span>
        )}
      </p>
      <div className="lid top" />
      <div className="lid bottom" />
      <button className="il-skip btn quiet sm" onClick={finish}>
        Skip <Icon name="arrowRight" size={13} />
      </button>
    </div>
  );
}
