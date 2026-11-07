/**
 * "Your words did this": the why thread (D-013), told backwards. The three sentences that moved the
 * life most, verbatim in the user's serif, each with thin threads drawn to the turning points it
 * caused. A turning point opens that year of the log.
 *
 * Motion (when the section scrolls in): each quote writes itself in word by word, the sun
 * highlighter sweeps under it, then its threads draw out to their consequences, which settle in as
 * each thread arrives. Reduced motion (or ?still=1): everything is simply there.
 */
import * as Popover from "@radix-ui/react-popover";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getBaseRate } from "../../../shared/baseRates";
import { DOMAINS } from "../../../shared/domains";
import { Icon } from "../icons";
import { famVar } from "../left/LifeRose";
import { gsap, reducedMotion } from "../motion";
import { useSim } from "../session";
import { yourWords, type Consequence, type Influence } from "./influence";

const COUNT = ["", "One thing you said", "Two things you said", "Three things you said"];

export function YourWords({ label }: { label: string }) {
  const profile = useSim((s) => s.profile);
  const years = useSim((s) => s.years);
  const decisions = useSim((s) => s.decisions);
  const answers = useSim((s) => s.answers);
  const warmup = useSim((s) => s.warmup ?? null);
  const words = useMemo(() => yourWords({ profile, years, decisions, answers, warmup }), [profile, years, decisions, answers, warmup]);
  const root = useRef<HTMLElement>(null);
  const played = useRef(false);
  const sig = words.map((w) => `${w.quote.id}:${w.consequences.map((c) => c.key).join(",")}`).join("|");

  useEffect(() => {
    const el = root.current;
    if (!el || !sig || played.current) return;
    const still = reducedMotion() || document.documentElement.classList.contains("still");
    if (still) return;
    const q = gsap.utils.selector(el);
    // Hidden until the section is in view (a class set here, not in markup, so ?still=1 and reduced
    // motion render it whole). The section sits below the fold, so there is no flash.
    el.classList.add("pre");

    let tl: gsap.core.Timeline | null = null;
    const play = () => {
      tl = gsap.timeline();
      // fromTo renders its start state at once, so the class can go as soon as the timeline is built.
      tl.fromTo(q(".word-head-sub"), { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "sine.inOut" });
      q(".word").forEach((row, i) => {
        const r = gsap.utils.selector(row);
        const at = i === 0 ? 0.2 : ">-1.0";
        const ws = r(".ww");
        tl!.fromTo(ws, { opacity: 0, y: 7, filter: "blur(3px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.5, ease: "expo.out", stagger: Math.min(0.06, 0.8 / Math.max(1, ws.length)) }, at);
        tl!.fromTo(r(".word-mark"), { backgroundSize: "0% 34%" }, { backgroundSize: "100% 34%", duration: 0.7, ease: "expo.out" }, "-=0.25");
        tl!.fromTo(r(".word-when"), { opacity: 0 }, { opacity: 1, duration: 0.4 }, "<");
        const threads = r(".thread");
        const ends = r(".thread-end");
        const cons = r(".con");
        threads.forEach((t, k) => {
          const pos = k === 0 ? "-=0.35" : "<0.12";
          tl!.fromTo(t, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.6, ease: "sine.inOut" }, pos);
          if (ends[k]) tl!.fromTo(ends[k], { opacity: 0, scale: 0.4, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2)" }, "-=0.12");
          if (cons[k]) tl!.fromTo(cons[k], { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.5, ease: "expo.out" }, "<");
        });
      });
      el.classList.remove("pre");
    };
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          io.disconnect();
          played.current = true;
          play();
        }
      },
      { threshold: 0.28 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      tl?.progress(1).kill();
      el.classList.remove("pre");
    };
  }, [sig]);

  if (!words.length) return null;
  return (
    <section className="end-sec end-words" ref={root} aria-labelledby="words-h">
      <div className="sec-head">
        <p className="label">{label}</p>
        <h2 id="words-h">Your words did this</h2>
        <p className="muted word-head-sub">
          {COUNT[words.length]}, and what {words.length === 1 ? "it" : "they"} set in motion. Every turning point in your life quotes something you told me.
        </p>
      </div>
      <ol className="words">
        {words.map((w) => (
          <WordRow key={w.quote.id} w={w} />
        ))}
      </ol>
    </section>
  );
}

function WordRow({ w }: { w: Influence }) {
  const row = useRef<HTMLLIElement>(null);
  const quoteRef = useRef<HTMLQuoteElement>(null);
  const consRef = useRef<HTMLUListElement>(null);
  const [geo, setGeo] = useState<{ w: number; h: number; paths: string[]; ends: [number, number][] } | null>(null);

  // Threads: from the quote to each consequence. Side by side → a fan from the quote's right edge;
  // stacked (narrow screens) → a trunk down the left with a branch to each row.
  useLayoutEffect(() => {
    const el = row.current;
    const qe = quoteRef.current;
    const ce = consRef.current;
    if (!el || !qe || !ce) return;
    const measure = () => {
      const R = el.getBoundingClientRect();
      const Q = qe.getBoundingClientRect();
      const items = [...ce.querySelectorAll<HTMLElement>(".con")].map((x) => x.getBoundingClientRect());
      if (!items.length) return;
      const C = ce.getBoundingClientRect();
      const side = C.left >= Q.right - 4;
      const paths: string[] = [];
      const ends: [number, number][] = [];
      if (side) {
        // From the end of the sentence (its last line), so the thread reads as coming out of the words.
        const lines = qe.querySelector(".word-mark")?.getClientRects();
        const last = lines?.length ? lines[lines.length - 1]! : Q;
        const x0 = last.right - R.left + 12;
        const y0 = last.top - R.top + last.height * 0.56;
        // run level until clear of the widest line, so a thread never strikes through the words
        const widest = lines?.length ? Math.max(...[...lines].map((l) => l.right)) : Q.right;
        const xs = Math.max(x0, widest - R.left + 16);
        const x1 = C.left - R.left - 10;
        for (const it of items) {
          const y1 = it.top - R.top + it.height / 2;
          const mx = xs + (x1 - xs) * 0.5;
          paths.push(`M${x0.toFixed(1)} ${y0.toFixed(1)} H${xs.toFixed(1)} C${mx.toFixed(1)} ${y0.toFixed(1)} ${mx.toFixed(1)} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`);
          ends.push([x1, y1]);
        }
      } else {
        const x0 = C.left - R.left + 6;
        const y0 = Q.bottom - R.top + 8;
        for (const it of items) {
          const y1 = it.top - R.top + it.height / 2;
          const x1 = x0 + 18;
          paths.push(`M${x0.toFixed(1)} ${y0.toFixed(1)} V${(y1 - 10).toFixed(1)} Q${x0.toFixed(1)} ${y1.toFixed(1)} ${(x0 + 10).toFixed(1)} ${y1.toFixed(1)} H${x1.toFixed(1)}`);
          ends.push([x1, y1]);
        }
      }
      setGeo({ w: R.width, h: R.height, paths, ends });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    void document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [w]);

  const words = w.text.split(/\s+/).filter(Boolean);
  return (
    <li className="word" ref={row}>
      <figure className="word-fig">
        <blockquote className="word-q voice" ref={quoteRef}>
          <span className="word-mark">
            {words.map((x, i) => (
              <span key={i} className="ww">
                {i === 0 ? "“" : ""}
                {x}
                {i < words.length - 1 ? " " : "”"}
              </span>
            ))}
          </span>
        </blockquote>
        <figcaption className="word-when small faint">
          {w.when} · {w.count === 1 ? "one turning point" : `${w.count} turning points`} trace back to it
        </figcaption>
      </figure>
      {geo && (
        <svg className="word-threads" width={geo.w} height={geo.h} viewBox={`0 0 ${geo.w} ${geo.h}`} aria-hidden="true">
          {geo.paths.map((d, i) => (
            <path key={`p${i}`} className="thread" d={d} pathLength={1} data-kind={w.consequences[i]?.kind} />
          ))}
          {geo.ends.map(([x, y], i) =>
            w.consequences[i]?.kind === "fork" ? (
              <rect key={`e${i}`} className="thread-end fork" x={x - 4} y={y - 4} width={8} height={8} transform={`rotate(45 ${x} ${y})`} />
            ) : (
              <circle key={`e${i}`} className="thread-end" cx={x} cy={y} r={3.2} style={{ fill: w.consequences[i]?.domain ? famVar(DOMAINS[w.consequences[i]!.domain!].family) : "var(--ink-3)" }} />
            ),
          )}
        </svg>
      )}
      <ul className="word-cons" ref={consRef}>
        {w.consequences.map((c) => (
          <li key={c.key}>
            <YearPeek c={c}>
              <button className="con" data-kind={c.kind}>
                <span className="con-when data">
                  {c.year} · {c.age}
                </span>
                <span className="con-title">{c.title}</span>
                <Icon name="arrowUpRight" size={12} className="con-go" />
              </button>
            </YearPeek>
          </li>
        ))}
      </ul>
    </li>
  );
}

/** The log entry a turning point links to: that year, opened in place. */
function YearPeek({ c, children }: { c: Consequence; children: React.ReactNode }) {
  const year = useSim((s) => s.years.find((y) => y.year === c.year) ?? null);
  const log = useSim((s) => s.log);
  const decision = useSim((s) => (c.kind === "fork" ? s.decisions.find((d) => d.id === c.refId) ?? null : null));
  const ev = c.kind === "event" ? year?.events.find((e) => e.id === c.refId) ?? null : null;
  const rate = ev?.baseRate ? getBaseRate(ev.baseRate.statId) : undefined;
  const others = useMemo(() => {
    const head = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, "").slice(0, 28);
    const seen = new Set([head(year?.summary ?? ""), head(c.title)]);
    return log
      .filter((l) => l.year === c.year && l.refId !== c.refId && l.kind !== "year" && l.kind !== "interlude")
      .filter((l) => !seen.has(head(l.text)) && !!seen.add(head(l.text)))
      .slice(0, 3);
  }, [log, c.year, c.refId, c.title, year?.summary]);
  return (
    <Popover.Root>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="pop year-pop" side="top" align="start" sideOffset={8} collisionPadding={12}>
          <p className="label">
            {c.year} · age {c.age}
            {year?.place ? ` · ${year.place}` : ""}
          </p>
          {c.kind === "fork" && decision ? (
            <>
              <p className="year-pop-title">{c.title}</p>
              <p className="small muted">{decision.prompt}</p>
            </>
          ) : (
            <>
              <p className="year-pop-title">{c.title}</p>
              {ev?.narrative && <p className="small muted">{ev.narrative}</p>}
              {ev?.cause?.reason && <p className="small year-pop-why">{ev.cause.reason}</p>}
            </>
          )}
          {rate && (
            <p className="meta faint year-pop-rate">
              {rate.display}{" "}
              <a href={rate.url} target="_blank" rel="noreferrer">
                {rate.source}
              </a>
            </p>
          )}
          {year?.summary && (
            <div className="year-pop-log">
              <p className="label">That year in your log</p>
              <p className="small">{year.summary}</p>
              {others.map((l) => (
                <p key={l.id} className="small muted">
                  {l.text}
                </p>
              ))}
            </div>
          )}
          <Popover.Close className="pop-x" aria-label="Close">
            <Icon name="x" size={14} />
          </Popover.Close>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
