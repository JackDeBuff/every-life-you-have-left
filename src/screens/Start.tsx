/**
 * Start (SPEC §2): first name, age, place, "what's on your mind lately?" (type or hold to talk),
 * speed (Auto pre-selected for judges), optional look + selfie, optional "tell me more", consent.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { endAgeFor } from "../../shared/schema";
import type { Appearance, SpeedMode, StartInput } from "../../shared/sim";
import { fastForward, jumpParams } from "../ui/devJump";
import { HoldToTalk } from "../ui/HoldToTalk";
import { Icon } from "../ui/icons";
import { HAIR, Portrait, SKIN_SWATCHES } from "../ui/left/Portrait";
import { UploadSlots, type AddedDoc, type DocKind } from "../ui/left/TellMeMore";
import { KNOWN_PLACES } from "../ui/mock/life";
import { gsap, reducedMotion } from "../ui/motion";
import { startPortraits } from "../ui/media";
import { backend, sim } from "../ui/session";
import { LongDay } from "../ui/start/LongDay";

const SPEEDS: { id: SpeedMode; key: string; title: string; note: string }[] = [
  { id: "auto", key: "Auto", title: "About 3 minutes", note: "5 big choices. Best for a first look." },
  { id: "4x", key: "4×", title: "Quick", note: "~5 big, ~50 small choices" },
  { id: "2x", key: "2×", title: "Considered", note: "~10 big, ~100 small" },
  { id: "1x", key: "1×", title: "Deep", note: "~20 big, ~200 small. Hours, if you like" },
];

const HAIR_STYLES: NonNullable<Appearance["hairStyle"]>[] = ["short", "medium", "long", "curly", "coily", "shaved", "bun"];
const COUNTRY_NAMES: Record<string, string> = {
  usa: "US", "united states": "US", us: "US", uk: "GB", "united kingdom": "GB", england: "GB", canada: "CA", india: "IN", japan: "JP", germany: "DE", france: "FR",
  spain: "ES", portugal: "PT", italy: "IT", mexico: "MX", brazil: "BR", singapore: "SG", australia: "AU", korea: "KR", "south korea": "KR", china: "CN", nigeria: "NG",
  kenya: "KE", netherlands: "NL", ireland: "IE", thailand: "TH", vietnam: "VN", philippines: "PH", indonesia: "ID",
};

export function parsePlace(raw: string): { city: string; region: string | null; country: string } {
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const city = parts[0] ?? "Somewhere";
  const known = KNOWN_PLACES[city.toLowerCase()];
  if (parts.length === 1) return { city, region: known?.region ?? null, country: known?.country ?? "US" };
  const last = parts[parts.length - 1]!;
  const code = COUNTRY_NAMES[last.toLowerCase()];
  if (code) return { city, region: parts.length > 2 ? parts[1]! : null, country: code };
  if (/^[A-Z]{2}$/.test(last)) return { city, region: last, country: "US" };
  return { city, region: last, country: known?.country ?? "US" };
}

const SAMPLE = {
  name: "Alex",
  age: "25",
  place: "Durham, NC",
  line: "I'm a data analyst at a regional bank. Singapore offered me a transfer and I haven't answered. Money scares me, I still have $28k in loans. If nobody judged me, I'd paint for a living.",
};

export default function Start() {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const demo = params.get("demo") === "alex";
  const [name, setName] = useState(demo ? SAMPLE.name : "");
  const [age, setAge] = useState(demo ? SAMPLE.age : "");
  const [place, setPlace] = useState(demo ? SAMPLE.place : "");
  const [line, setLine] = useState(demo ? SAMPLE.line : "");
  const [via, setVia] = useState<"text" | "voice">("text");
  const [speed, setSpeed] = useState<SpeedMode>("auto");
  const [look, setLook] = useState<Appearance>({ hairStyle: null, hairColor: null, skinTone: null, glasses: null, facialHair: null });
  const [selfie, setSelfie] = useState<{ file: File; url: string } | null>(null);
  const [docs, setDocs] = useState<(AddedDoc & { text: string; file: File | null })[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [adult, setAdult] = useState(demo);
  const [open, setOpen] = useState<"look" | "more" | null>(null);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const ageN = Number(age);
  const ageOk = Number.isInteger(ageN) && ageN >= 18 && ageN <= 100;
  const ready = name.trim().length > 0 && ageOk && place.trim().length > 1 && adult;
  const endAge = ageOk ? endAgeFor(ageN) : 70;
  const hasLook = Object.values(look).some((v) => v !== null);

  useEffect(() => {
    if (reducedMotion() || !rootRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from(".start-hero h1 .ln", { yPercent: 105, duration: 1.1, ease: "expo.out", stagger: 0.09 });
      gsap.from(".start-hero .lede, .longday", { opacity: 0, duration: 1.2, delay: 0.35, ease: "sine.inOut" });
      gsap.from(".start-form > *", { opacity: 0, y: 10, duration: 0.7, delay: 0.25, stagger: 0.05, ease: "expo.out" });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  async function begin() {
    if (!ready || busy) return;
    setBusy(true);
    setErr(null);
    const p = parsePlace(place);
    const input: StartInput = {
      firstName: name.trim().slice(0, 40),
      age: ageN,
      city: p.city,
      region: p.region,
      country: p.country,
      line: line.trim().slice(0, 2000),
      via,
      speed,
      appearance: hasLook ? look : null,
      hasSelfie: !!selfie,
    };
    if (!reducedMotion() && rootRef.current) {
      gsap.to(rootRef.current.querySelectorAll(".start-form > *"), { opacity: 0.4, duration: 0.5, stagger: 0.03 });
    }
    try {
      await sim().start(input);
    } catch {
      setBusy(false);
      setErr("I couldn't reach the life engine. Check the Wi-Fi and try again, or play the offline demo.");
      if (rootRef.current) gsap.to(rootRef.current.querySelectorAll(".start-form > *"), { opacity: 1, duration: 0.3 });
      return;
    }
    // The screen changes when the agent opens the first fork; until then the button says so.
    for (const d of docs) void sim().addDocument(d.kind, d.text, d.file).catch(() => {});
    if (backend() === "live") startPortraits({ sessionId: sim().sessionId, age: ageN, endAge, appearance: input.appearance, selfie: selfie?.file ?? null });
    const j = jumpParams();
    if (j && backend() === "mock") await fastForward(j.age, j.stopAtBig);
  }

  useEffect(() => {
    if (demo && jumpParams()) void begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="start" ref={rootRef}>
      <header className="start-bar">
        <span className="wordmark">Every Life You Have Left</span>
        <span className="label">Triangle AI Hackathon · 2026</span>
      </header>

      <section className="start-hero" aria-labelledby="hero-title">
        <h1 id="hero-title">
          <span className="mask"><span className="ln">Every life</span></span>
          <span className="mask"><span className="ln">you have left.</span></span>
        </h1>
        <p className="lede">
          Tell me who you are and I'll play your life forward to {endAge}, one year at a time. Every big choice splits it. The lives you
          don't choose keep running beside yours.
        </p>
        <LongDay startAge={ageOk ? ageN : 25} endAge={endAge} />
      </section>

      <form
        className="start-form"
        onSubmit={(e) => {
          e.preventDefault();
          void begin();
        }}
      >
        <div className="form-row three">
          <label className="field">
            <span className="label">First name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" placeholder="Alex" maxLength={40} required />
          </label>
          <label className="field">
            <span className="label">Age</span>
            <input className="input data" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" placeholder="25" aria-invalid={age !== "" && !ageOk} required />
          </label>
          <label className="field">
            <span className="label">Where you live</span>
            <input className="input" value={place} onChange={(e) => setPlace(e.target.value)} autoComplete="address-level2" placeholder="Durham, NC" maxLength={80} required />
          </label>
        </div>

        <div className="field">
          <span className="label">
            <span>What's on your mind lately?</span>
            <span className="faint">{via === "voice" ? "Transcribed. Edit anything." : "One line is plenty"}</span>
          </span>
          <div className="say-box">
            <textarea
              className="textarea voice-input"
              rows={3}
              value={line}
              onChange={(e) => setLine(e.target.value)}
              placeholder="A decision you keep circling, something you're scared of, the thing you'd do if nobody judged you…"
              maxLength={2000}
            />
            <div className="say-tools">
              <HoldToTalk
                hint="start"
                onText={(t) => {
                  setLine((l) => (l.trim() ? `${l.trim()} ${t}` : t));
                  setVia("voice");
                }}
              />
            </div>
          </div>
        </div>

        <fieldset className="field speeds">
          <legend className="label">How fast should life go?</legend>
          <div className="speed-grid" role="radiogroup">
            {SPEEDS.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={speed === s.id} className="speed-card" data-on={speed === s.id} onClick={() => setSpeed(s.id)}>
                <span className="led" />
                <span className="speed-key">{s.key}</span>
                <span className="speed-title">{s.title}</span>
                <span className="speed-note">{s.note}</span>
                {s.id === "auto" && <span className="speed-tag">Judges, start here</span>}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="optionals">
          <button type="button" className="opt-head" aria-expanded={open === "look"} onClick={() => setOpen(open === "look" ? null : "look")}>
            <span>How you look</span>
            <span className="faint small">{hasLook || selfie ? "Set" : "Optional · for your portrait"}</span>
            <Icon name={open === "look" ? "caretUp" : "caretDown"} size={14} />
          </button>
          {open === "look" && (
            <div className="opt-body look">
              <Portrait appearance={look} age={ageOk ? ageN : 25} progress={0.1} size={92} />
              <div className="look-controls">
                <div className="field">
                  <span className="label">Hair</span>
                  <div className="chips">
                    {HAIR_STYLES.map((h) => (
                      <button key={h} type="button" className="chip" data-on={look.hairStyle === h} onClick={() => setLook({ ...look, hairStyle: h })}>
                        {h}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <span className="label">Hair colour</span>
                  <div className="swatches">
                    {(Object.keys(HAIR) as (keyof typeof HAIR)[]).map((c) => (
                      <button key={c} type="button" className="swatch" data-on={look.hairColor === c} style={{ background: HAIR[c] }} aria-label={c.replace("_", " ")} title={c.replace("_", " ")} onClick={() => setLook({ ...look, hairColor: c })} />
                    ))}
                  </div>
                </div>
                <div className="field">
                  <span className="label">Skin tone · you choose</span>
                  <div className="swatches">
                    {(Object.keys(SKIN_SWATCHES) as (keyof typeof SKIN_SWATCHES)[]).map((c, i) => (
                      <button key={c} type="button" className="swatch" data-on={look.skinTone === c} style={{ background: SKIN_SWATCHES[c] }} aria-label={`Skin tone ${i + 1} of 6`} onClick={() => setLook({ ...look, skinTone: c })} />
                    ))}
                  </div>
                </div>
                <div className="chips">
                  <button type="button" className="chip" data-on={!!look.glasses} onClick={() => setLook({ ...look, glasses: !look.glasses })}>
                    Glasses
                  </button>
                  <button type="button" className="chip" data-on={!!look.facialHair} onClick={() => setLook({ ...look, facialHair: !look.facialHair })}>
                    Facial hair
                  </button>
                  <label className="chip selfie" data-on={!!selfie}>
                    <input
                      type="file"
                      accept="image/*"
                      capture="user"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setSelfie({ file: f, url: URL.createObjectURL(f) });
                      }}
                    />
                    <Icon name="camera" size={14} /> {selfie ? "Selfie added" : "Add a selfie"}
                  </label>
                </div>
                <p className="small faint">A selfie becomes an illustration in our house style, never a photo. We never guess anything about you from it; the look is what you pick here.</p>
              </div>
            </div>
          )}

          <button type="button" className="opt-head" aria-expanded={open === "more"} onClick={() => setOpen(open === "more" ? null : "more")}>
            <span>Tell me more</span>
            <span className="faint small">{docs.length ? `${docs.length} added` : "Optional · CV, LinkedIn, your AI app"}</span>
            <Icon name={open === "more" ? "caretUp" : "caretDown"} size={14} />
          </button>
          {open === "more" && (
            <div className="opt-body">
              <p className="small muted">The more I know, the more the lives sound like yours, and the sooner future-you can talk back in your own voice.</p>
              <UploadSlots added={docs} onAdd={(kind: DocKind, text, nm, file) => setDocs((d) => [...d.filter((x) => x.kind !== kind), { kind, name: nm, chars: text.length, text, file: file ?? null }])} />
            </div>
          )}
        </div>

        <div className="consent">
          <p className="small">
            <b>We save what you tell us</b>: your answers, voice transcripts, uploads and the lives we make from them. We use them to run this and to
            improve it. Leave out anything you wouldn't want stored.
          </p>
          <label className="check">
            <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
            <span className="box" aria-hidden="true">
              <Icon name="check" size={12} />
            </span>
            <span>I'm 18 or older, and I'm fine with this being saved.</span>
          </label>
        </div>

        {err && (
          <p className="start-err small" role="alert">
            {err}
          </p>
        )}
        <div className="start-go">
          <button className="btn sun go" type="submit" disabled={!ready || busy}>
            {busy ? (
              <>
                Building your first year<span className="dots" aria-hidden="true"><i /><i /><i /></span>
              </>
            ) : (
              <>
                Start at {ageOk ? ageN : "your age"} <Icon name="arrowRight" size={16} />
              </>
            )}
          </button>
          {!demo && !name && (
            <button
              type="button"
              className="btn quiet"
              onClick={() => {
                setName(SAMPLE.name);
                setAge(SAMPLE.age);
                setPlace(SAMPLE.place);
                setLine(SAMPLE.line);
              }}
            >
              Or try it as Alex, 25
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
