# Overnight status (lead's working notes, Sat Nov 7)

The owner is asleep from ~6:30am and wants a finished, bug-fixed V1 when they wake up.
Live: https://every-life-you-have-left.supawich.workers.dev

## Owner's standing instructions
- **Usage watch:** if the 5-hour usage window reaches **92%**, tell every working agent to commit its work and
  pause. Resume them after the window resets (it resets at 8:40am ET). Check with `codexbar usage --provider claude --json-only`
  (primary.usedPercent) or the get_usage tool.
- **Deploys:** the owner allowed agents to run `npm run deploy` (a local allow rule), but the auto-mode classifier
  sometimes still blocks it. Don't route around a block; queue the commit for the owner to deploy.
- **Commits:** author Supawich Puengdang, with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Merged on main
| Workstream | Commit |
|---|---|
| WP0 scaffold | — |
| Foundation | — |
| 3D world | — |
| UI | — |
| AI engine | — |
| Integration | 29a2c96 |
| UX fixes (look art, gender, LinkedIn help, currency, known plans) | 1eb9e6c |
| D-089 / D-090 recorded | — |

## Update ~6am
| Item | Commit / version |
|---|---|
| Merged: layout | b51b5bb |
| Merged: quality | 3a1deda |
| Deployed main | 58ab0d8d |

- Only the lead deploys from now on.
- Quality cut 1× small decisions to 45, but the owner wanted ~200 (deep mode). **Raise 1× back** (e.g. ~120–150) in the D-089 wave.
- D-090 warm-up agent launched.
- Waiting: the engine-content agent, then the D-089 batching agent (it owns decisions.ts after content merges), then the delighters, then the final QA pass.

## Running when the owner went to sleep (merge their branches when they report)
| Agent | Scope |
|---|---|
| Quality | Auto timing, first-card latency, 2× pacing, moments, money spread. Plus from the owner and the inspector: slide while typing, slide spam, the 2× lockup (BLOCKER), timers during the interlude, net worth showing $0, log order, the ending at 68, money inflation after moving abroad |
| Right-pane layout | Settings overflow, the decision card hidden behind the settings, slider nudge spam, postcard truncation, Enter un-picking, mic-blocked note |
| Engine content | Decision continuity, people ledger (ages/counts/pets), stale Work line, repetition, fork copy, today's date in context |

## Next wave (after the three above merge)
1. **D-090:** required adaptive warm-up (up to 5 questions in every mode, skipping what uploads or the start line already answer).
2. **D-089:** batch small questions; small answers don't rewrite the buffered future; batch the answer folding; prompts with a stable prefix first.
3. **Judge delighters** (from the inspector):
   - "Your words did this" on the ending (3 quotes, each linked to its turning point)
   - a QR code on the postcard
   - a distinct landmark per branch in the 3D interlude
4. **Final:** a fresh QA inspector pass on production, a deploy (owner if blocked), and a morning report for the owner with screenshots.
5. **Later (Saturday with Paul):** pitch kit, Devpost, the README, and the D-070 cleanup on Sunday.

## V1 done (~10:20am Sat): production 610e7f4b, main d3f5ff7
- **Merged since 6am:**
  - warm-up (D-090)
  - batching + 1× depth (D-089)
  - the "never invent a quote" guard (0127d26)
  - judge delighters ("your words did this", share + QR on `/s/<id>` with D1 `postcard_shares`, branch landmarks)
  - pacing fixes (small cards at 1×/2×, even forks, fast interludes)
  - engine QA fixes (fork continuity, own-words branches, people ledger, money anchors)
- **Production Auto judge-run (scripted, 4 s reads, persona maya):** 146.6 s, 5 forks, fork→resume median 7.3 s, $0.37 (old prices; ≈ $0.55–0.6 real, D-098), no errors.
- **Open / rough:**
  - Hidden branches still rewrite their own fork year.
  - The share OG image depends on the client's PNG upload.
  - Base rates are US-only (labeled).
  - 3D fps not measured on a MacBook Air.
  - Reduced-motion not browser-tested.
- **Saturday with Paul:**
  - real-user testing via `/admin` (ADMIN_PASSCODE in `.dev.vars`)
  - the D-044 before/after study
  - the pitch kit (Devpost, 2-min video, deck, product README)
  - the Sunday D-070 cleanup
