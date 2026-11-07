/**
 * "Meanwhile, in your other lives…" (SPEC §4). Plays over the world: the title wipes in, then one
 * caption per branch.
 *
 * With the 3D world (the normal case) the WORLD drives the cuts: it plays them in mode
 * "interlude", reports each one (useUi.worldCut) and calls pause(false) when done
 * (WorldView.onInterludeDone). This overlay only draws the title and the captions.
 *
 * Without it (no WebGL, or the 3D chunk still loading), the overlay times itself over the 2D
 * stand-in, and between cuts the world BLINKS (Before Your Eyes): two lids close to a line and
 * open on another life. Ends with a blink back to yours, then resumes the clock.
 */
import { useEffect, useRef, useState } from "react";
import { branchAccent } from "../../world/landmarks";
import { ROMAN } from "../format";
import { Icon } from "../icons";
import { gsap, reducedMotion } from "../motion";
import { sim, useSim } from "../session";
import type { InterludeCut } from "../types";
import { useUi } from "../uiStore";
import { cutSecondsFor } from "./WorldView";
import { WorldSlot } from "./WorldSlot";

export function Interlude({ cuts }: { cuts: InterludeCut[] }) {
  const world3d = useUi((s) => s.world3d);
  // Decide at mount (a world that loads mid-interlude doesn't take over half way). If the world
  // doesn't start its cuts (not rendering: hidden, context lost), the overlay times itself.
  const [driven, setDriven] = useState(world3d);
  // No cuts yet (the agent is writing the branches): the driven overlay holds the title.
  if (!cuts.length || driven) return <DrivenInterlude cuts={cuts} onStall={() => setDriven(false)} />;
  return <TimedInterlude cuts={cuts} />;
}

const finish = () => {
  if (sim().phase === "interlude") void sim().pause(false).catch(() => {});
};

function useSkipKey(onSkip: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSkip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSkip]);
}

/** Captions over the 3D world's own cuts. */
function DrivenInterlude({ cuts, onStall }: { cuts: InterludeCut[]; onStall: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const i = useUi((s) => s.worldCut);
  const speed = useSim((s) => s.speed);
  useSkipKey(finish);

  // Watchdogs (once the cuts exist): no first cut within 2.5 s -> self-timed overlay; a cut that
  // never ends -> move on.
  const ready = cuts.length > 0;
  useEffect(() => {
    if (!ready) return;
    const per = cutSecondsFor(speed);
    const id = window.setTimeout(i < 0 ? onStall : finish, i < 0 ? 2500 : (per + 2.5) * 1000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, ready]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const q = gsap.utils.selector(el);
    const tl = gsap.timeline();
    tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "sine.inOut" });
    if (!reducedMotion()) {
      tl.fromTo(q(".il-title .ln"), { yPercent: 110 }, { yPercent: 0, duration: 0.7, ease: "expo.out", stagger: 0.1 }, "<0.05");
      tl.fromTo(q(".il-dots i"), { opacity: 0 }, { opacity: 1, duration: 0.16, stagger: 0.12 }, "-=0.35");
    }
    return () => {
      tl.kill();
    };
  }, []);

  // The title shrinks into a running header once the first life plays (after the intro).
  const playing = i >= 0;
  useEffect(() => {
    const el = root.current;
    if (!el || !playing) return;
    const q = gsap.utils.selector(el);
    const tl = gsap.timeline({ delay: 0.9 });
    tl.to(q(".il-title, .il-wait"), { opacity: 0, y: -8, duration: 0.35, ease: "expo.in" });
    tl.to(q(".il-shade"), { opacity: 0, duration: 0.5, ease: "sine.inOut" }, "<");
    tl.fromTo(q(".il-head"), { opacity: 0 }, { opacity: 1, duration: 0.4 }, "<0.1");
    return () => {
      tl.kill();
    };
  }, [playing]);

  useEffect(() => {
    const el = root.current;
    if (!el || i < 0 || reducedMotion()) return;
    const tw = gsap.fromTo(el.querySelector(".il-cap"), { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: 0.45, ease: "expo.out", delay: i === 0 ? 0.9 : 0.15 });
    return () => {
      tw.kill();
    };
  }, [i]);

  const cut = i >= 0 ? cuts[i] : null;
  return (
    <div className="interlude driven" ref={root} role="region" aria-label="Meanwhile, in your other lives" aria-live="polite">
      <div className="il-shade" />
      <div className="il-tint" data-cut="true" />
      <Title />
      {!ready && (
        <p className="il-wait small" role="status">
          Writing the lives you didn't choose
          <span className="dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </p>
      )}
      <Caption cut={cut} i={i} />
      <Head i={i} n={cuts.length} show={!!cut} />
      <button className="il-skip btn quiet sm" onClick={finish}>
        Skip <Icon name="arrowRight" size={13} />
      </button>
    </div>
  );
}

/** Self-timed fallback over the 2D stand-in. */
function TimedInterlude({ cuts }: { cuts: InterludeCut[] }) {
  const speed = useSim((s) => s.speed);
  const root = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(-1);
  const done = useRef(false);
  const end = () => {
    if (done.current) return;
    done.current = true;
    finish();
  };

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduce = reducedMotion();
    const q = gsap.utils.selector(el);
    // Auto keeps the whole run under three minutes: ~8 s here, ~10 s at 1×/2×.
    const cutDur = speed === "auto" ? 1.25 : 2.2;
    const tl = gsap.timeline({ onComplete: end });
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
        end();
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
      <Title />
      <Caption cut={cut} i={i} />
      <Head i={i} n={cuts.length} show={!!cut} />
      <div className="lid top" />
      <div className="lid bottom" />
      <button className="il-skip btn quiet sm" onClick={end}>
        Skip <Icon name="arrowRight" size={13} />
      </button>
    </div>
  );
}

function Title() {
  return (
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
  );
}

function Caption({ cut, i }: { cut: InterludeCut | null | undefined; i: number }) {
  return (
    <div className="il-cap">
      {cut && (
        <>
          <p className="il-meta" style={{ ["--branch" as string]: branchAccent(i) }}>
            <span className="il-swatch" aria-hidden="true" />
            <span className="numeral">{ROMAN[i]}</span>
            <span className="label">{cut.title}</span>
            <span className="label faint">
              {cut.age} · {cut.scene.placeLabel}
            </span>
          </p>
          <p className="il-line">{captionLine(cut)}</p>
        </>
      )}
    </div>
  );
}

/** Captions often lead with the branch title ("Take Singapore: …"); the meta line already shows it. */
function captionLine(cut: InterludeCut): string {
  const c = cut.caption.trim();
  const t = cut.title.trim();
  if (t && c.toLowerCase().startsWith(t.toLowerCase())) return c.slice(t.length).replace(/^[\s:.,–—-]+/, "") || c;
  return c;
}

function Head({ i, n, show }: { i: number; n: number; show: boolean }) {
  return (
    <p className="il-head label" aria-hidden="true">
      Meanwhile, in your other lives
      {show && (
        <span className="il-count">
          {" "}
          · {i + 1} of {n}
        </span>
      )}
    </p>
  );
}
