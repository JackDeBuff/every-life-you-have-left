/**
 * Is the user busy with the right pane (reading, scrolling, pointing, typing, choosing)? A small
 * decision's "let it slide" countdown only runs while they are idle (owner, Sat Nov 7: cards slid
 * while being read). Behaviour only: listens at the document, reads no layout.
 *
 *   rightPaneBusy(card)   true while any interaction with the right pane (or the phone sheet)
 *                         happened in the last IDLE_MS, a dropdown is open, the pointer rests on
 *                         the card, or focus is inside the card
 *   typingInSmallCard()   focus is in a small card's say-more box (the clock holds while it is)
 */

/** The countdown resumes this long after the last interaction. */
export const IDLE_MS = 4000;

let lastActivity = 0;
const PANES = ".pane.right, .sheet";
// Radix portals (select / popover content) live outside the pane.
const POPPERS = "[data-radix-popper-content-wrapper], [role=listbox], [role=menu], [role=dialog]";

function inPane(t: EventTarget | null): boolean {
  return t instanceof Element && !!t.closest(`${PANES}, ${POPPERS}`);
}

if (typeof document !== "undefined") {
  const mark = (e: Event) => {
    if (inPane(e.target)) lastActivity = performance.now();
  };
  // Capture phase: scroll doesn't bubble, and a pane may stop propagation.
  for (const type of ["pointermove", "pointerdown", "wheel", "touchstart", "scroll", "keydown", "input", "focusin"]) {
    document.addEventListener(type, mark, { capture: true, passive: true });
  }
}

export function dropdownOpen(): boolean {
  return typeof document !== "undefined" && !!document.querySelector("[data-radix-popper-content-wrapper], [role=listbox]");
}

export function rightPaneBusy(card: Element | null): boolean {
  if (performance.now() - lastActivity < IDLE_MS) return true;
  if (dropdownOpen()) return true;
  if (!card) return false;
  try {
    if (card.matches(":hover")) return true;
  } catch {
    /* :hover unsupported: ignore */
  }
  return !!document.activeElement && card.contains(document.activeElement) && document.activeElement !== document.body;
}

export function typingInSmallCard(): boolean {
  const a = typeof document !== "undefined" ? document.activeElement : null;
  return !!a && a.tagName === "TEXTAREA" && !!a.closest('.dcard[data-kind="small"]');
}
