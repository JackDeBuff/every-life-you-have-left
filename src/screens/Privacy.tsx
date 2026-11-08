/**
 * /privacy: the full privacy notice and terms as a page of its own (D-101), linked from the start
 * screen and shareable. It never opens a game session. If this browser played a life, its
 * "Delete my data" erases it here too.
 */
import { useEffect, useState } from "react";
import { Icon } from "../ui/icons";
import { DeleteData, deleteSessionData } from "../ui/privacy/privacy";
import { PrivacyText } from "../ui/privacy/PrivacyText";

const STORAGE_KEY = "elyl.sessionId"; // src/lib/agent-client.ts

function storedId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export default function PrivacyPage() {
  const [id, setId] = useState<string | null>(storedId);
  useEffect(() => {
    document.title = "Privacy and terms · Every Life You Have Left";
    const t = new URLSearchParams(location.search).get("theme");
    if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
  }, []);
  return (
    <div className="pv-page">
      <header className="pv-page-bar">
        <a className="wordmark" href="/">
          Every Life You Have Left
        </a>
        <a className="btn ghost sm" href="/">
          <Icon name="arrowLeft" size={14} /> Back to the game
        </a>
      </header>
      <main>
        <span className="label">Privacy and terms</span>
        <h1>How we handle your life</h1>
        <PrivacyText />
        <section className="pv-mine" aria-label="Your data in this browser">
          {id ? (
            <>
              <p>This browser has a life on our servers (session code {id.slice(0, 6)}…). You can erase everything about it now.</p>
              <div>
                <DeleteData
                  small={false}
                  run={() => deleteSessionData(id)}
                  after={() => {
                    try {
                      localStorage.removeItem(STORAGE_KEY);
                    } catch {
                      /* storage blocked */
                    }
                    setId(null);
                  }}
                />
              </div>
            </>
          ) : (
            <p>This browser has no life stored with us.</p>
          )}
        </section>
      </main>
    </div>
  );
}
