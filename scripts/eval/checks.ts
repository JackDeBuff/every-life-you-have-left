/** Contract checks on generated years: zod SimYear + shared/validate.ts checkLife invariants. */
import type { Profile } from "../../shared/schema";
import { SimYear } from "../../shared/sim";
import { checkLife } from "../../shared/validate";

export function checkYearsContract(years: SimYear[], profile: Profile): string[] {
  const errs: string[] = [];
  years.forEach((y) => {
    const r = SimYear.safeParse(y);
    if (!r.success) errs.push(`${y.year}: ${r.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  });
  errs.push(...checkLife({ key: "path", title: "Your Path", tagline: "", verdictAt70: "", years }, profile));
  return errs;
}
