/**
 * Eight synthetic personas for the engine eval: ages 19-58, US and non-US, varied money, family
 * and worries. Each has the start line (what they'd type at "What's on your mind lately?"),
 * optional documents, and a hidden "truth" the user simulator uses to answer decisions in their
 * voice. All fictional.
 */
import type { DocInput } from "../../shared/engine";
import type { StartInput } from "../../shared/sim";

export interface Persona {
  key: string;
  input: StartInput;
  docs: DocInput[];
  /** Hidden background + how they answer (for the user simulator only, never shown to the engine). */
  truth: string;
  voice: string;
}

const base = { via: "text" as const, speed: "auto" as const, appearance: null, hasSelfie: false, currency: null };

export const PERSONAS: Persona[] = [
  {
    key: "maya-19-columbus",
    input: {
      ...base, firstName: "Maya", age: 19, city: "Columbus", region: "OH", country: "US",
      line: "I'm a sophomore at Ohio State doing pre-nursing because my parents think it's the safe choice, but I spend every free hour in the ceramics studio. My parents run a restaurant and I still work weekends there. I don't know how to tell them I might switch majors.",
    },
    docs: [],
    truth: "First-generation college student; parents own a small Vietnamese restaurant and sacrificed a lot. Tuition covered partly by loans ($12k so far). Close to her younger brother Tuan (15). Secretly applied to a summer ceramics residency. Loves her parents, hates disappointing them, leans careful but wants to be brave.",
    voice: "Earnest, slightly anxious, long sentences, says 'honestly' and 'I guess'. Lowercase sometimes.",
  },
  {
    key: "dani-24-lagos",
    input: {
      ...base, firstName: "Dani", age: 24, city: "Lagos", region: null, country: "NG",
      line: "Everyone I graduated with is leaving the country. I have an offer from a fintech in London that pays four times what I make here, but I'm the one paying my two sisters' school fees and my mum would be alone.",
    },
    docs: [
      {
        kind: "cv",
        text: "Daniel Okafor. Software Engineer, Paystack-style payments startup, Lagos (2023-present). Built the reconciliation service handling 2M transactions a day. B.Sc. Computer Science, University of Lagos, 2023. Side project: open-source Yoruba keyboard app with 40k downloads. Skills: Go, TypeScript, Postgres, Kubernetes.",
      },
    ],
    truth: "Earns about $14k/yr, sends $300/month home. Father passed away when he was 16 (do not mention unless asked). Has a girlfriend, Tolu, who wants to stay in Lagos. Ambitious, practical, proud of the keyboard app.",
    voice: "Direct, dry humour, short sentences, sometimes Nigerian English ('abeg', 'sha').",
  },
  {
    key: "priya-27-bengaluru",
    input: {
      ...base, firstName: "Priya", age: 27, city: "Bengaluru", region: "Karnataka", country: "IN",
      line: "My parents have started sending me profiles of men every week and I keep saying I'm busy with work. The truth is I'm not sure I want to get married at all, and I've been looking at a design master's in Berlin.",
    },
    docs: [],
    truth: "Product manager at a large IT services company, ~$32k/yr, comfortable by local standards, lives with a flatmate. Only child. Parents in Pune, retired teachers. Has savings of ~$20k. Fears disappointing parents more than fears being alone.",
    voice: "Wry, self-aware, precise, uses dashes. Never uses exclamation marks.",
  },
  {
    key: "marcus-31-atlanta",
    input: {
      ...base, firstName: "Marcus", age: 31, city: "Atlanta", region: "GA", country: "US",
      line: "Jess wants to start trying for a baby next year and I keep changing the subject. I teach 9th grade history, I still have $45k in student loans, and I honestly don't know if we can afford a kid or if I'm just scared.",
    },
    docs: [],
    truth: "Married to Jess (nurse) for 3 years, renting a 2-bed in Decatur. Combined income ~$120k. He coaches the debate team and loves it. His own dad left when he was young; he's afraid of being that kind of father. Leans careful but loves Jess deeply.",
    voice: "Warm, honest, a bit rambling, teacher-ish analogies.",
  },
  {
    key: "lucia-36-valencia",
    input: {
      ...base, firstName: "Lucía", age: 36, city: "Valencia", region: null, country: "ES",
      line: "Since the divorce it's just me and Leo, he's eight. I'm an architect and the hours are killing me. A school here offered me a job teaching technical drawing: less money, home by four every day.",
    },
    docs: [],
    truth: "Earns ~€38k ($41k) at a mid-size studio; teaching job pays ~€27k. Shared custody, ex-husband Javier is decent but unreliable. Her mother helps with pickups. Dreams of designing one building of her own someday. Owns a small flat with a mortgage.",
    voice: "Tired but funny, practical, mixes in a Spanish word now and then.",
  },
  {
    key: "kenji-42-osaka",
    input: {
      ...base, firstName: "Kenji", age: 42, city: "Osaka", region: null, country: "JP",
      line: "I've been at the same electronics company for nineteen years. I'm tired in a way that sleep doesn't fix. My parents in Kochi are getting older and my wife says we should think about moving closer to them, but the kids have their schools here.",
    },
    docs: [
      {
        kind: "ai_export",
        text: "- You're 42, a section manager in product QA at a large electronics company in Osaka. - Married to Aiko, two kids: Haruto (15) and Mei (12). - You've mentioned working until 9pm most nights and feeling guilty about missing Mei's piano recitals. - You want to learn woodworking and once said you'd love to open a small furniture workshop. - Worried about: your father's health and memory, your own energy, whether you'll be pushed out in the next restructuring. - Guess (never said directly): you feel you've been living someone else's plan.",
      },
    ],
    truth: "Income ~$62k. Owns a condo with a mortgage. Very loyal, conflict-avoidant. His father (76) is getting forgetful. Aiko works part-time at a pharmacy.",
    voice: "Formal, restrained, short sentences, understated emotions.",
  },
  {
    key: "denise-50-phoenix",
    input: {
      ...base, firstName: "Denise", age: 50, city: "Phoenix", region: "AZ", country: "US",
      line: "Both my kids are out of the house now and I don't know who I am when I'm not running everything. I've been an ER nurse for 24 years. Part of me wants to do travel nursing and see the country, part of me thinks I should just keep my pension safe.",
    },
    docs: [],
    truth: "Divorced 8 years ago, owns a house with $140k left on the mortgage, $310k in retirement savings, income ~$98k. Kids: Jordan (24, in Denver) and Kayla (21, college in Tucson). Her mother (77) lives nearby and needs more help lately. Has a close friend Rhonda from nursing school.",
    voice: "Blunt, funny, no-nonsense, ER humour.",
  },
  // Two personas shaped like the QA inspector's live sessions (Sat Nov 7): a move between cities
  // with a dog (Jordan), and teenagers with stated ages plus a retirement plan (Marisol).
  {
    key: "jordan-21-pittsburgh",
    input: {
      ...base, firstName: "Jordan", age: 21, city: "Pittsburgh", region: "PA", country: "US",
      line: "I'm a senior in CS at CMU. A startup in San Francisco offered me a job after graduation, but I also got into the robotics master's here. My dad and my younger sister are in Pittsburgh, and I just adopted a dog, Barnaby. I keep flip-flopping.",
    },
    docs: [],
    truth: "Graduates in May 2027. Single. Dad is a bus mechanic, sister Casey is 16. $18k in loans. Loves building things, hates feeling like he's abandoning his family. Leans toward the startup but feels guilty.",
    voice: "Casual, quick, a bit self-deprecating, says 'honestly' and 'idk'.",
  },
  {
    key: "marisol-52-quezon",
    input: {
      ...base, firstName: "Marisol", age: 52, city: "Quezon City", region: null, country: "PH",
      line: "I've been a nurse at the same clinic in Quezon City for 28 years. Bea is 16 and Paolo is 19 and just started university. My mother lives with us. A recruiter keeps emailing about nursing jobs in London, but I'm tired and I want to retire by 60.",
    },
    docs: [],
    truth: "Widowed 6 years ago (do not mention). Head nurse, ~$9k/yr, supports both kids' schooling. Close friend Joy from nursing school; sister Tess sends money from Cebu. Wants rest but fears being useless.",
    voice: "Warm, practical, mixes in a Tagalog word now and then ('anak', 'hay naku').",
  },
  {
    key: "tom-58-leeds",
    input: {
      ...base, firstName: "Tom", age: 58, city: "Leeds", region: "England", country: "GB",
      line: "The factory's announced redundancies and I'm on the list, probably. 34 years. Sue says take the payout and finally do the boat, I've been restoring an old narrowboat in my mate's yard for years. Part of me thinks I'm too old to start anything.",
    },
    docs: [],
    truth: "Production manager, ~£46k ($58k). Married to Sue (56, school receptionist). Two grown kids, a grandson (2). Mortgage nearly paid off. Pension modest. Practical, proud, worries about being useless.",
    voice: "Northern English, plain, understated, says 'aye' and 'love' occasionally.",
  },
  // Content feedback (Sat Nov 7 playtests), made-up people. Noor: a warm answer with one honest
  // admission in it; the life must not turn it into "a lonely life" (charitable reading).
  {
    key: "noor-29-montreal",
    input: {
      ...base, firstName: "Noor", age: 29, city: "Montreal", region: "QC", country: "CA",
      line: "I'm moving to Toronto in March for a new job at a hospital lab, so these last months are about my friends here: Sunday hikes on the mountain, the Thursday dinner rotation, helping Camille move. There were some lonely stretches my first year in Montreal, I won't pretend there weren't, but these people turned the city into home and I want to leave properly, grateful.",
    },
    docs: [],
    truth: "Medical lab technologist, ~CA$72k. Single, happy about it for now. Parents in Ottawa, a younger brother Sami (24). Best friend Camille. Loves trail running and cooking for people. Optimistic, sentimental, not lonely now.",
    voice: "Warm, upbeat, a little sentimental, uses 'honestly' and full sentences.",
  },
  // Ines: works from home for a real employer (grounding must not move her to its HQ campus),
  // and a life that is NOT mostly about career: a documentary practice, parents abroad, a visa.
  {
    key: "ines-33-durham",
    input: {
      ...base, firstName: "Ines", age: 33, city: "Durham", region: "NC", country: "US",
      line: "I'm a UX researcher at SAS and I work fully remote from my apartment in Durham. On weekends I shoot short documentaries with two friends; one just got into a small festival. My parents are in Porto and my dad keeps asking when I'm coming back. My work visa renews next year, which always makes me nervous.",
    },
    docs: [],
    truth: "Portuguese, on an H-1B, ~$115k. Partner Ravi (35, a teacher) for two years, not living together yet. Saves for a camera and a festival trip. Calls her parents every Sunday. Loves the documentaries more than the job, but the job pays for them.",
    voice: "Thoughtful, dry, a bit self-deprecating; short paragraphs.",
  },
];
