import type { ComponentType } from "react";
import { SCREENS, useRouter, type Screen } from "./lib/router";
import Admin from "./screens/Admin";
import Consent from "./screens/Consent";
import Explainer from "./screens/Explainer";
import Letters from "./screens/Letters";
import ProfileReview from "./screens/ProfileReview";
import Questions from "./screens/Questions";
import Result from "./screens/Result";
import Setup from "./screens/Setup";
import Story from "./screens/Story";
import Uploads from "./screens/Uploads";

const VIEWS: Record<Screen, ComponentType> = {
  explainer: Explainer,
  consent: Consent,
  setup: Setup,
  uploads: Uploads,
  profile: ProfileReview,
  questions: Questions,
  story: Story,
  result: Result,
  letters: Letters,
  admin: Admin,
};

export default function App() {
  const { screen, go } = useRouter();
  const View = VIEWS[screen];
  return (
    <div className="shell">
      <View />
      {import.meta.env.DEV && (
        <nav className="devnav" aria-label="Dev screens">
          {SCREENS.map((s) => (
            <button key={s} aria-current={s === screen ? "page" : undefined} onClick={() => go(s)}>
              {s}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
