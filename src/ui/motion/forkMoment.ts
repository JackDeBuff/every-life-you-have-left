/**
 * The fork moment (docs/UI.md §6): the chosen path continues; the three others lift off the card,
 * tilt, shrink and travel along a curve up to the fork ◆ on the timeline, where they become threads.
 */
import { ROMAN } from "../format";
import { gsap, reducedMotion } from "../motion";

export function playForkMoment(card: HTMLElement, decisionId: string, chosenId: string, titles: Record<string, string>): Promise<void> {
  return new Promise((resolve) => {
    const tiles = [...card.querySelectorAll<HTMLElement>("[data-option]")];
    const chosen = tiles.find((t) => t.dataset.option === chosenId);
    const others = tiles.filter((t) => t !== chosen);
    const marker = document.querySelector<SVGElement>(`[data-fork-marker="${decisionId}"]`);
    const target = marker?.getBoundingClientRect();
    const tx = target ? target.left + target.width / 2 : window.innerWidth / 2;
    const ty = target ? target.top + target.height / 2 : 32;

    if (reducedMotion() || !chosen) {
      gsap.to(others, { opacity: 0.15, duration: 0.25, onComplete: () => void setTimeout(resolve, 500) });
      window.setTimeout(resolve, 1500); // rAF can stall (throttled window): never hold the fork
      return;
    }

    const layer = document.createElement("div");
    layer.className = "fork-layer";
    document.body.appendChild(layer);
    const tl = gsap.timeline({
      onComplete: () => {
        window.clearTimeout(guard);
        layer.remove();
        resolve();
      },
    });
    // GSAP runs on rAF, which a throttled or occluded window can stop. The fork must not hang on
    // it: jump to the end (and complete) if it hasn't finished in time.
    const guard = window.setTimeout(() => {
      if (tl.progress() < 1) tl.progress(1);
    }, 3400);

    // 1. Lock the chosen tile; the others lose colour.
    tl.to(chosen, { scale: 1.015, duration: 0.18, ease: "expo.out" }, 0);
    tl.to(chosen, { scale: 1, duration: 0.4, ease: "expo.out" }, 0.18);
    tl.to(others, { filter: "saturate(0) opacity(0.7)", duration: 0.3, ease: "sine.inOut" }, 0);

    // 2. The unchosen lives peel away toward the fork marker.
    others.forEach((tile, k) => {
      const r = tile.getBoundingClientRect();
      const ghost = tile.cloneNode(true) as HTMLElement;
      ghost.classList.add("fork-ghost");
      Object.assign(ghost.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
      layer.appendChild(ghost);
      const tag = document.createElement("div");
      tag.className = "fork-tag";
      tag.innerHTML = `<span class="numeral">${ROMAN[k]}</span><span>${escapeHtml(titles[tile.dataset.option ?? ""] ?? "")}</span><span class="faint">keeps running</span>`;
      Object.assign(tag.style, { left: `${r.left + 10}px`, top: `${r.top - 22}px` });
      layer.appendChild(tag);

      const sx = r.left + r.width / 2;
      const sy = r.top + r.height / 2;
      const cx = sx + (tx - sx) * 0.25 - 120 + k * 90;
      const cy = Math.min(sy, ty) - 60 - k * 30;
      const p = { t: 0 };
      const at = 0.3 + k * 0.12;
      tile.style.visibility = "hidden";
      tl.fromTo(tag, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.3, ease: "expo.out" }, at);
      tl.to(tag, { opacity: 0, duration: 0.6, ease: "sine.inOut" }, at + 0.7);
      tl.to(ghost, { rotate: k % 2 ? 4 : -4, y: -8, duration: 0.25, ease: "expo.out" }, at);
      tl.to(
        p,
        {
          t: 1,
          duration: 1.05,
          ease: "power2.in",
          onUpdate: () => {
            const t = p.t;
            const x = (1 - t) ** 2 * sx + 2 * (1 - t) * t * cx + t * t * tx;
            const y = (1 - t) ** 2 * sy + 2 * (1 - t) * t * cy + t * t * ty;
            const s = 1 - 0.94 * t;
            gsap.set(ghost, { x: x - sx, y: y - sy, scale: s, opacity: t > 0.85 ? (1 - t) / 0.15 : 1, borderRadius: `${2 + t * 40}px` });
          },
        },
        at + 0.2,
      );
    });

    // 3. A ping at the fork, as the threads draw out of it (TimelineBar draws them).
    const ping = document.createElement("div");
    ping.className = "fork-ping";
    Object.assign(ping.style, { left: `${tx}px`, top: `${ty}px` });
    layer.appendChild(ping);
    tl.fromTo(ping, { scale: 0.2, opacity: 0.9 }, { scale: 3.2, opacity: 0, duration: 0.9, ease: "expo.out" }, 1.45);

    // 4. The chosen tile settles; the card hands back to the dialogue.
    tl.to(chosen, { y: -4, duration: 0.5, ease: "sine.inOut" }, 1.6);
    tl.to(card, { opacity: 0, y: 12, duration: 0.45, ease: "expo.in" }, 1.95);
  });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
