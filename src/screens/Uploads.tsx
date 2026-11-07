import { Placeholder } from "../components/Placeholder";

export default function Uploads() {
  return (
    <Placeholder title="Anything to start from?" owner="WP3" next={{ to: "profile", label: "Skip, just ask me" }} back="setup">
      <p>Optional: CV PDF, LinkedIn Save to PDF, or an export from your own AI app.</p>
    </Placeholder>
  );
}
