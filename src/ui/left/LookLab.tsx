/**
 * /#look-lab: every placeholder-portrait combination on one page, for visual QA and screenshots
 * (docs/fix-shots). Not linked from the product. ?theme=light|dark works as everywhere else.
 */
import { useEffect } from "react";
import type { Appearance } from "../../../shared/sim";
import { HAIR, Portrait, SKIN_SWATCHES } from "./Portrait";

const STYLES: NonNullable<Appearance["hairStyle"]>[] = ["short", "medium", "long", "curly", "coily", "shaved", "bun"];
const TONES = Object.keys(SKIN_SWATCHES) as NonNullable<Appearance["skinTone"]>[];
const COLORS = Object.keys(HAIR) as NonNullable<Appearance["hairColor"]>[];

const look = (a: Partial<Appearance>): Appearance => ({ hairStyle: null, hairColor: null, skinTone: null, glasses: null, facialHair: null, gender: null, ...a });

function Cell({ a, age = 25, caption, size = 120 }: { a: Appearance | null; age?: number; caption: string; size?: number }) {
  return (
    <figure className="ll-cell">
      <Portrait appearance={a} age={age} progress={0.1} size={size} />
      <figcaption className="small faint">{caption}</figcaption>
    </figure>
  );
}

export default function LookLab() {
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const t = q.get("theme");
    if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
    if (q.get("still")) document.documentElement.classList.add("still");
  }, []);
  return (
    <main className="ll">
      <h1 className="label">Look lab · placeholder portraits</h1>

      <section>
        <h2 className="label">Close-ups (300px): neck, collar and shoulders must read as one body</h2>
        <div className="ll-row">
          <Cell size={300} a={look({ hairStyle: "short", skinTone: "tone4", hairColor: "dark_brown" })} caption="short · tone4 · not set" />
          <Cell size={300} a={look({ hairStyle: "long", skinTone: "tone2", hairColor: "brown", gender: "woman" })} caption="long · tone2 · woman" />
          <Cell size={300} a={look({ hairStyle: "short", skinTone: "tone5", hairColor: "black", gender: "man", facialHair: true })} caption="short · tone5 · man · beard" />
          <Cell size={300} age={70} a={look({ hairStyle: "coily", skinTone: "tone6", hairColor: "black", gender: "nonbinary", glasses: true })} caption="coily · tone6 · nonbinary · 70" />
        </div>
      </section>

      <section>
        <h2 className="label">Hair style × skin tone (hair colour cycles)</h2>
        <div className="ll-grid" style={{ gridTemplateColumns: `repeat(${TONES.length}, auto)` }}>
          {STYLES.map((s, si) =>
            TONES.map((t, ti) => {
              const c = COLORS[(si + ti) % COLORS.length]!;
              return <Cell key={`${s}-${t}`} a={look({ hairStyle: s, skinTone: t, hairColor: c })} caption={`${s} · ${t} · ${c.replace("_", " ")}`} />;
            }),
          )}
        </div>
      </section>

      <section>
        <h2 className="label">Hair colours (medium, tone3) and extras</h2>
        <div className="ll-grid" style={{ gridTemplateColumns: `repeat(8, auto)` }}>
          {COLORS.map((c) => (
            <Cell key={c} a={look({ hairStyle: "medium", skinTone: "tone3", hairColor: c })} caption={c.replace("_", " ")} />
          ))}
          {STYLES.map((s, i) => (
            <Cell key={`g-${s}`} a={look({ hairStyle: s, skinTone: TONES[(i + 2) % 6], hairColor: COLORS[i % 8], glasses: true, facialHair: i % 2 === 0 })} caption={`${s} · glasses${i % 2 === 0 ? " · beard" : ""}`} />
          ))}
          <Cell a={null} caption="nothing picked" />
        </div>
      </section>

      <section>
        <h2 className="label">Gender they gave (shoulders + neckline only; hair stays theirs)</h2>
        <div className="ll-grid" style={{ gridTemplateColumns: `repeat(8, auto)` }}>
          {([null, "woman", "man", "nonbinary"] as const).flatMap((g) =>
            (["long", "short"] as const).map((s, i) => (
              <Cell key={`${g}-${s}`} a={look({ gender: g, hairStyle: s, skinTone: i ? "tone5" : "tone2", hairColor: i ? "black" : "brown", facialHair: false })} caption={`${g ?? "not set"} · ${s}`} />
            )),
          )}
        </div>
      </section>

      <section>
        <h2 className="label">Ageing (now, 35, 50, 70)</h2>
        <div className="ll-grid" style={{ gridTemplateColumns: `repeat(8, auto)` }}>
          {(["short", "long", "coily", "bun"] as const).flatMap((s, i) =>
            [25, 40, 55, 70].map((age) => (
              <Cell key={`${s}-${age}`} age={age} a={look({ hairStyle: s, skinTone: TONES[(i * 2 + 1) % 6], hairColor: i % 2 ? "black" : "brown", facialHair: s === "short", glasses: s === "bun" })} caption={`${s} · ${age}`} />
            )),
          )}
        </div>
      </section>

      <section>
        <h2 className="label">Sizes used in the app (start 116, bio 96, ending 78, timeline 40)</h2>
        <div className="ll-row">
          {[160, 116, 96, 78, 40].map((n) => (
            <Cell key={n} size={n} a={look({ hairStyle: "curly", skinTone: "tone4", hairColor: "auburn", glasses: true })} caption={`${n}px`} />
          ))}
        </div>
      </section>
    </main>
  );
}
