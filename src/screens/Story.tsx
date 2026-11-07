import { Placeholder } from "../components/Placeholder";

export default function Story() {
  return (
    <Placeholder title="Four lives" owner="WP2" next={{ to: "result", label: "Go to 70" }} back="questions">
      <p>The four lives play out year by year, with pauses that re-tune all four.</p>
    </Placeholder>
  );
}
