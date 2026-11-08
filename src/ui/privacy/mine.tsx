/** "Delete my data" for the life in this tab (Play, Ending): erase it, then start a fresh session. */
import { Icon } from "../icons";
import { backend, sim, useSim } from "../session";
import { DeleteData, deleteSessionData } from "./privacy";

export async function deleteMyLife(): Promise<void> {
  const id = sim().sessionId;
  if (backend() === "live" && id) await deleteSessionData(id);
}

export function DeleteMyLife({ small = true }: { small?: boolean }) {
  return <DeleteData run={deleteMyLife} after={() => sim().reset()} small={small} />;
}

/** In the play bar: "Incognito" when the life isn't saved, and the delete button (D-101). */
export function PrivacyBits() {
  const privacy = useSim((s) => s.privacy ?? null);
  const live = backend() === "live";
  if (!live) return null;
  return (
    <span className="pv-bits">
      {privacy && !privacy.save && (
        <span className="pv-tag" title="Nothing about this life goes into our database; it erases itself 24 hours after it started.">
          <Icon name="eyeSlash" size={12} /> Incognito
        </span>
      )}
      <DeleteMyLife />
    </span>
  );
}
