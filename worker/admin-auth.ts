/** The /admin passcode check (ADMIN_PASSCODE secret), shared by worker/admin.ts and the SessionAgent's admin reads. */

/** Constant-time-ish compare. An unset ADMIN_PASSCODE never matches. */
export function passcodeOk(given: unknown, want: string | undefined): boolean {
  const g = typeof given === "string" ? given : "";
  const w = want ?? "";
  let diff = g.length ^ w.length;
  for (let i = 0; i < Math.max(g.length, w.length); i++) diff |= (g.charCodeAt(i) || 0) ^ (w.charCodeAt(i) || 0);
  return !!w && diff === 0;
}
