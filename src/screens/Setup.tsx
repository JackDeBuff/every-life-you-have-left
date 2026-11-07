import { Placeholder } from "../components/Placeholder";

export default function Setup() {
  return (
    <Placeholder title="How deep do you want to go?" owner="WP3" next={{ to: "uploads", label: "Continue" }} back="consent">
      <p>Quick (5 questions) or Deep. Voice or text.</p>
    </Placeholder>
  );
}
