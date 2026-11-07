/**
 * The play screen (SPEC §1): timeline bar over three panes. One focus at a time: a big decision dims
 * everything but the card. Phone (<820px): world on top, tabs, the chat as a bottom sheet.
 */
import { useEffect, useMemo, useState } from "react";
import { clock } from "../ui/clock";
import { Bio, LeftPane } from "../ui/left/Bio";
import { LifeRose } from "../ui/left/LifeRose";
import { TellMeMore } from "../ui/left/TellMeMore";
import { Interlude } from "../ui/middle/Interlude";
import { Learned } from "../ui/middle/Learned";
import { LifeLog } from "../ui/middle/LifeLog";
import { CurrentWorld } from "../ui/middle/WorldView";
import { setSun } from "../ui/motion";
import { LiveSettings } from "../ui/right/LiveSettings";
import { RightPane } from "../ui/right/Dialogue";
import { sim, useSim } from "../ui/session";
import { SpeedKeys, TimelineBar } from "../ui/timeline/TimelineBar";
import { useUi } from "../ui/uiStore";

export function useMedia(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return m;
}

/** The sun drifts with the playhead's age (gold → coral). */
export function useSunSync() {
  const age = useSim((s) => s.playhead.age);
  const start = useSim((s) => s.profile?.age ?? 25);
  const end = useSim((s) => s.endAge);
  useEffect(() => setSun((age - start) / Math.max(1, end - start)), [age, start, end]);
}

function useAutopilot() {
  useEffect(() => {
    const on = new URLSearchParams(location.search).get("autopilot");
    if (!on) return;
    const id = window.setInterval(() => {
      const s = sim();
      if (useUi.getState().forking) return;
      const d = s.decisions.find((x) => x.status === "pending");
      if (!d) return;
      const card = document.querySelector<HTMLElement>(".dcard");
      if (!card || card.dataset.auto === d.id) return;
      card.dataset.auto = d.id;
      window.setTimeout(() => {
        const k = String(1 + Math.floor(Math.random() * 4));
        window.dispatchEvent(new KeyboardEvent("keydown", { key: k }));
        window.setTimeout(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })), 500);
      }, Number(on) > 10 ? Number(on) : 1400);
    }, 300);
    return () => clearInterval(id);
  }, []);
}

export default function Play() {
  const phone = useMedia("(max-width: 819px)");
  const phase = useSim((s) => s.phase);
  const pendingBig = useSim((s) => s.decisions.some((d) => d.kind === "big" && d.status === "pending"));
  const forking = useUi((s) => s.forking);
  useSunSync();
  useAutopilot();

  useEffect(() => {
    clock.reset();
    clock.start();
    return () => clock.stop();
  }, []);

  const dim = pendingBig && !forking;

  if (phone) return <PhonePlay dim={dim} />;
  return (
    <div className="play" data-dim={dim} data-phase={phase}>
      <TimelineBar />
      <LeftPane />
      <main className="pane middle" data-region="middle" aria-label="Your life">
        <div className="world-wrap">
          <CurrentWorld />
          <MeanwhileOverlay />
        </div>
        {phase === "warmup" ? <Learned /> : <LifeLog />}
      </main>
      <RightPane />
    </div>
  );
}

/**
 * "Meanwhile, in your other lives…" from the end of the fork moment: while the agent writes the
 * branches (phase still "deciding", the card answered) the title holds; the cuts play when they
 * arrive (phase "interlude"). Periodic interludes (1×/2×) just start at "interlude".
 */
function MeanwhileOverlay() {
  const phase = useSim((s) => s.phase);
  const cuts = useSim((s) => s.interlude);
  const pendingBig = useSim((s) => s.decisions.some((d) => d.kind === "big" && d.status === "pending"));
  const lastFork = useSim((s) => s.decisions.findLast((d) => d.kind === "big" && d.status === "answered")?.id ?? "none");
  const forking = useUi((s) => !!s.forking);
  const show = !forking && (phase === "interlude" || (phase === "deciding" && !pendingBig && lastFork !== "none"));
  if (!show) return null;
  return <Interlude key={lastFork} cuts={cuts ?? []} />;
}

function PhonePlay({ dim }: { dim: boolean }) {
  const tab = useUi((s) => s.mobileTab);
  const setTab = useUi((s) => s.setMobileTab);
  const sheetOpen = useUi((s) => s.sheetOpen);
  const setSheet = useUi((s) => s.setSheetOpen);
  const pending = useSim((s) => s.decisions.find((d) => d.status === "pending"));
  const forking = useUi((s) => s.forking);
  const states = useSim((s) => s.status);
  const log = useSim((s) => s.log);
  const lastGuide = useSim((s) => [...s.dialogue].reverse().find((c) => c.channel === "main"));
  // The warm-up's questions hold the sheet open like any card (D-090).
  const warming = useSim((s) => s.phase === "warmup");
  const open = sheetOpen || !!pending || !!forking || warming;
  const tabs = useMemo(() => ["log", "bio", "settings"] as const, []);
  return (
    <div className="phone" data-dim={dim} data-sheet={open}>
      <header className="ph-bar">
        <span className="wordmark">Every Life You Have Left</span>
        <SpeedKeys />
      </header>
      <div className="ph-timeline">
        <TimelineBar />
      </div>
      <div className="world-wrap ph-world">
        <CurrentWorld />
        <MeanwhileOverlay />
      </div>
      <nav className="ph-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t === "log" ? "Log" : t === "bio" ? "Bio" : "Settings"}
          </button>
        ))}
      </nav>
      <div className="ph-body">
        {tab === "log" && (warming ? <Learned /> : <LifeLog />)}
        {tab === "bio" && (
          <div className="ph-bio scroll">
            <Bio />
            <LifeRose states={states} log={log} size={260} />
            <TellMeMore />
          </div>
        )}
        {tab === "settings" && (
          <div className="ph-settings scroll">
            <LiveSettings collapsed={false} />
          </div>
        )}
      </div>
      <section className="sheet" data-open={open} aria-label="Conversation">
        <button className="sheet-handle" onClick={() => setSheet(!sheetOpen)} aria-expanded={open} disabled={!!pending || warming}>
          <span className="grip" />
          {!open && <span className="small sheet-peek">{lastGuide?.text ?? "Conversation"}</span>}
        </button>
        <div className="sheet-body">
          <RightPane />
        </div>
      </section>
    </div>
  );
}
