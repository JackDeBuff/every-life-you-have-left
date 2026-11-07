/**
 * The shared postcard (D-031, opt-in): exactly what is on the postcard, nothing else. No quotes, no
 * answers, no city of today, no session id. Pure zod: imported by the Worker (worker/share.ts) and
 * the browser (src/ui/ending/share.ts).
 */
import { z } from "zod";

export const ShareLife = z.object({
  /** "You" for the chosen life, "I" / "II" / "III" for the others. */
  numeral: z.string().min(1).max(8),
  title: z.string().min(1).max(80),
  verdict: z.string().max(260),
  you: z.boolean(),
});
export type ShareLife = z.infer<typeof ShareLife>;

/** What the browser sends (POST /api/share). */
export const ShareInput = z.object({
  /** Only to find an earlier share of the same postcard; stored privately, never shown. */
  sessionId: z.string().max(80).nullable(),
  firstName: z.string().max(40).nullable(),
  endAge: z.number().int().min(18).max(120),
  endYear: z.number().int().min(2000).max(2200),
  /** Where you are at the end age (the postcard's "Greetings from"). */
  place: z.string().max(80),
  lives: z.array(ShareLife).min(1).max(4),
  /** The five-year answer for your life. */
  fiveYear: z.string().max(1600).nullable(),
  /** Same-origin portrait URL (/media/portraits/...). The Worker copies it under the share; the URL itself is never stored. */
  portraitUrl: z.string().max(300).nullable(),
});
export type ShareInput = z.infer<typeof ShareInput>;

/** What is stored in D1 (postcard_shares.card_json) and rendered at /s/<id>. */
export const ShareCardV2 = ShareInput.omit({ sessionId: true, portraitUrl: true }).extend({
  v: z.literal(2),
  /** R2 key under shares/<id>/ (or null). */
  portraitKey: z.string().nullable(),
});
export type ShareCardV2 = z.infer<typeof ShareCardV2>;

export interface ShareCreated {
  ok: true;
  id: string;
  /** Absolute: what the QR code encodes. */
  url: string;
  /** Lets this browser attach the postcard image once (PUT /api/share/<id>/postcard). */
  token: string;
}
