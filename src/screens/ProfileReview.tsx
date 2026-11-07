import { Placeholder } from "../components/Placeholder";

export default function ProfileReview() {
  return (
    <Placeholder title="What I learned about you" owner="WP3" next={{ to: "questions", label: "Looks right" }} back="uploads">
      <p>Editable cards built from your uploads and answers.</p>
    </Placeholder>
  );
}
