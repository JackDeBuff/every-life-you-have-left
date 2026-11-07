/**
 * Ending (SPEC §4 "At endAge"): 1) your life + the three you have left, side by side, each with a
 * verdict and no ranking; 2) the postcard from 70; 3) the five-year answer card; 4) talk to any
 * version of you, at any age (letters, or a twin once we know you well).
 */
import * as Slider from "@radix-ui/react-slider";
import * as Tabs from "@radix-ui/react-tabs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TWIN_THRESHOLD } from "../../shared/schema";
import type { SimYear } from "../../shared/sim";
import { Postcard } from "../ui/ending/Postcard";
import { money, ROMAN } from "../ui/format";
import { Icon } from "../ui/icons";
import { MiniRose } from "../ui/left/LifeRose";
import { Portrait } from "../ui/left/Portrait";
import { readAloud, warmVoice, type Reading } from "../ui/media";
import { gsap, reducedMotion, setSun } from "../ui/motion";
import { sim, useSim } from "../ui/session";

const NONE: Record<string, string> = {};

interface LifeCol {
  id: string;
  numeral: string;
  title: string;
  path: string;
  last: SimYear | null;
  verdict: string;
}

export default function Ending() {
  const s = useSim((x) => x);
  const root = useRef<HTMLDivElement>(null);
  const [talkLife, setTalkLife] = useState("chosen");
  const talkRef = useRef<HTMLElement>(null);
  const p = s.profile!;
  const endYear = p.startYear + (s.endAge - p.age);

  const lives: LifeCol[] = useMemo(() => {
    const chosenPath = s.decisions
      .filter((d) => d.kind === "big" && d.status === "answered")
      .map((d) => {
        const a = s.answers.find((x) => x.decisionId === d.id);
        const o = d.options.find((x) => x.id === a?.optionId);
        return o?.branchTitle ?? o?.label ?? "";
      })
      .filter(Boolean);
    const out: LifeCol[] = [
      { id: "chosen", numeral: "You", title: "The life you chose", path: chosenPath.join(" → "), last: s.years[s.years.length - 1] ?? null, verdict: s.ending?.verdict ?? s.verdictAtEnd ?? "" },
    ];
    s.branches
      .filter((b) => b.status === "active")
      .forEach((b, i) => {
        out.push({ id: b.id, numeral: ROMAN[i]!, title: b.title, path: `Split at ${b.forkAge}`, last: b.years[b.years.length - 1] ?? null, verdict: s.ending?.branchVerdicts[b.id] ?? b.verdictAtEnd ?? "" });
      });
    return out;
  }, [s.decisions, s.answers, s.years, s.branches, s.ending, s.verdictAtEnd]);

  useEffect(() => {
    setSun(1);
    if (reducedMotion() || !root.current) return;
    const ctx = gsap.context(() => {
      gsap.from(".end-title .ln", { yPercent: 110, duration: 1.1, ease: "expo.out", stagger: 0.1 });
      gsap.from(".life-col", { y: 30, opacity: 0, duration: 0.9, ease: "expo.out", stagger: 0.12, delay: 0.3 });
      gsap.from(".life-col .mini-rose", { scale: 0.2, opacity: 0, transformOrigin: "50% 50%", duration: 1.2, ease: "expo.out", stagger: 0.12, delay: 0.6 });
    }, root);
    return () => ctx.revert();
  }, []);

  const quotes = p.quotes;
  // The postcard quotes the most "you" sentence: a want or a fear, not a job title.
  const heartQuote =
    [...quotes].reverse().find((q) => /if nobody|scare|afraid|want|wish|dream|love|never|always|can't|miss/i.test(q.text)) ?? quotes[quotes.length - 1] ?? null;
  const firstQuote = heartQuote ? (heartQuote.shortForm ?? heartQuote.text) : null;
  const chosenLast = lives[0]!.last;
  const message = useMemo(
    () => `I'm writing from ${chosenLast?.place ?? p.city}. ${lives[0]!.verdict} Decide the small things faster and the big things slower. It worked out better than you'd think.`,
    [chosenLast, lives, p.city],
  );

  return (
    <div className="ending scroll" ref={root}>
      <header className="end-bar">
        <span className="wordmark">Every Life You Have Left</span>
        <button className="btn ghost sm" onClick={() => sim().reset()}>
          <Icon name="restart" size={14} /> Start a new life
        </button>
      </header>

      <section className="end-hero">
        <h1 className="end-title">
          <span className="mask">
            <span className="ln">{s.endAge}.</span>
          </span>
        </h1>
        <p className="lede">
          {p.firstName}, these are the lives you have left. None of them is the right one. Each is a version of you that a few different
          answers would have made.
        </p>
      </section>

      <section className="lives" aria-label="Your life and the three you have left">
        {lives.map((l) => (
          <article key={l.id} className="life-col" data-you={l.id === "chosen"}>
            <header>
              <span className="numeral big">{l.numeral}</span>
              <h2>{l.title}</h2>
              <p className="small faint">{l.path}</p>
            </header>
            <div className="life-pics">
              <Portrait appearance={s.appearance} age={s.endAge} progress={1} size={78} portraits={s.portraits} />
              {l.last && <MiniRose states={l.last.states} size={110} />}
            </div>
            {l.last && (
              <dl className="life-facts">
                <div>
                  <dt className="label">At {l.last.age}</dt>
                  <dd>{l.last.place}</dd>
                </div>
                <div>
                  <dt className="label">People</dt>
                  <dd>{peopleLine(l.last)}</dd>
                </div>
                <div>
                  <dt className="label">Net worth</dt>
                  <dd className="data">{money(l.last.money.netWorth)}</dd>
                </div>
              </dl>
            )}
            <p className="verdict">{l.verdict}</p>
            <button
              className="btn ghost sm"
              onClick={() => {
                setTalkLife(l.id);
                talkRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              Talk to this {l.id === "chosen" ? "you" : "version"} <Icon name="arrowRight" size={13} />
            </button>
          </article>
        ))}
        <p className="lives-note small faint">Side by side, not ranked. Money is a projection in today's dollars, not a prediction.</p>
      </section>

      <section className="end-sec post-sec">
        <div className="sec-head">
          <p className="label">Two</p>
          <h2>A postcard from {s.endAge}</h2>
        </div>
        <Postcard
          name={p.firstName ?? "you"}
          endAge={s.endAge}
          endYear={endYear}
          place={chosenLast?.place ?? p.city ?? ""}
          verdict={lives[0]!.verdict}
          message={message}
          quote={firstQuote}
          states={chosenLast?.states ?? null}
          from={{ age: p.age, city: p.city ?? "", year: p.startYear }}
        />
      </section>

      <section className="end-sec">
        <div className="sec-head">
          <p className="label">Three</p>
          <h2>Where do you see yourself in five years?</h2>
          <p className="muted">Every interview asks. Here's your answer, in your words, for each life.</p>
        </div>
        <FiveYear lives={lives} />
      </section>

      <section className="end-sec" ref={talkRef}>
        <div className="sec-head">
          <p className="label">Four</p>
          <h2>Talk to any version of you</h2>
          <p className="muted">
            {p.knowMeScore >= TWIN_THRESHOLD
              ? "I know you well enough to write like you. Ask anything."
              : `I know you ${p.knowMeScore}% so far, so they'll write you letters. At ${TWIN_THRESHOLD}%, they talk back in your own voice.`}
          </p>
        </div>
        <TalkTo lives={lives} life={talkLife} setLife={setTalkLife} />
      </section>
    </div>
  );
}

function LifeMark({ id, numeral }: { id: string; numeral: string }) {
  return id === "chosen" ? <span className="sun-dot" aria-hidden="true" /> : <span className="numeral">{numeral}</span>;
}

function peopleLine(y: SimYear) {
  const ps = y.scene.people.filter((x) => x.role !== "self");
  if (!ps.length) return "Friends, mostly";
  const n = (r: string) => ps.filter((x) => x.role === r).length;
  const out: string[] = [];
  if (n("partner")) out.push("a partner");
  if (n("child")) out.push(`${n("child")} ${n("child") === 1 ? "child" : "children"}`);
  if (n("parent")) out.push("a parent");
  return out.join(", ") || "Friends, mostly";
}

function FiveYear({ lives }: { lives: LifeCol[] }) {
  const five = useSim((s) => s.ending?.fiveYear ?? NONE);
  const [tab, setTab] = useState("chosen");
  const [copied, setCopied] = useState(false);
  const sessionId = useSim((s) => s.sessionId);
  const { speaking, loading, toggle, stop } = useReadAloud(sessionId);
  const text = five[tab] ?? "";
  const speak = () => toggle(text);
  // Gemini TTS takes ~9 s cold; warm the server's cache for your life's answer on arrival.
  const chosen = five.chosen ?? "";
  useEffect(() => {
    if (chosen) warmVoice(chosen, sessionId);
  }, [chosen, sessionId]);

  return (
    <Tabs.Root className="five" value={tab} onValueChange={(v) => (stop(), setTab(v))}>
      <Tabs.List className="seg five-tabs" aria-label="Pick a life">
        {lives.map((l) => (
          <Tabs.Trigger key={l.id} value={l.id} className="seg-item">
            <LifeMark id={l.id} numeral={l.numeral} /> {l.id === "chosen" ? "Your life" : l.title}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {lives.map((l) => (
        <Tabs.Content key={l.id} value={l.id} className="five-card">
          <p className="five-q label">“Where do you see yourself in five years?”</p>
          <p className="five-a voice">{five[l.id] ?? "…"}</p>
        </Tabs.Content>
      ))}
      <div className="five-actions">
        <button
          className="btn ghost sm"
          onClick={() => {
            void navigator.clipboard?.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "Copied" : "Copy"}
        </button>
        <button className="btn ghost sm" onClick={() => void speak()}>
          <Icon name={speaking === text && text ? "stop" : "speaker"} size={14} /> {speaking === text && text ? (loading ? "Getting the voice…" : "Stop") : "Read it aloud"}
        </button>
        <span className="small faint">About 30 seconds out loud. Practise it once.</span>
      </div>
    </Tabs.Root>
  );
}

function TalkTo({ lives, life, setLife }: { lives: LifeCol[]; life: string; setLife: (l: string) => void }) {
  const startAge = useSim((s) => s.profile?.age ?? 25);
  const endAge = useSim((s) => s.endAge);
  const score = useSim((s) => s.profile?.knowMeScore ?? 0);
  const chat = useSim((s) => s.dialogue);
  const sessionId = useSim((s) => s.sessionId);
  const reader = useReadAloud(sessionId);
  const [age, setAge] = useState(endAge);
  const [text, setText] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const twin = score >= TWIN_THRESHOLD;
  const channel = `talk:${life}:${age}`;
  const thread = chat.filter((c) => c.channel === channel);
  const lifeObj = lives.find((l) => l.id === life) ?? lives[0]!;
  const minAge = life === "chosen" ? startAge + 1 : startAge + 1;

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" });
  }, [thread.length, thread[thread.length - 1]?.text]);

  const send = (t?: string) => {
    const msg = (t ?? text).trim();
    if (!msg) return;
    void sim().sayTo(life, age, msg);
    setText("");
  };

  return (
    <div className="talk-to">
      <div className="talk-pick">
        <div className="seg" role="radiogroup" aria-label="Which life">
          {lives.map((l) => (
            <button key={l.id} role="radio" aria-checked={life === l.id} className="seg-item" data-state={life === l.id ? "on" : "off"} onClick={() => setLife(l.id)}>
              <LifeMark id={l.id} numeral={l.numeral} /> {l.id === "chosen" ? "Your life" : l.title}
            </button>
          ))}
        </div>
        <div className="age-pick">
          <span className="label">At age</span>
          <Slider.Root className="sl-root" value={[age]} min={minAge} max={endAge} step={1} onValueChange={([v]) => setAge(v!)} aria-label="Age">
            <Slider.Track className="sl-track">
              <Slider.Range className="sl-range" />
            </Slider.Track>
            <Slider.Thumb className="sl-thumb" />
          </Slider.Root>
          <span className="age-v data">{age}</span>
        </div>
      </div>
      <div className="thread scroll" ref={box} aria-live="polite">
        {!thread.length && (
          <p className="small faint thread-empty">
            {twin ? `You, at ${age}, in ${lifeObj.id === "chosen" ? "your life" : `“${lifeObj.title}”`}. Ask them something.` : `Write to yourself at ${age}, in ${lifeObj.id === "chosen" ? "your life" : `“${lifeObj.title}”`}. They'll write back.`}
          </p>
        )}
        {thread.map((c) =>
          c.role === "you" ? (
            <div key={c.id} className="t-you">
              <span className="label">You, now</span>
              <p className="voice">{c.text}</p>
            </div>
          ) : (
            <div key={c.id} className={`t-future ${c.form}`} data-streaming={c.streaming}>
              <span className="label">
                You at {c.age} · {lifeObj.id === "chosen" ? "your life" : lifeObj.title}
              </span>
              <p>
                {c.text}
                {c.streaming && <span className="caret" />}
              </p>
              {!c.streaming && c.text.length > 1 && (
                <button className="btn quiet sm t-read" onClick={() => void reader.toggle(c.text)}>
                  <Icon name={reader.speaking === c.text ? "stop" : "speaker"} size={13} /> {reader.speaking === c.text ? (reader.loading ? "Getting the voice…" : "Stop") : c.form === "letter" ? "Read the letter aloud" : "Hear it"}
                </button>
              )}
            </div>
          ),
        )}
      </div>
      {!twin && !thread.length && (
        <div className="chips starters">
          {["Was it worth it?", "What do you wish I'd known at " + startAge + "?", "Write me a letter."].map((t) => (
            <button key={t} className="chip" onClick={() => send(t)}>
              {t}
            </button>
          ))}
        </div>
      )}
      <div className="say-field talk-input">
        <textarea
          className="textarea voice-input"
          rows={2}
          value={text}
          placeholder={twin ? `Ask yourself at ${age} anything…` : `Dear me at ${age}…`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="btn sm send" disabled={!text.trim()} onClick={() => send()} aria-label={twin ? "Send" : "Send the letter"}>
          <Icon name={twin ? "send" : "letter"} size={14} />
        </button>
      </div>
    </div>
  );
}

/** One reading at a time: Gemini TTS in the "future" voice (browser speech as the fallback). */
function useReadAloud(sessionId: string) {
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cur = useRef<Reading | null>(null);
  const token = useRef(0);
  const stop = useCallback(() => {
    token.current++;
    cur.current?.stop();
    cur.current = null;
    setSpeaking(null);
  }, []);
  const toggle = useCallback(
    async (text: string) => {
      if (!text) return;
      const same = speaking === text;
      stop();
      if (same) return;
      const t = ++token.current;
      setSpeaking(text);
      setLoading(true);
      const r = await readAloud(text, sessionId);
      setLoading(false);
      if (t !== token.current) return r.stop();
      cur.current = r;
      void r.done.then(() => {
        if (t === token.current) {
          cur.current = null;
          setSpeaking(null);
        }
      });
    },
    [sessionId, speaking, stop],
  );
  useEffect(() => () => cur.current?.stop(), []);
  return { speaking, loading, toggle, stop };
}
