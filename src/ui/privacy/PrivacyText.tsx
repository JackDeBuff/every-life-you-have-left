/**
 * The privacy notice and terms (D-101). Every sentence here must stay true to the code:
 * retention and deletion in worker/privacy.ts, encryption in worker/crypto.ts, incognito in
 * worker/agent/session-agent.ts (mirror, expire) and worker/media.ts (keepsFiles), the /admin gate
 * in worker/admin.ts (SHAREABLE). Change the code and this text together.
 */
export const PRIVACY_UPDATED = "November 7, 2026";

export function PrivacyText() {
  return (
    <div className="pv-text">
      <p className="pv-lede">
        This is a hackathon project, not a company. Two people built it in a weekend for the Triangle AI Hackathon at Duke University (November
        6–8, 2026). We are asking you to tell a computer about your life, and that deserves a straight answer about where it all goes. This
        page is that answer. It is long on purpose. Nothing here is hidden in a footnote somewhere else.
      </p>
      <p className="faint small">Last updated {PRIVACY_UPDATED}.</p>

      <h3>The short version</h3>
      <ul>
        <li>You choose, before you start, whether we save your life at all. If you don't, you play in <b>incognito</b>: nothing about you goes into our database, and the session erases itself 24 hours after it starts.</li>
        <li>If you do let us save it, it is <b>deleted automatically 30 days</b> after you started. Uploaded files (CV, LinkedIn PDF, AI-app export), the text we pull out of them and selfies are deleted after <b>7 days</b>, and they are <b>encrypted</b> with our own key before they are stored.</li>
        <li>You can <b>delete everything now</b>, at any time, with one button. It is in the game, on the last screen and on the privacy page (/privacy).</li>
        <li>Separately, you choose whether the two of us may <b>read your saved life</b> to fix and improve the app. If you say no, our admin page does not show it to us.</li>
        <li><b>Nobody trains an AI model on your data.</b> We don't train models at all, and the AI service we use (Google's Gemini on Google Cloud) is contractually not allowed to use it to train theirs.</li>
        <li>No accounts, no email address, no ads, no analytics or tracking scripts, no selling or sharing your data with anyone.</li>
      </ul>

      <h3>Who we are</h3>
      <p>
        Every Life You Have Left is built by Supawich and Paul, a two-person team at the Triangle AI Hackathon. We are the only people who run
        it and the only people who can open its admin page. It is a prototype: it may change, break or be switched off after the event.
      </p>

      <h3>What you give us</h3>
      <p>Only what you type, say or upload. In detail:</p>
      <ul>
        <li><b>The start form:</b> your first name (any name works), your age, your city and country, what's been on your mind, the speed you picked, and, if you set them, how you look (hair, skin tone, glasses, facial hair, gender) and your display currency. We never ask for, guess or use your race or ethnicity.</li>
        <li><b>Your answers:</b> the warm-up questions, every small and big decision you answer (including what you type in your own words), the life settings you nudge, letters and the conversation you have with any version of yourself at the end.</li>
        <li><b>Voice, if you use the microphone:</b> the recording is sent to the AI to be turned into text and then dropped. We keep the text, not the audio.</li>
        <li><b>Optional uploads:</b> a CV, a LinkedIn PDF or an export from an AI app. Text is extracted in your browser where possible; a scanned PDF is read by the AI.</li>
        <li><b>An optional selfie,</b> used once to draw your illustrated portrait.</li>
      </ul>
      <p>
        <b>What we make from it:</b> a profile of you (facts, worries, values and the exact quotes the story cites), each year of the life you
        choose and the up to three lives you didn't, the turning points, money projections, the verdicts at the end, illustrated portraits of
        you at different ages, and spoken lines in a "future you" voice.
      </p>
      <p>
        <b>What we collect without you typing it:</b> very little. Cloudflare tells our server which country a request comes from. Your
        browser keeps a random session code in its local storage so a refresh brings you back to the same life (and so you can delete it). We
        do not store your IP address, we do not set tracking cookies, and there are no third-party analytics, ads or pixels on this site.
      </p>
      <p>
        <b>Please leave out</b> anything you would not want stored, and other people's private details. You can use a made-up name. The lives
        are just as interesting.
      </p>

      <h3>Why we use it</h3>
      <p>
        To run the game: to build your profile, write your years and decisions, draw your portraits and voice your future self. If you agree,
        also to improve it: the two of us may read saved lives to find bugs (a wrong city, a repeated question, a bad cost) and make the next
        version better. That is the whole list. We don't use your data for advertising, we don't build profiles of you outside this game, we
        don't sell it, and we don't share it with anyone except the two service providers below, only so the game can run.
      </p>

      <h3>Your three choices before you start</h3>
      <ol>
        <li><b>I'm 18 or older.</b> Required. This is a game about adult life decisions, and we don't knowingly let minors play.</li>
        <li><b>Save my life for 30 days.</b> Optional. Saved: your life is copied into our database, so it survives a server restart, you can share a postcard of it, and (if you also tick 3) we can look at it to fix things. Not saved: incognito, see below.</li>
        <li><b>Let the team read it to improve the app.</b> Optional, and only possible if you save. If you leave it off, your saved life stays hidden from our admin page.</li>
      </ol>
      <p>Choosing incognito or saying no to the team doesn't make the game any worse. Every feature works, except sharing a postcard link in incognito.</p>

      <h3>Incognito, exactly</h3>
      <ul>
        <li>Nothing you say or that we make about you is written to our database. The life lives only inside its own live session on the server (a Cloudflare Durable Object) while you play.</li>
        <li>Uploaded files and selfies are read in memory and never stored.</li>
        <li>Portraits and voice clips are stored briefly so your browser can load them, and we note only their file names against your session so we can find and delete them.</li>
        <li>24 hours after you start, the session erases itself: its live state, its schedule, those portraits and voice clips, and those file names. You can erase it sooner with Delete my data.</li>
        <li>Sharing a postcard is turned off, because a share link has to be stored to work.</li>
      </ul>

      <h3>Where it goes: our two service providers</h3>
      <p>We don't run our own servers. Two companies process your data for us, under their own terms and security programs:</p>
      <ul>
        <li>
          <b>Cloudflare, Inc.</b> hosts the website and the server code (Cloudflare Workers), runs each live session (Durable Objects), and
          stores saved lives (the D1 database) and files such as portraits and uploads (R2 storage). Cloudflare encrypts these at rest.
          Cloudflare's request logs for our service are kept for a few days; we never write what you type into those logs.
        </li>
        <li>
          <b>Google LLC (Google Cloud)</b> runs the AI. We send it your words, your profile and the life so far each time it writes a year,
          a decision, a portrait or a voice line, through Google Cloud's Vertex AI / Agent Platform using Gemini models (Gemini Flash and
          Flash-Lite for writing, an image model for portraits, and a speech model for the future-you voice; Flash-Lite also turns voice recordings into text). Under Google Cloud's terms for
          this service, Google does not use customer data to train or fine-tune its models without the customer's permission, and we have
          not given it. Google may hold requests briefly to run, cache and protect its service, as its documentation describes.
        </li>
        <li>
          <b>Google Search, once.</b> At the start, the AI may run a Google Search to check public facts about things you named, such as
          your employer, your school or your city, so the story doesn't invent them. Those searches are made by Google from what you wrote.
        </li>
      </ul>
      <p>Requests to both companies may be processed in the United States or wherever their networks run them.</p>

      <h3>How long we keep it</h3>
      <ul>
        <li><b>A saved life:</b> deleted automatically 30 days after you started. A job runs every day and erases the database rows, the files and the live session of every life older than that.</li>
        <li><b>Uploads, their extracted text and selfies:</b> deleted after 7 days, even if the rest of the life is still saved.</li>
        <li><b>An incognito life:</b> erases itself 24 hours after it started.</li>
        <li><b>A shared postcard link:</b> public until the life it came from is deleted (by you, or by the 30-day job), then it stops working.</li>
        <li><b>Our spending ledger</b> (how many dollars of AI the whole app has used each day) has no personal data and is kept.</li>
      </ul>

      <h3>How we protect it</h3>
      <ul>
        <li>Everything between your browser and our server travels over HTTPS or a secure WebSocket.</li>
        <li>Cloudflare encrypts the database and file storage at rest.</li>
        <li>On top of that, uploaded files, the text extracted from them, and selfies are encrypted by our server with AES-256-GCM using a key that only the server holds, before they are stored. A copy of the storage alone doesn't reveal them.</li>
        <li>Your other saved answers and the lives are protected by Cloudflare's encryption at rest, not by our own key. We are telling you so you can decide what to type.</li>
        <li>Our admin page is protected by a passcode only the two of us have, and it only shows lives whose owners said yes to choice 3.</li>
        <li>Portraits and voice clips are served at long, random, unguessable web addresses. Anyone who has one of those exact addresses could open that one picture or clip, so don't post them.</li>
        <li>The API keys for the AI are server-side secrets and never reach your browser.</li>
      </ul>
      <p>No system is perfectly secure. If we ever learn that saved data was exposed, we will say so on this page.</p>

      <h3>Deleting your data</h3>
      <p>
        Press <b>Delete my data</b> (in the game, on the ending screen, or on the privacy page at /privacy in the same browser). It erases, at
        once: every database row about your life, your uploads, selfie, portraits, voice clips and shared postcards, and the live session
        itself. It can't be undone. Because there are no accounts, the random session code in your browser is what identifies your life. If
        you clear your browser's storage first, we can no longer tell which life was yours; the automatic 30-day and 7-day deletions still
        apply.
      </p>

      <h3>Safety</h3>
      <p>
        We check what you type for signs that you might be in crisis. If we see them, the game shows crisis resources (in the US, call or
        text 988). We don't contact anyone and we don't store the check separately from your life. If you are in danger, please contact local
        emergency services.
      </p>

      <h3>Terms of use</h3>
      <ul>
        <li><b>It's a projection, not a prediction.</b> The lives, the statistics and especially the money figures are illustrations built from base rates and an AI's writing. They are not financial, medical, legal, career or any other professional advice. Don't make real decisions on them alone.</li>
        <li><b>The AI can be wrong.</b> It can misread you, invent details or say something that lands badly. Every turning point shows the sentence and the statistic it came from, so you can judge it. No life is ranked best.</li>
        <li><b>18+ only,</b> and only about yourself. Don't upload other people's documents or private details.</li>
        <li><b>Play fair:</b> don't try to break, overload or misuse the service, extract the AI's instructions or other players' data.</li>
        <li><b>Your words stay yours.</b> You give us permission to use what you enter only to run the game and, if you agreed, to improve it.</li>
        <li><b>As is.</b> This is a free hackathon prototype provided without warranties. It may be slow, wrong, changed or switched off at any time, and we can't promise any life will be kept beyond the windows above.</li>
        <li><b>Changes.</b> If we change how we handle data, we'll update this page and its date, and ask again before a new life starts.</li>
      </ul>

      <h3>Questions</h3>
      <p>
        Ask either of us at the Triangle AI Hackathon, or use the event's channels. We'll answer what we do with your data, plainly, the way
        this page tries to.
      </p>
    </div>
  );
}
