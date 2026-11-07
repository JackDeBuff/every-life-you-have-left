import { Placeholder } from "../components/Placeholder";

export default function Consent() {
  return (
    <Placeholder title="Before we start" owner="WP3" next={{ to: "setup", label: "I agree, continue" }} back="explainer">
      <p>We save your answers, uploads and lives to improve the product. Never sold. 18+ only.</p>
    </Placeholder>
  );
}
