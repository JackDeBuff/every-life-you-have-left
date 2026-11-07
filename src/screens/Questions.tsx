import { Placeholder } from "../components/Placeholder";

export default function Questions() {
  return (
    <Placeholder title="Questions" owner="WP3" next={{ to: "story", label: "See my lives" }} back="profile">
      <p>Five questions on the fast path, hold-to-talk on each.</p>
    </Placeholder>
  );
}
