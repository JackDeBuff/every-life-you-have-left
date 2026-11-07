/** The "why" behind a turning point: your exact words + a real base rate with its source (D-013). */
import * as Popover from "@radix-ui/react-popover";
import type { ReactNode } from "react";
import { getBaseRate } from "../../../shared/baseRates";
import { DOMAINS } from "../../../shared/domains";
import type { LogLine } from "../../../shared/sim";
import { Icon } from "../icons";
import { famVar } from "../left/LifeRose";
import { useSim } from "../session";
import { useUi } from "../uiStore";

export function WhyBody({ line, onClose }: { line: LogLine; onClose?: () => void }) {
  const quote = useSim((s) => (line.why ? s.profile?.quotes.find((q) => q.id === line.why!.quoteId) : undefined));
  const country = useSim((s) => s.profile?.country ?? "US");
  const showQuote = useUi((s) => s.showQuote);
  const rate = line.baseRate ? getBaseRate(line.baseRate.statId) : undefined;
  return (
    <div className="why">
      <p className="label why-head">
        {line.domain && <span className="why-tick" style={{ background: famVar(DOMAINS[line.domain].family) }} />}
        Why · {line.age}
      </p>
      {quote && (
        <figure className="why-quote">
          <blockquote className="voice">
            <mark>“{quote.shortForm ?? quote.text}”</mark>
          </blockquote>
          <figcaption className="small faint">You said this{quote.source === "answer" ? "" : ` (from your ${quote.source.replace("_", " ")})`}.</figcaption>
        </figure>
      )}
      {line.why && <p className="small">{line.why.reason}</p>}
      {rate && (
        <div className="why-rate">
          <p className="small">{rate.display}</p>
          <p className="meta faint">
            <a href={rate.url} target="_blank" rel="noreferrer">
              {rate.source}
            </a>
            {country !== "US" ? " · US data, applied as approximate" : ""}
          </p>
        </div>
      )}
      {quote && (
        <button
          className="btn ghost sm"
          onClick={() => {
            showQuote(quote.id);
            onClose?.();
          }}
        >
          <Icon name="quotes" size={13} /> Show where you said it
        </button>
      )}
    </div>
  );
}

export function WhyPopover({ line, children }: { line: LogLine; children: ReactNode }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="pop why-pop" side="top" align="start" sideOffset={6} collisionPadding={12}>
          <WhyBody line={line} />
          <Popover.Close className="pop-x" aria-label="Close">
            <Icon name="x" size={14} />
          </Popover.Close>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
