# Rules for the overnight build agents (Sat Nov 7)

Read before working:
1. `CLAUDE.md`
2. `docs/SPEC.md` (the design, final)
3. `shared/sim.ts` and `shared/engine.ts` (the contracts)
4. the v2 section at the top of `DECISIONS.md`

Older docs and prototypes describe rejected visuals. Use them only for content rules and data.

## Working copy and git
- You run in **your own git worktree on your own branch**. Commit early and often there, in small logical commits.
  - Author: `-c user.name="Supawich Puengdang" -c user.email="supawich@gmail.com"`.
  - End every message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Do not** merge into `main` and do not push. The lead merges your branch.
- Run `npm install` first. Add dependencies with `npm install <pkg>@<exact version>`; lockfile conflicts get resolved at merge.
- **Stay inside your folders** (listed in your brief). Do not change `shared/sim.ts` or `shared/engine.ts`. If a contract truly blocks you, add a clearly marked `// CONTRACT-REQUEST:` comment in your own code, work around it, and mention it in your report.

## Secrets and cloud
- If you need Gemini, copy `/Users/supawich/Projects/every-life-you-have-left/.dev.vars` into your worktree root. It is gitignored. Never print, log or commit any key.
- Gemini on Agent Platform:
  - header `x-goog-api-key: $GCP_API_KEY`
  - URL `https://aiplatform.googleapis.com/v1/projects/triangle-ai-hack-2026/locations/global/publishers/google/models/<model>:generateContent` (or `:streamGenerateContent?alt=sse`)
  - gpt-oss uses `.../locations/global/endpoints/openapi/chat/completions` with model `openai/gpt-oss-120b-maas`
- Shell: zsh. Write `${VAR}:x`, never `$VAR:x`. Use `/usr/bin/curl` when you need raw response bodies.
- **Only the Foundation agent deploys** to `every-life-you-have-left.supawich.workers.dev`. Everyone else tests locally (`npm run dev` / vite).

## Quality bar
- This is the expo product. Judges use it.
- TypeScript strict. `npm run typecheck` must pass on your branch.
- No emoji in UI (use the better-icons MCP for icons). Respect `prefers-reduced-motion`.
- Verify visually in the built-in browser (`mcp__Claude_Browser__*` tools, in your own tab). Do not use Claude in Chrome.
- When done, reply with ≤250 words:
  - what works
  - how to see it (URL/route)
  - what's mocked
  - what's rough
  - any CONTRACT-REQUESTs
