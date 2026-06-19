# No Bull — Project Specification (CLAUDE.md)

## What this document is

This is the persistent spec for building **No Bull**, a project for the Mind the Product "Everyone Ships Now" / World Product Day hackathon (submission deadline: June 20, 5:00 PM GMT).

Claude Code should treat this file as the source of truth across every session. The workflow is:
1. Sam opens Claude Code in **plan mode** for a specific session (sessions are listed below).
2. Claude Code proposes a plan for that session only.
3. Sam compares the plan against this file to confirm scope match before approving.
4. Implementation happens. This file gets a short "session log" entry appended at the bottom once a session ships (Claude Code should do this automatically at the end of each session — see "Session log" at the end of this file).

Do not implement scope from a future session early, even if it seems convenient. Each session should be independently demoable and committable.

---

## 1. Product summary

**Name:** No Bull

**One-liner:** Stress-test your decisions and ideas against reality, not a yes-man.

**Positioning:** No Bull is a decision/idea stress-testing tool. The user pastes in an idea, strategic decision, or assumption they want pressure-tested. Instead of a single LLM call that tends to validate whatever the user already believes (a well-documented, evidenced phenomenon called AI sycophancy), No Bull runs the input through a pipeline specifically engineered to resist that tendency, and separately checks the output for hallucinated/unsupported claims.

The user-facing framing leads with the *outcome* ("stress-test your idea") not the mechanism. The anti-sycophancy/anti-hallucination engineering is the differentiator, explained in an "How this works" / "Why this is different" section, not the headline.

**Target user:** Product people, founders, and operators making a non-trivial decision (pricing call, roadmap bet, "should I build this") who want a second opinion that won't just tell them what they want to hear. This is explicitly the Mind the Product community — product managers and founders are the primary persona for demo purposes.

**Out of scope for this build:** user accounts/auth, billing, saved history across sessions, team/collaboration features, mobile app. This is a single-session, stateless-by-design tool (statelessness is also a deliberate anti-sycophancy design choice — see Section 3).

---

## 2. Why this product exists (evidence summary — for context, not to be shown verbatim in-app)

This section exists so Claude Code understands *why* specific engineering choices are non-negotiable, not just *what* to build. Do not skip steps below because they seem like "extra" engineering — they are the product's core value proposition.

- AI sycophancy (LLMs favouring user-affirming responses over critical engagement) is a documented, acknowledged industry problem, including OpenAI's own April 2025 GPT-4o sycophancy rollback and a March 2026 Stanford *Science* paper showing AI affirms user actions 49% more than humans do across 11 frontier models, even when the action involves deception or harm.
- The single highest-leverage, evidence-backed mitigation found is **converting a stated-opinion prompt into a neutral question before the model answers it**. A UK AI Security Institute controlled study (GPT-4o, GPT-5, Claude Sonnet 4.5) found this closes a 24-percentage-point sycophancy gap and outperforms simply instructing the model "don't be sycophantic."
- A close second is the **"could you be wrong?" metacognitive follow-up**, shown to reliably surface hidden counter-evidence, biases, and alternatives across GPT-4o, Claude Sonnet 4, Gemini 2.5 Pro, and DeepSeek-R1.
- **Memory/persisted context measurably increases sycophancy** (multiple independent studies). This is why No Bull is deliberately stateless per session — no conversation memory, no saved user profile feeding into prompts.
- **Same-model self-critique is weak**; cross-model critique with external grounding (web search) performs better. This is why the hallucination-check step uses a different model than the one that generated the original response, and why narrow per-claim verification outperforms a single open-ended "review this" call.
- **Devil's-advocate framing**, validated in human-subjects decision-making studies, is a distinct lever from fact-checking — it generates the strongest counter-case rather than verifying facts.

Full primary sources are listed in Section 9.

---

## 3. Core pipeline architecture

This is the heart of the product. Every session that touches the pipeline must preserve this exact shape unless a later session explicitly revises this spec.

```
User input (raw idea/decision text)
        │
        ▼
┌─────────────────────────────────┐
│ STAGE 1: Prompt Reframe          │  (Anthropic API call)
│ - Detect if input is already a   │
│   neutral question               │
│ - If not: rewrite as a           │
│   pronoun-less, stance-free      │
│   question                       │
│ - Strip embedded preference      │
│   framing ("is X good?" →        │
│   "what are the tradeoffs of X?")│
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ STAGE 2: Structured Stress Test   │  (Anthropic API call)
│ - Apply a reasoning scaffold:     │
│   force explicit counter-         │
│   hypotheses / base rates /       │
│   false-premise check BEFORE      │
│   reaching a conclusion           │
│ - Output: structured response     │
│   (see Section 5 for fields)      │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ STAGE 3: Could-You-Be-Wrong Pass │  (Anthropic API call, same convo)
│ - Forced follow-up: "List every  │
│   specific way this analysis     │
│   could be wrong, including      │
│   weak evidence that may have    │
│   been under-emphasized."        │
│ - Do NOT accept "yes I could be  │
│   wrong" as a complete answer —  │
│   prompt explicitly demands the  │
│   itemized list in one shot      │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ STAGE 4: Devil's Advocate Pass   │  (OpenAI API call — DIFFERENT      │
│ - Separate call, different       │   model from Stage 1-3, by design) │
│   provider, instructed to        │
│   build the strongest case       │
│   AGAINST the idea/decision,     │
│   using only evidence-style      │
│   reasoning, not vibes            │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ STAGE 5: Hallucination/Claim     │  (OpenAI API call + web search —  │
│ Check                            │   different model AND grounded)   │
│ - Extract atomic, independently  │
│   verifiable factual claims from │
│   Stage 2 + Stage 4 outputs only │
│   (NOT the full prose — this is  │
│   deliberate "information        │
│   asymmetry" to avoid inheriting │
│   Stage 2/4's persuasive framing)│
│ - For each claim: web search,    │
│   label ENTAILED / CONTRADICTED  │
│   / UNVERIFIABLE                 │
│ - This stage explicitly does NOT │
│   judge subjective/strategic     │
│   claims — only checkable facts  │
│   (market size figures,          │
│   competitor claims, regulatory  │
│   claims, named statistics)      │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ STAGE 6: Assembly                │
│ - Combine Stage 2 (main analysis)│
│ - Stage 3 (counter-evidence list)│
│ - Stage 4 (devil's advocate case)│
│ - Stage 5 (claim verification    │
│   table)                         │
│ - Render to user — see Section 5 │
└─────────────────────────────────┘
```

**Statelessness rule:** No stage receives prior No Bull session history. Each submission is an independent, fresh context. This is a deliberate product decision derived from evidence that persisted memory/context increases sycophancy. Do not add a "remember my previous ideas" feature without explicitly revisiting this section first.

**Model assignment rule:** Stages 1–3 use the Anthropic API. Stages 4–5 use the OpenAI API. This split is deliberate (cross-model critique), not arbitrary — do not consolidate onto a single provider to save complexity.

---

## 4. Tech stack

- **Framework:** Next.js (App Router), TypeScript
- **Hosting:** Vercel (free tier — Hobby plan). No paid Vercel features (no cron beyond free tier limits, no paid add-ons).
- **Styling:** Tailwind CSS
- **API routes:** Next.js Route Handlers (`app/api/.../route.ts`) — pipeline stages run server-side only. API keys never touch the client.
- **Anthropic SDK:** `@anthropic-ai/sdk`, model: `claude-sonnet-4-6` for Stages 1–3
- **OpenAI SDK:** `openai` npm package for Stages 4–5, routed per call site to the cheapest model that fits its task (confirmed against OpenAI's docs, and for the web-search call specifically via a live citation-reliability check, at the time each was pinned — re-confirm before changing): Stage 4 devil's advocate → `gpt-5.4`; Stage 5A claim extraction → `gpt-5.4-nano`; Stage 5B research/`web_search` call → `gpt-5.4-mini`; Stage 5B classification → `gpt-5.4-nano`. (Section 10's Session 5/6 entries record `gpt-5.5` as what was actually shipped at the time — that's accurate history, not out-of-date guidance; these are the current pinned models as of the most recent cost-tuning pass.)
- **No database in v1.** No persisted user data. If a "share this result" link feature is added (not in scope for initial sessions — see backlog), it would need a minimal KV store (Vercel KV free tier or similar) — to be scoped only if time permits after core sessions ship.
- **Environment variables:** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, both server-side only, set via Vercel project environment variables (not committed to repo).
- **Cost control:** No hard spend cap is required (Sam has confirmed pay-as-you-go API cost is acceptable), but each pipeline run should log approximate token usage to server console for visibility, and the UI should make clear to the user that submitting triggers multiple LLM calls (sets expectation for the few-seconds-to-tens-of-seconds latency of a 5-stage pipeline).

---

## 5. UI / UX spec

### 5.1 Landing / input screen
- Single large text input: "What idea or decision do you want stress-tested?"
- Short subhead reinforcing positioning: e.g. "No yes-man. We check it against reality and tell you where it might be wrong."
- One submit action. No login, no account creation, no settings screen for v1.
- Brief "How this works" disclosure (collapsed/expandable, not blocking) explaining in plain language: we rewrite your prompt to avoid leading the AI, we force it to argue against itself, a second AI checks the facts. This is the only place the anti-sycophancy mechanism is explained to the end user — keep it short, plain-language, no jargon like "RLHF" or "information asymmetry."

### 5.2 Loading state
- Pipeline takes multiple sequential API calls — this will not be instant. Show a multi-step progress indicator reflecting the actual stages (e.g. "Reframing your question…", "Stress-testing the idea…", "Checking for blind spots…", "Building the counter-case…", "Fact-checking claims…"). This is both honest UX and a demo-friendly visual that shows judges the pipeline is real, not a single API call with a spinner.

### 5.3 Results screen
Render Stage 6's assembled output as distinct, labeled sections (not a single wall of text):
1. **The Reframed Question** — show what the user's input was rewritten to (transparency + demonstrates the technique)
2. **The Stress Test** — Stage 2's main structured analysis
3. **Where This Could Be Wrong** — Stage 3's itemized counter-evidence list
4. **The Strongest Case Against It** — Stage 4's devil's advocate output, visually distinguished (e.g. different model name attribution shown, since it's a different provider — this is a feature to surface, not hide)
5. **Fact Check** — Stage 5's claim verification table: claim | verdict (✅ supported / ⚠️ contradicted / ❓ unverifiable) | source link where available
- A clear visual/textual model-attribution note somewhere on this screen (e.g. small caption: "Stress test by Claude · Counter-case and fact-check by GPT") — this is a genuine product feature (cross-model checking) and should be visible, not buried.
- "Try another idea" resets to a fresh, stateless input screen.

### 5.4 What NOT to build in v1
- No editing/iterating on a previous result in-place
- No comparison view of multiple ideas side by side
- No PDF export / sharing (unless time permits — backlog only)
- No "save this" persistence

---

## 6. Novus.ai integration requirement (mandatory for prize eligibility)

Research finding (confirmed at https://www.novus.ai/ and https://docs.novus.ai/ as of this spec's writing): Novus is a product analytics tool built by the Pendo team, currently in free open beta. It does **not** work via a client-side script tag like traditional analytics (Google Analytics, Mixpanel, etc.). Instead:

- Novus connects directly to your **GitHub repository** (GitHub is the only supported source control provider at present — Bitbucket/GitLab/Azure DevOps are roadmap items, not available now).
- It scans the connected repo's codebase to automatically map routes, flows, and interactions, and auto-instruments analytics events without manual event tagging.
- Instrumentation changes are proposed via **pull requests** — Novus opens a PR against the repo, a human reviews and merges it. It does not push directly to production.
- It explicitly works with AI-built/AI-shipped products and integrates with coding agents including Claude Code via MCP.
- Sign-up is free, no credit card required, at https://novus.pendo.io/.

**Integration steps for this project (to be executed as part of Session 2 or 3, whichever ships the deployed skeleton first):**
1. Sign up at https://novus.pendo.io/ using GitHub OAuth.
2. Connect the No Bull GitHub repository to Novus.
3. Allow Novus to scan the repo and open its instrumentation PR.
4. Review the PR diff (this should just be analytics instrumentation code — verify it isn't touching pipeline logic) and merge it.
5. Confirm the dashboard shows the connected project and is receiving events once the app is deployed and has had at least one real interaction (submit a test stress-test through the live Vercel URL to generate a usage event before taking the required submission screenshot).
6. Take the required dashboard screenshot for submission only after step 5 confirms live data, not immediately after connecting.

**Flag for Sam:** this is a GitHub-repo-level integration, not a few lines of frontend code — Claude Code sessions should not attempt to hand-write a "Novus SDK" integration from guesswork. The actual work here is: create the repo (if not already created), connect it via the Novus web UI, and merge the PR Novus generates. This should be its own small checklist item in whichever session first pushes code to a real GitHub repo — don't leave it until the night before submission, since the PR needs a real, evolving repo to instrument meaningfully and the dashboard needs live traffic before the screenshot is taken.

---

## 7. Session breakdown

Each session below is scoped to be independently plannable, buildable, demoable, and committable. Claude Code should not pull work forward from a later session even if convenient — confirm scope against this file before starting each session's plan.

### Session 1 — Project skeleton + deploy pipeline
**Goal:** An empty-but-deployed Next.js app on Vercel, so the deployment pipeline is proven before any real feature work happens.
- `create-next-app` with TypeScript + Tailwind + App Router
- Basic page shell: header with "No Bull" branding, placeholder input box (non-functional), placeholder results area
- Push to a new GitHub repo
- Connect repo to Vercel, confirm a successful deploy with a public URL
- Add `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` as Vercel env vars (values can be placeholder/test keys at this stage if real keys aren't ready)
- **Done when:** a public Vercel URL loads the placeholder UI with no errors.

### Session 2 — GitHub repo finalized + Novus.ai connected
**Goal:** Satisfy the mandatory Novus requirement early, against a real (if still mostly empty) repo, so the PR and instrumentation have something real to attach to and time to be reviewed calmly rather than rushed pre-deadline.
- Follow Section 6 steps 1–4 (sign up, connect repo, review and merge Novus's PR)
- Confirm Novus dashboard shows the connected project
- **Done when:** Novus is connected and its instrumentation PR is merged into the repo (dashboard screenshot can wait until later sessions generate real traffic, per Section 6 step 5–6).

### Session 3 — Stage 1: Prompt Reframe (Anthropic call, single stage, no UI wiring yet)
**Goal:** Prove out the highest-evidence-leverage piece of the pipeline in isolation.
- API route `app/api/reframe/route.ts`
- Accepts raw user text, calls Anthropic with the question-reframing system prompt (adapted from the UK AISI study's tested prompt — see Section 9 for source; the prompt should: detect non-question input, rewrite as a pronoun-less auxiliary-verb question, strip embedded stance, prefer "what are the tradeoffs" framing over "is X good" framing per Section 3 Stage 1)
- Return the reframed question as JSON
- Test via direct API call (curl/Postman/Thunder Client) — no frontend wiring required yet
- **Done when:** hitting the route with a leading, opinionated test input (e.g. "I think raising prices by 20% is obviously the right call, right?") reliably returns a neutral, stance-free question back.

### Session 4 — Stage 2 + 3: Structured Stress Test + Could-You-Be-Wrong (Anthropic calls, chained)
**Goal:** Build the core analysis engine.
- API route `app/api/stress-test/route.ts`
- Takes the Stage 1 output, runs Stage 2 (structured scaffold: force explicit counter-hypotheses/base-rate/false-premise check before conclusion)
- Chains into Stage 3 in the same conversation context (the forced "list every specific way this could be wrong" follow-up — must demand the itemized list explicitly, not accept a one-line "yes I could be wrong")
- Return both Stage 2 and Stage 3 outputs as structured JSON (separate fields, not concatenated prose)
- Test via direct API call
- **Done when:** a test input produces a clearly structured main analysis plus a separate, itemized counter-evidence list that wasn't present in the main analysis.

### Session 5 — Stage 4: Devil's Advocate (OpenAI call)
**Goal:** Add the cross-model adversarial pass.
- API route `app/api/devils-advocate/route.ts`
- Takes the original reframed question + Stage 2 output as context
- Calls OpenAI with a system prompt instructing it to build the strongest evidence-based case against the idea/decision (skeptical-board-member framing per Section 3 Stage 4)
- Return as structured JSON
- Test via direct API call
- **Done when:** a test input produces a counter-case that is genuinely adversarial (not a hedge-everything restatement of Stage 2) and is attributable to a different model than Stages 1–3.

### Session 6 — Stage 5: Hallucination/Claim Check (OpenAI + web search)
**Goal:** Add the fact-checking layer — the most architecturally novel piece.
- API route `app/api/fact-check/route.ts`
- Input: Stage 2 output + Stage 4 output text ONLY (deliberately not passed the full conversation/reasoning context — this enforces the "information asymmetry" design principle from Section 3)
- Step A: extract atomic, independently verifiable factual claims (one proposition per claim, no paraphrasing beyond what's stated)
- Step B: for each claim, run a web-search-grounded check, label ENTAILED / CONTRADICTED / UNVERIFIABLE with a source link where available
- Explicitly skip/pass-through subjective or strategic claims that aren't fact-checkable (e.g. "this is a good pricing strategy" should not be force-fit into a verdict)
- Return as structured JSON: array of `{claim, verdict, source}`
- Test via direct API call with a test input that contains at least one deliberately checkable factual claim (e.g. a market-size number) and at least one subjective claim, to confirm the stage correctly distinguishes them
- **Done when:** the checkable claim gets a real verdict with a source, and the subjective claim is correctly excluded/flagged as not fact-checkable rather than forced into a verdict.

### Session 7 — Pipeline orchestration (Stage 6: wire all stages together server-side)
**Goal:** One endpoint that runs the full pipeline end-to-end and returns the fully assembled result.
- API route `app/api/no-bull/route.ts` (or similar single entry point) that sequentially calls the Sessions 3–6 logic (either by importing the underlying functions directly or by calling the existing routes — Claude Code's choice based on what's cleaner, but avoid duplicating prompt logic between this route and the individual stage routes)
- Returns one assembled JSON payload matching the Section 5.3 results screen structure
- Add basic error handling: if any single stage fails (API error, timeout), the response should clearly indicate which stage failed rather than the whole request silently failing
- Test via direct API call with a full realistic input, confirm all 5 stages execute and the combined payload is well-formed
- **Done when:** one API call, one realistic input, produces the complete structured result with all sections populated.

### Session 8 — Frontend: input screen + loading state
**Goal:** Build the real (non-placeholder) input UI from Section 5.1–5.2.
- Replace Session 1's placeholder input with the real submit flow, wired to Session 7's pipeline endpoint
- Build the multi-step progress indicator described in Section 5.2 (since the backend call is one request, this likely needs either: (a) the backend route to stream/report stage progress via Server-Sent Events or similar, or (b) a simulated progress indicator with realistic timing if true streaming is too complex for hackathon timeline — Claude Code should propose which approach fits the remaining time budget when planning this session)
- Add the "How this works" expandable disclosure copy
- **Done when:** submitting real text from the actual UI triggers the real pipeline and shows a believable progress state while it runs.

### Session 9 — Frontend: results screen
**Goal:** Build the real results display from Section 5.3.
- Render the 5 labeled sections (Reframed Question, Stress Test, Where This Could Be Wrong, Strongest Case Against It, Fact Check table)
- Model attribution caption ("Stress test by Claude · Counter-case and fact-check by GPT")
- "Try another idea" reset button that clears state and returns to a fresh input screen (reinforcing statelessness, no history retained client-side either)
- **Done when:** a full real pipeline run renders cleanly into the results screen with no raw/unstyled JSON visible to the user.

### Session 10 — Polish, error states, and demo-readiness pass
**Goal:** Get the app from "works" to "demo-able and submission-ready."
- Handle and gracefully display partial-failure states (e.g. fact-check stage times out but the rest of the pipeline succeeded — show what's available rather than a blank error screen)
- Mobile-responsive check (judges/community will likely view the demo video and may click the live link from a phone)
- Basic empty-state / input-validation handling (empty submit, extremely long input)
- Visual polish pass on branding/typography consistent with "No Bull" positioning (direct, no-nonsense visual tone — avoid generic SaaS-template feel)
- Generate test traffic through the live deployed URL specifically to populate the Novus dashboard (Section 6 step 5) ahead of taking the submission screenshot
- **Done when:** the app survives a few rounds of "act like a judge clicking around and trying to break it" without looking broken.

### Session 11 — Submission assembly
**Goal:** Produce the actual hackathon submission artifacts.
- Confirm live public Vercel URL is stable
- Record 2–3 minute demo video (script: show the problem — paste a leading/biased idea into a "normal" single-LLM-call mental model — then show No Bull catching it, walking through the 5 result sections, calling out the cross-model fact-check as the standout feature)
- Take the Novus dashboard screenshot (after Session 10's test traffic generation)
- Write the short submission description: what was built, who it's for, what tools were used (Claude Code, Next.js, Vercel, Anthropic API, OpenAI API, Novus), what was learned
- Optional: LinkedIn/build-in-public post tagging @Mind the Product
- **Done when:** every checklist item in the hackathon brief's "What to Submit" section is satisfied.

---

## 8. Backlog (explicitly NOT scheduled — only revisit if all 11 sessions ship early)

- Shareable result links (would require KV storage)
- PDF export of results
- Side-by-side comparison of multiple ideas
- Any form of user accounts or saved history (would directly conflict with the deliberate statelessness design principle in Section 3 unless carefully scoped to avoid reintroducing the memory-driven sycophancy risk)

---

## 9. Evidence sources (for reference — informs prompt design, not user-facing copy)

These are the primary sources underpinning the pipeline design decisions in Section 3. Cited here so future sessions can verify a prompt design choice traces back to actual evidence rather than drifting from it over time.

- Dubois, Ududec, Summerfield, Luettgau (UK AI Security Institute), "Ask don't tell: Reducing sycophancy in large language models," arXiv:2602.23971 — source of the question-reframing system prompt template and the 24-percentage-point effect size.
- Hills, "Could you be wrong: Debiasing LLMs using a metacognitive prompt for improving human decision making," arXiv:2507.10124 — source of the Stage 3 "could you be wrong" forced follow-up design, validated across GPT-4o, Claude Sonnet 4, Gemini 2.5 Pro, DeepSeek-R1.
- Cheng, Lee, Khadpe, Yu, Han, Jurafsky (Stanford), "Sycophantic AI decreases prosocial intentions and promotes dependence," Science, March 2026 — core evidence that sycophancy is widespread (49% higher affirmation than humans across 11 models) and harmful.
- Luettgau et al. (CHI 2026), "Interaction Context Often Increases Sycophancy in LLMs" — source of the deliberate statelessness/no-memory design decision in Section 3.
- OpenAI, "Sycophancy in GPT-4o: What happened and what we're doing about it" / "Expanding on what we missed with sycophancy" (openai.com, April 2025) — industry acknowledgment of the problem this product addresses.
- MARCH (Multi-Agent Reinforced Self-Check for LLM Hallucination), arXiv:2603.24579 — source of the "information asymmetry" design principle in Stage 5 (checker should not see the original's full reasoning, only extracted claims).
- RT4CHART / atomic claim decomposition literature (arXiv:2603.27752 and related) — source of the atomic-claim-extraction-before-verification design in Stage 5.
- Human-subjects devil's-advocate study, "Enhancing AI-Assisted Group Decision Making through LLM-Powered Devil's Advocate," IUI 2024 — source of the Stage 4 design.

---

## 10. Session log

*Claude Code: append a brief entry here after each session ships, noting session number, date, and a one-line summary of what was actually delivered (especially if it deviated from this spec — note the deviation and reason).*

**Session 1 — 2026-06-18:** Shipped as scoped. Scaffolded with `create-next-app` (TypeScript, Tailwind, App Router, ESLint), built the placeholder page shell (branding header, disabled input box, empty results placeholder), pushed to `github.com/sam-evans-code/no-bull`, and connected the repo to Vercel with `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` placeholder env vars. Public URL confirmed live (HTTP 200, correct branding/copy): https://no-bull-xi.vercel.app. One incidental fix: added `turbopack.root` to `next.config.ts` to silence a workspace-root warning caused by a stray lockfile in the parent home directory.

**Session 2 — 2026-06-18:** Shipped as scoped. GitHub repo was already finalized from Session 1, so this session was Novus.ai only: Sam signed up at novus.pendo.io via GitHub OAuth and installed the Novus GitHub App scoped to just `sam-evans-code/no-bull` (read+write on code/PRs/checks/administration). Novus scanned the repo and opened PR #1 ("Install Novus," branch `novus/install-pendo-sdk`), adding the Pendo agent script loader to `app/layout.tsx`, a `PendoInitializer` client component calling `pendo.initialize()`, and a `global.d.ts` ambient declaration for `pendo`. Reviewed the diff — confined to analytics instrumentation, no pipeline/app logic touched — and Sam merged it directly on GitHub. Dashboard screenshot intentionally deferred to Session 10 per spec, once real traffic exists.

**Session 3 — 2026-06-18:** Shipped as scoped. Built `app/api/reframe/route.ts` (Stage 1, Prompt Reframe) calling `claude-sonnet-4-6` via `@anthropic-ai/sdk`, with a system prompt operationalizing the AISI reframing mechanism as explicit steps (detect already-neutral input → strip stated opinion/rhetorical tags → remove first/second-person framing → prefer auxiliary-verb "what are the tradeoffs of X" framing over "is X good" framing). Anthropic client is constructed inline in the route rather than a shared `lib/` module — a deliberate choice to keep this first route self-contained until a second Anthropic-calling route (Session 4) reveals a real shared pattern worth extracting. Validation returns `400` for malformed/missing/empty `input`; any Anthropic-side failure (auth, network, empty output) returns a user-presentable `502` rather than leaking error detail, pre-written as final copy so Session 8 can surface it in the UI verbatim without revisiting wording. Token usage logged to console per call. Verified end-to-end with a real API key: leading/opinionated inputs (e.g. "I think raising prices by 20% is obviously the right call, right?") reliably reframed to neutral, tradeoff-framed questions; already-neutral input passed through unchanged; invalid-key and malformed-body cases failed gracefully without crashing. No frontend wiring, per spec — `app/page.tsx` untouched.

**Session 4 — 2026-06-18:** Shipped as scoped. Built `app/api/stress-test/route.ts` (Stage 2 + Stage 3, chained in one Anthropic conversation), and extracted `lib/anthropic.ts` (a thin `getAnthropicClient()` factory) since this is the second Anthropic-calling route — the exact trigger Session 3's log called out. Both stages use forced `tool_choice` (not plain-text JSON-in-prompt) for reliable structured output: Stage 2's tool (`submit_stress_test`) has fields ordered `counterHypotheses` → `baseRates` → `falsePremiseCheck` → `conclusion`, using the model's autoregressive generation order to force the reasoning scaffold to happen before the conclusion is written. Stage 3 continues the same `messages` array — after Stage 2's `tool_use` turn, the next user message carries a `tool_result` block (placeholder content, since no real tool executes) plus the forced "list every specific way this could be wrong, at least 4 distinct items" follow-up text, then a second forced tool call (`submit_counter_evidence`). Response returns `{ stressTest, couldBeWrong }` as separate JSON fields. Same `400`/`502` error pattern as Session 3, with two distinct 502 messages (one per stage) and per-call token logging; since the API doesn't enforce JSON Schema `minItems`, the route manually validates array lengths/non-empty strings before trusting any tool input. One fix made during live testing: Stage 2's initial `max_tokens: 1500` truncated output before the `conclusion` field was written (output tokens matched the cap exactly), raised to `4096`/`2048` for Stages 2/3; a second fix tightened the `baseRates`/`falsePremiseCheck` schema descriptions after the model initially returned those string fields as JSON-array-shaped text rather than prose. Verified end-to-end with a real API key: a tradeoffs-style question produced 3 distinct counter-hypotheses, prose base-rate and false-premise reasoning, a clear conclusion, and 5 itemized counter-evidence points that introduced genuinely new weaknesses not stated in the conclusion; missing/empty/malformed-body requests correctly returned `400`. No frontend wiring and `app/api/reframe/route.ts` untouched, per spec.

**Session 5 — 2026-06-18:** Shipped as scoped. Built `app/api/devils-advocate/route.ts` (Stage 4), the first OpenAI-backed pipeline call, deliberately a different provider from Stages 1–3 per the cross-model critique principle in Section 3. Added the `openai` npm package. Before writing any code, confirmed the exact model string against OpenAI's own docs rather than trusting a web-search snippet from planning — `gpt-5.5` checked out as current, function-calling-capable, and available via Chat Completions (`chat.completions.create`). The OpenAI client is constructed inline in the route, not extracted to a `lib/openai.ts` — mirroring the Session 3→4 precedent of only extracting a shared client once a *second* route on that provider exists; Session 6 (Stage 5, also OpenAI) is the flagged trigger for that extraction. Takes `reframedQuestion` and the Stage 2 `stressTest` object as input (validated locally, not imported from `stress-test/route.ts`, for the same "self-contained until shared" reasoning), and forces a single function call (`submit_devils_advocate_case`, fields `keyArguments`/`conclusion`) via `tool_choice`. The system prompt frames the model as a skeptical board member instructed to introduce reasoning the stress test didn't cover rather than restate it, and to avoid default hedging language. Same `400`/`502` convention as Sessions 3–4, with token usage (`prompt_tokens`/`completion_tokens`) logged to console. Verified end-to-end with a real API key: a price-increase test case produced 8 distinct, genuinely adversarial arguments (pipeline-velocity effects, procurement dynamics, brand-trust risk, competitor positioning, internal incentive erosion, customer concentration, LTV cannibalization) that introduced new reasoning rather than rephrasing the Stage 2 input it was given; malformed/missing-field requests (no `reframedQuestion`, no `stressTest`, a `stressTest` with only 1 counter-hypothesis) correctly returned `400`. No orchestration, fact-checking, or frontend work, and `app/api/reframe/route.ts`/`app/api/stress-test/route.ts`/`app/page.tsx` untouched, per spec.

**Session 6 — 2026-06-18:** Shipped as scoped. Built `app/api/fact-check/route.ts` (Stage 5, hallucination/claim check) and extracted `lib/openai.ts` (a thin `getOpenAIClient()` factory, mirroring `lib/anthropic.ts`) — the flagged Session 5 trigger, now that this is the second OpenAI-calling route; `app/api/devils-advocate/route.ts` was deliberately left untouched, same precedent as `reframe/route.ts` being left alone when `lib/anthropic.ts` was introduced. Input is `{ stressTest, devilsAdvocateCase }` only — no `reframedQuestion`, no Stage 3 output, no reasoning prose beyond those two structured objects, enforcing the "information asymmetry" principle from Section 3. Before writing the route, ran a live throwaway check confirming `gpt-5.5` supports the Responses API with the `web_search` tool and reliably returns `url_citation` annotations — so `gpt-5.5` is used for all three call sites (extraction, research, classification), avoiding a separate-model fallback. Step A (claim extraction) is a forced-tool Chat Completions call (`submit_extracted_claims`) over a text bundle built from exactly six fields (`stressTest.{counterHypotheses, baseRates, falsePremiseCheck, conclusion}` + `devilsAdvocateCase.{keyArguments, conclusion}`); unlike other stages' arrays, zero extracted claims is treated as a valid result (no minimum length enforced) since the input may be entirely subjective. Step B avoids combining OpenAI's web-search tool with forced structured output in one call (undocumented reliability risk) by splitting each claim into two calls: a Responses-API research call (`tools: [{ type: "web_search" }]`, `tool_choice: "auto"`) followed by a plain forced-tool Chat Completions classification call (`submit_claim_verdict`) over the research call's prose output only. The source URL is extracted programmatically from the research call's `url_citation` annotations first, falling back to the classifier's own `source` field only if no citation was found. One deliberate deviation from the Sessions 3–5 strict single-502 convention, made during planning: Step A failure still 502s the whole request (nothing to return without claims), but Step B's per-claim calls run via `Promise.allSettled` with individual `try/catch` — a single claim's transient API failure downgrades just that claim to `UNVERIFIABLE`/`source: null` (logged) rather than failing the other claims' real verdicts; verified live by temporarily injecting a forced rejection on one claim and confirming the response stayed `200` with the other claim's real verdict intact, then reverting the injection. Verified end-to-end with a real API key: a market-size statistic claim got a real `CONTRADICTED` verdict with a live source URL while a same-request subjective "good pricing strategy" sentence was excluded entirely from the output (not forced into a verdict); an all-subjective input returned `{ "factCheck": [] }` at `200`; malformed bodies (1-item `counterHypotheses`, missing `devilsAdvocateCase`) returned `400`. Token usage logged per call for all three call types, noting in code that the Responses API's `usage.input_tokens`/`output_tokens` differs from Chat Completions' `usage.prompt_tokens`/`completion_tokens`. No orchestration or frontend work, and `app/api/reframe/route.ts`/`app/api/stress-test/route.ts`/`app/api/devils-advocate/route.ts`/`app/page.tsx` untouched, per spec.

**Session 7 — 2026-06-18:** Shipped as scoped. Built `app/api/no-bull/route.ts` (Stage 6, the single pipeline-orchestration entry point) plus, as the prerequisite refactor it required, `lib/stage-errors.ts` (`StageValidationError`/`StageApiError`) and four new `lib/stages/{reframe,stress-test,devils-advocate,fact-check}.ts` modules — each stage route's prompts, tool definitions, validators, and SDK calls moved verbatim out of its `route.ts` into one exported `runX()` function, with the original routes reduced to thin parse-body/call-function/map-error-to-400-or-502 wrappers. This was a pure extraction, not a dedup: each module kept its own copy of validators that already differed across routes pre-refactor (notably `fact-check`'s `keyArguments` min-length of 1 vs. `devils-advocate`'s own min-length of 3 for the same shape — left as-is, not reconciled). While touching `reframe` and `devils-advocate` anyway, their inline `new Anthropic()`/`new OpenAI()` construction was switched to the existing `getAnthropicClient()`/`getOpenAIClient()` factories for consistency with `stress-test`/`fact-check`. The orchestrator imports the four `runX()` functions directly (rejected calling the sibling routes via internal `fetch` — extra cold start and timeout-budget risk on Vercel, fragile same-origin URL construction, no benefit over a direct import) and chains them — `runReframe` → `runStressTest` → `runDevilsAdvocate` → `runFactCheck` — preserving the information-asymmetry rule by construction: `runFactCheck`'s signature only accepts `(stressTest, devilsAdvocateCase)`, so passing `reframedQuestion`/`couldBeWrong` to it would be a compile error, not just a convention. Confirmed before writing the orchestrator's type that Stage 3's `submit_counter_evidence` tool schema (in `stress-test/route.ts`, now `lib/stages/stress-test.ts`) names its array field `counterEvidence` — i.e. `couldBeWrong` is `{ counterEvidence: string[] }`, exactly as assumed. Success response is `{ reframedQuestion, stressTest, couldBeWrong, devilsAdvocateCase, factCheck }`; failure response is `{ error, failedAt, completedStages }` (400 if the failing stage threw `StageValidationError`, else 502), where `failedAt` is set immediately before each stage call and `completedStages` only ever contains keys for stages that fully resolved — this field is for future debugging/Session 10 partial-failure UI only, not something Session 8/9 should render directly. Set `export const maxDuration = 60` (the Vercel Hobby ceiling). Verified end-to-end: all 4 refactored routes produce byte-identical responses/status codes/error copy/log lines to their pre-refactor Session 3–6 behavior; the orchestrator's empty-input case returns `400`/`failedAt: "reframe"`/empty `completedStages`; a simulated OpenAI-key failure returns `502`/`failedAt: "devils-advocate"`/`completedStages` containing exactly `reframedQuestion`/`stressTest`/`couldBeWrong` with no `[fact-check]` log lines at all, confirming the pipeline genuinely stopped; a realistic full-pipeline run produced all 5 fields populated with 14 fact-checked claims, and the server log sequence (`[reframe]` → `[stress-test]` stage2/3 → `[devils-advocate]` → `[fact-check]` extraction → 14 research/classification pairs → `[no-bull] pipeline complete`) confirmed every stage actually executed. **Critical finding, flagged here for Sam ahead of Session 11:** that realistic run's actual wall-clock was 349,724ms (~5.8 minutes) — `fact-check` alone took 260,092ms because several of its 14 claims triggered web-search research calls with 40,000–80,000+ input tokens each. This is far beyond the `maxDuration = 60` ceiling Hobby allows; on real Vercel deployment, an input that extracts more than a handful of fact-checkable claims will be hard-killed by the platform with a generic timeout before the orchestrator's own error handling ever runs (no `failedAt`, no `completedStages`, just a raw 504). Locally this isn't enforced, which is why the test still completed and returned a fully-formed payload. Fixing this (capping claim count, parallelizing more aggressively, switching to streaming/background execution, or restructuring Stage 5) is explicitly out of scope for this session per spec, but it is a real risk for the live demo — Session 8 (frontend) should not assume the backend reliably responds within Vercel's window for an arbitrary input, and this should be revisited before Session 11. No frontend work — `app/page.tsx` untouched, per spec.

**Session 8 — 2026-06-18 (redesigned — backend execution model, not the frontend work originally scoped for "Session 8"):** Session 7's timeout risk turned out worse than flagged. A follow-up fix capped `lib/stages/fact-check.ts`'s extracted-claim fan-out to `MAX_CLAIMS = 3` (down from an initial `MAX_CLAIMS = 5` that still measured 58s alone) — this is real, applied, and left in place — but live measurement of the *full* `/api/no-bull` pipeline with that cap still showed **118s total** (`stress-test` 52.9s + `devils-advocate` 34.0s + `fact-check` 28.9s + `reframe` 2.1s), because `stress-test` and `devils-advocate` alone already exceed 60s before fact-check even starts. That ruled out prompt/token tuning as a real fix — `claude-sonnet-4-6`/`gpt-5.5` simply take this long for this depth of reasoning, and degrading prompt quality to chase a 60s ceiling was rejected as the wrong tradeoff. The actual fix was architectural: replaced the synchronous `POST /api/no-bull` with an async job + polling model. `POST /api/no-bull` now only creates a job record in KV (`lib/job-store.ts`, using `@vercel/kv` — installed despite npm's deprecation warning, since Sam's Vercel project's existing KV/Upstash integration still injects the legacy `KV_REST_API_URL`/`KV_REST_API_TOKEN` names the package expects, confirmed live rather than assumed) and fires the actual pipeline via a non-awaited call wrapped in Next's `after()` (stable since Next 15.1, confirmed against the installed `16.2.9`) to a new `app/api/no-bull/run/route.ts`, returning `{ jobId }` in ~230ms. `run/route.ts` (`maxDuration = 60`) replicates Session 7's `currentStage` error-tracking pattern exactly, but writes the in-progress job state to KV after every stage completes instead of holding it in memory for one final response — so partial results survive even if Vercel hard-kills the function mid-run. A new `GET /api/no-bull/[jobId]/route.ts` is a plain KV passthrough for polling. The information-asymmetry rule is preserved by construction, unchanged from Session 7: `runFactCheck` only ever receives `(stressTest, devilsAdvocateCase)`. `run/route.ts` also short-circuits (no re-run) if polled/re-triggered for a job already `complete`/`failed`, to guard against duplicate paid LLM calls if the trigger fetch is ever retried. Before writing any of this, ran an isolated `after()` smoke test (a throwaway route logging from inside `after()`, deleted once confirmed) specifically because local `next dev`'s behavior for `after()` hadn't been verified and the entire design depends on it — confirmed firing correctly in the dev log. Verified end-to-end with real credentials: job creation consistently ~230ms; polling a real run shows fields arriving in the expected order (`reframedQuestion` alone → `stressTest`+`couldBeWrong` together → `devilsAdvocateCase` → `factCheck` with `status: "complete"`); a full run completed with all 5 fields populated (total background runtime ~190s — confirms the original problem was real, now safely contained off the user-facing request); an empty-input job correctly reaches `status: "failed"`, `failedAt: "reframe"`; re-POSTing `/api/no-bull/run` for an already-failed job returned the existing state in 45ms with no new stage log lines, confirming the idempotency guard works. `lib/stages/*.ts` (including the `MAX_CLAIMS = 3` cap), all individual stage routes, and `app/page.tsx` are untouched (`git diff` confirmed empty for both). **Flag for whichever session builds the frontend:** Section 7's existing "Session 8" (frontend input/loading) and "Session 9" (frontend results) descriptions assume either a single blocking backend call or SSE-streamed progress — neither matches reality anymore. The frontend now needs to call `POST /api/no-bull` to get a `jobId`, then poll `GET /api/no-bull/{jobId}` on an interval until `status` is `complete`/`failed`, rendering progressively-arriving fields as they show up. Section 7's text itself was deliberately not rewritten here, consistent with this log's role as the place deviations get recorded rather than retroactively editing prior scope — but it should be read skeptically, not literally, before that session is planned. **Also flagged, not yet verified:** the `after()`-triggered fetch to `/api/no-bull/run` has only been confirmed to work in local `next dev`, which is a long-lived process with no serverless freeze-after-response risk — the specific failure mode `after()` is designed to prevent can't even occur locally. Confirming the trigger survives on real Vercel requires deploying and testing the live URL, which needs a push/deploy this session didn't take (no commit/push was in scope) — this should be the first thing checked against the live deployment before relying on this flow for the demo.

**Session 8 addendum #1 — 2026-06-19 (first live-Vercel check, found a worse bug than the one being checked for):** Checked the flag above against the real deployment and found the single-invocation `run/route.ts` does get hard-killed on production: `stress-test` (~53s) + `devils-advocate` (~34s) alone exceed `maxDuration = 60` before `fact-check` starts, and Vercel's platform-level kill bypasses the route's own `catch` — confirmed via a real `504` in Vercel's JSON logs. Worse, because that kill happens before any `catch` runs, the job was left **permanently stuck at `status: "running"`** in KV (only `reframedQuestion`+`stressTest` populated) — confirmed by polling for 6+ minutes with zero progress. Fixed two things together: (1) split `run/route.ts` into one route per stage (`app/api/no-bull/run/{reframe,stress-test,devils-advocate,fact-check}/route.ts`, via a new shared `lib/stage-runner.ts`), each well under 60s alone and chaining to the next via its own `after()`-triggered fetch; (2) added a stale-job safety net (`lib/job-store.ts`: `lastUpdatedAt` stamped on every write, `isJobStale`/`buildStaleFailure` with a 150s threshold, checked by `GET /api/no-bull/[jobId]`) for the residual case where a single stage still gets killed mid-flight, plus a race guard in `lib/stage-runner.ts` so a stage that finishes late doesn't resurrect a job the stale-check already failed. Verified: a synthetic stale job written directly to production KV correctly resolved to `failed` on poll, durably rewritten (not just presented-as-failed). **Known issue flagged at the time:** the forced-platform-kill recovery path was verified only via that synthetic KV record, not a real reproduced mid-stage `504` — deliberately scoped out as a deadline tradeoff, since the per-stage split was believed to remove the every-input failure mode already.

**Session 8 addendum #2 — 2026-06-19 (the synthetic-only gap above turned out to matter immediately — a second, deeper bug, distinct from addendum #1's stuck-job bug):** Running the real live happy-path test for addendum #1 — the literal "everyone said this was fixed" check — failed twice in a row, both times resolving via the stale-job mechanism to `failed`/`failedAt: "fact-check"`, not a clean completion. Vercel's logs showed `stress-test` and `devils-advocate` **both** logging `"Vercel Runtime Timeout Error: Task timed out after 60 seconds"` despite each stage's own work finishing comfortably under 60s, with `fact-check` then getting a genuine `504`. **Root cause:** addendum #1's per-stage split was necessary but not sufficient. Each stage's `after()` callback `return`ed (awaited) a `fetch()` to the next stage's route — and that route did its real LLM work *before* responding. `after()`'s contract keeps an invocation alive until its callback's promise resolves, so invocation A's `after()` stayed open for the *entire* time it took B to finish its real work, which stayed open for C's, which stayed open for D's. Each invocation's true lifetime became its own work plus the sum of every downstream stage's work — the original monolithic-timeout bug, recreated across nested HTTP hops instead of one function call. (The stale-job mechanism from addendum #1 is what caught this cleanly both times — confirming it also works against a real, organic platform kill, not just the synthetic case it was originally verified against.) **The fix:** restructured `lib/stage-runner.ts`'s `handleStageRequest` to ack immediately (`202`) and do the real work — the LLM call *and* the next-stage trigger fetch — inside its own `after()`, mirroring the pattern `app/api/no-bull/route.ts` already used for the very first hop. This means every fetch in the chain is still properly awaited (no fire-and-forget, which was considered and rejected: an un-awaited fetch inside `after()` has no documented guarantee it's flushed over the network before the function freezes, since `after()`'s only contract is about the promise it's given) — but each one resolves fast, because the route it's calling acks-and-defers too, instead of doing real work first. Before touching any real route, proved this mechanism on real Vercel infrastructure (not just local `next dev`, since the bug above was only ever observed in production) with two throwaway routes (`smoke-c`: acks immediately, sleeps 8s inside its own `after()`; `smoke-d`: awaits a fetch to `smoke-c`) deployed live — confirmed via Vercel's own JSON logs that `smoke-d`'s invocation resolved in 320ms while `smoke-c`'s deferred work genuinely ran for the full 8009ms independently, then deleted both before touching `lib/stage-runner.ts`. Combined this fix in one commit with Sam's own already-made, separate model-selection changes (`devils-advocate` → `gpt-5.4`; `fact-check` split into `gpt-5.4-nano` for extraction/classification and `gpt-5.4-mini` for research — see Section 4) — unrelated to this bug but landing at the same time, and helpfully reducing per-stage latency margins further. **Final live re-verification, same scope as addendum #1's checklist:** local chain test passed end-to-end (`status: "complete"`, all 5 fields, every per-stage `POST` returning its ack in 66–289ms regardless of that stage's real duration — `stress-test` alone took 73234ms in this run, fully decoupled from its caller); live Vercel failure-path retest still correctly returns `failedAt: "reframe"`; **live Vercel happy-path test succeeded for the first time ever** — `status: "complete"` with all 5 fields, real per-stage durations `reframe` 1.3s / `stress-test` 47.3s / `devils-advocate` 11.0s / `fact-check` 12.4s, every stage route responding `202` immediately, zero timeout errors anywhere in Vercel's logs for that run. **New, narrower risk flagged here (not fixed this session, doesn't need a code change yet):** `stress-test`'s own real latency varied 47–73s across these tests — i.e. a single stage's *own* work can still exceed the 60s ceiling on a slow run, now that it's no longer hidden by the cascading bug. This is no longer a "job stuck forever" risk (the stale-job mechanism from addendum #1 resolves it to `failed` within ~150s if it happens), just an occasional legitimate failure on the slowest stage under Vercel Hobby's hard ceiling — worth knowing about before the demo, not worth chasing further (e.g. splitting `stress-test` into two stages, or moving off Hobby) unless it's actually observed recurring.

**Session 9 — 2026-06-19 (frontend results screen, combined with the orphaned Session 8 input/loading scope since neither had been built):** Section 7's original "Session 8"/"Session 9" split assumed either a single blocking call or SSE streaming; Session 8 itself was entirely consumed by the backend async-job redesign, so `app/page.tsx` was still the unmodified Session 1 placeholder going into this session — confirmed by reading it directly before planning. Read the real contract straight from source (`lib/job-store.ts`, `app/api/no-bull/route.ts`, `app/api/no-bull/[jobId]/route.ts`) rather than trusting Section 7's stale description, and built the whole input → poll → progressive-results flow in one pass since it's one continuous state machine. New files: `lib/types/job.ts` (hand-mirrored `JobState`/`JobResults` types, since a client component can't import the server-only `lib/job-store.ts`), `lib/no-bull-client.ts` (`submitIdea`/`pollJob`/a client-side `inferInFlightStage` mirroring the backend's own logic in `lib/job-store.ts:66-71`), and four components under `app/components/`: `IdeaForm` (controlled textarea, empty-submit guard, and the Section 5.1 "How this works" disclosure via a plain `<details>`/`<summary>` — picked up in this session since the real input screen was being built anyway), `ProgressIndicator` (4-step stage list inferred from which `results` fields are populated, a live elapsed-time clock, and a "this usually takes 45–70s" note that appears once the stress-test stage has been active ~20s, to keep a long-but-healthy run from looking stuck), `ResultsView` (the 5 labeled sections, each gated on its own field's presence so they appear progressively rather than all at once, plus the model-attribution caption), and `NoBullApp` (a `useReducer` state machine: `idle → submitting → polling → complete | failed | expired`, polling every 2.5s). `app/page.tsx` is now a thin server component rendering `<NoBullApp />`. One sharp edge handled deliberately: `results.factCheck` can be a legitimate `[]` on success (zero checkable claims, not an error), so the section renders an explicit "No independently checkable factual claims were found" message rather than either omitting the section or rendering an empty table. One piece of scope added beyond the original Section 5.3/5.4 text, explicitly flagged in planning: a "Try again" button on both the `failed` and the new `expired` (404/job-TTL-expired) states, which re-POSTs the original input as a brand-new job rather than resuming the old one — justified by addendum #2's own finding that `stress-test`'s 47–73s latency variance produces real, non-buggy failures with no recovery path today. "Try another idea" remains the separate, unconditional reset back to a blank input screen, visually de-emphasized (plain text link) next to "Try again" (solid button) so the two aren't confused. A transient single poll failure (network blip) doesn't escalate to a failure state — only 3 consecutive failures do, via a synthetic `error` (no backing `failedAt`) — added on the Plan agent's read of the requirement, since a single hiccup mid-run otherwise risked needlessly invalidating an otherwise-healthy 70+ second run. No backend files were touched (`git diff` confirms only `app/page.tsx` changed plus new files), and `app/layout.tsx`'s Pendo instrumentation was left alone. Verified end-to-end with Playwright against a real local dev server with live API credentials (no `chromium-cli` available in this environment, so used Playwright's `chromium` module directly per the run skill's documented fallback): a real full pipeline run rendered all 5 sections progressively with the attribution caption and zero raw JSON, and polling stopped after `complete`; a mocked `failed` job (via Playwright route interception, to avoid needing a real ~70s failure reproduction) rendered the real `error`/`failedAt` text and a working "Try again" that fired a genuinely new `POST /api/no-bull` (confirmed via a second, distinct `jobId` in the mocked network layer) landing on a fresh `complete` result; a mocked 404 rendered the distinct "This result has expired" copy, not the generic failure screen; "Try another idea" cleared the textarea back to empty from both `complete` and `failed`. `npx tsc --noEmit`, `npm run lint` (clean on all new/changed files — the only lint errors in the repo are pre-existing in `global.d.ts`, unrelated to this session), and `npm run build` all passed.

**Session 8 addendum #3 — 2026-06-19 (the narrower risk flagged at the end of addendum #2 started recurring on real prod traffic):** Sam hit a live prod failure — `failedAt: "stress-test"` via the stale-job mechanism, same shape the screenshot in addendum #2 already anticipated. Reproduced and measured locally before touching code: two full pipeline runs with real API keys both showed combined `stress-test` (its two sequential Claude calls — structured analysis, then the could-you-be-wrong follow-up — run back-to-back inside one `after()`-deferred invocation) landing at 57.5s and 57.7s, i.e. sitting right on the edge of `maxDuration = 60` with zero network/cold-start overhead; production's extra latency (the `after()`-triggered fetch hop, cold starts) was enough to tip it over and trigger a genuine platform kill, not a fluke. A targeted breakdown (temporary per-call timing, reverted before committing) showed the two calls split roughly 32–38s / 18–22s — each comfortably under 60s on its own. Fix: split `stress-test` into two independent stages, exactly the option addendum #2 named and deferred. `lib/stages/stress-test.ts` now only runs the structured-analysis call (`runStressTestAnalysis`); a new `lib/stages/could-be-wrong.ts` runs the could-you-be-wrong follow-up (`runCouldBeWrong`) as its own stage. Since this stage now runs as a separate invocation that never sees the live `stage2Message` object, it reconstructs the prior assistant `tool_use` turn from `stressTest`'s already-validated fields (a synthetic `tool_use_id`, since the original ID never crosses the HTTP boundary) — equivalent to the literal turn stage 2 produced, because `tool_choice` had forced that exact shape. New route `app/api/no-bull/run/could-be-wrong/route.ts` sits between the existing `stress-test` and `devils-advocate` routes in the chain. `StageName`/`STAGE_ORDER`/`inferInFlightStage` updated in both `lib/job-store.ts` and its hand-mirrored client copy `lib/types/job.ts` (plus `lib/no-bull-client.ts`'s own mirrored `inferInFlightStage`) to add the `"could-be-wrong"` stage between `"stress-test"` and `"devils-advocate"` — the pipeline now has 5 stages, not 4, which happens to make the live progress indicator literally match Section 5.2's original copy ("Reframing... Stress-testing... Checking for blind spots... Building the counter-case... Fact-checking...") for the first time. `app/components/ProgressIndicator.tsx`'s `isStageDone` and slow-step copy (45–70s → 30–45s) updated to match. The standalone manual-testing route `app/api/stress-test/route.ts` (Session 4, not part of the async job chain) now calls both stage functions sequentially itself, since it isn't subject to the timeout risk this fix addresses. Re-verified end-to-end locally post-fix: all 5 stages complete with real margin (`reframe` 1.8s, `stress-test` 32.4s, `could-be-wrong` 17.8s, `devils-advocate` 11.4s, `fact-check` 13.8s — worst single stage now ~38s across runs, vs. the old combined 57.5–57.7s). `npx tsc --noEmit` and `npm run lint` clean (pre-existing `global.d.ts` errors only). Not yet re-verified against live Vercel — that should happen before relying on this for the demo, same caveat addendum #1 flagged for its own fix.

**Session 8 addendum #4 — 2026-06-19 (a new prod failure, this time genuinely silent — zero errors anywhere in Vercel's logs, unlike every prior addendum):** Sam hit `failedAt: "fact-check"` via the stale-job mechanism, but checked Vercel's logs first this time and found nothing — no exception, and notably none of addendum #2's `"Vercel Runtime Timeout Error"` line, which a genuine platform kill had reliably produced before. Reading `lib/stages/fact-check.ts` and `lib/pendo-server.ts` directly (not just re-measuring durations, since the missing log line ruled out a like-for-like repeat of addendum #3's bug) surfaced two real, previously-unflagged gaps, either of which explains a stall with **no possible thrown exception**: (1) `fact-check`'s `researchClaim` call used OpenAI's `web_search` tool with `tool_choice: "auto"` — an open-ended tool loop with no timeout, on top of `fact-check` being the one stage never split despite Session 7 already measuring some research calls at 40-80k+ input tokens; (2) `pendoTrackServer`'s own `fetch` ([lib/pendo-server.ts](lib/pendo-server.ts)) had no timeout and its `catch` only logs+swallows, never rethrows — called twice inside `runFactCheck`, both times *after* all claim verification finishes, so a hung Pendo endpoint would block the stage indefinitely with literally no code path capable of producing a log line, even on platform kill. Fix, mirroring addendum #3's `stress-test` precedent exactly: split `fact-check` into `fact-check-extract` (claim extraction only, new stage, fast) → `fact-check` (kept the name, now terminal, takes `factCheckClaims: string[]` instead of the original two args, runs the per-claim research+verify loop). `StageName`/`STAGE_ORDER`/`JobResults.factCheckClaims`/`inferInFlightStage` updated in `lib/job-store.ts`, `lib/types/job.ts`, and `lib/no-bull-client.ts`; `devils-advocate`'s `nextPath` repointed to the new stage; `app/components/ProgressIndicator.tsx` gained a `"fact-check-extract"` case (`"Extracting claims to check"`); `app/api/fact-check/route.ts` (Session 6's manual test route) updated to call both functions sequentially, same pattern as `app/api/stress-test/route.ts`. Split the single `fact_check_completed` Pendo event into two (`fact_check_claims_extracted` on the new stage, `fact_check_completed` kept on the terminal one) rather than accept losing the pre-cap claim count. Independently of the split, bounded both unbounded calls: `pendoTrackServer`'s fetch got `signal: AbortSignal.timeout(5_000)`; `researchClaim` got `{ timeout: 25_000, maxRetries: 0 }` (explicitly disabling the SDK's default timeout-retry, which would have silently doubled the wait) — a timeout-triggered rejection flows straight through `fact-check`'s **existing** `Promise.allSettled` downgrade-to-`UNVERIFIABLE` path with no new catch logic needed, since that safety net already existed and simply never had anything to catch; added the same timeout to `classifyClaim` for defense-in-depth. `STALE_THRESHOLD_MS` (150_000ms) left unchanged — comment updated to note the post-split `fact-check` family no longer drives that number, `stress-test`'s 47-73s still does. Verified end-to-end locally with real API keys: full chain completed in ~55s with all 6 fields populated in order, `fact-check-extract` (4.0s) and `fact-check` (11.1s) both acked in well under a second each regardless of real duration (the addendum #2 ack-then-defer property re-confirmed after inserting a new stage); the standalone manual route still returns the same `{ factCheck }` shape; an all-subjective input correctly returned `{"factCheck":[]}`; deliberately forcing the new research timeout down to 1ms reproduced a real logged `APIConnectionTimeoutError` (proving an exception *does* fire now, unlike the original silent-stall bug) and all 3 affected claims correctly downgraded to `UNVERIFIABLE`/`source: null` with the request still returning `200`, then reverted before committing. `npx tsc --noEmit` and `npm run lint` clean (pre-existing `global.d.ts` errors only). Not yet re-verified against live Vercel — same outstanding caveat as addendum #3.

**Session 8 addendum #5 — 2026-06-19 (another silent `fact-check-extract` stall, same shape as addendum #4 but in the one OpenAI call addendum #4 didn't touch):** Sam hit `failedAt: "fact-check-extract"` in production via the stale-job mechanism, again with zero Vercel error logs. Reading `lib/stages/fact-check.ts` directly (not trusting this file's own history) confirmed the gap: addendum #4 added `{ timeout: 25_000, maxRetries: 0 }` to `researchClaim` and `{ timeout: 10_000, maxRetries: 0 }` to `classifyClaim`, but the third OpenAI call in this file — `extractClaims`, the one inside `fact-check-extract` itself — was never given the same guard, despite being the exact same SDK and exact same failure mode addendum #4 had just fixed twice elsewhere. A slow/hanging extraction call could block well past the 150s stale-job threshold with nothing ever thrown — fully explaining the absence of logs, since the call simply hadn't failed yet when the stale check gave up. Fix: added `{ timeout: 25_000, maxRetries: 0 }` to `extractClaims`'s call (matching `researchClaim`'s value, the closer comparison since `classifyClaim`'s 10s budget assumes no web search). Same session, two unrelated improvements requested alongside the fix: (1) confirmed per-claim verification in `runFactCheck` was already parallel (`Promise.allSettled(claims.map(...))`, unchanged) — the user had asked whether this could be parallelized, and it already was; (2) raised `MAX_CLAIMS` from 3 to 5 — the old comment justifying 3 ("keep Stage 5 well under Vercel's 60s maxDuration ceiling") was itself stale, since `fact-check` has run as its own decoupled serverless invocation since addendum #1/#4's stage splits; reworded the comment to name the real constraint (OpenAI per-key concurrent rate limits, not `maxDuration` — and a rate-limited claim already degrades gracefully to `UNVERIFIABLE` via the existing `Promise.allSettled` path, so this is a non-blocking tradeoff, not a new failure mode). Since the cap was previously just `claims.slice(0, MAX_CLAIMS)` over whatever order the model returned — i.e. "first N found," not "N most important" — also added an importance-ordering instruction to both `EXTRACT_CLAIMS_TOOL`'s schema description and `EXTRACT_CLAIMS_SYSTEM_PROMPT`, defining importance as how much a claim would undermine the stress-test conclusion or devil's-advocate case if it turned out to be false, with the reasoning ("only a limited number will actually get checked") stated explicitly rather than left implicit. No second LLM call added — ordering happens within the existing single forced-tool extraction call, and `slice(0, MAX_CLAIMS)` was left unchanged since it now operates on a pre-ranked array. Verified end-to-end locally with real API keys: temporarily forcing `extractClaims`'s timeout to 1ms reproduced a real logged `Request timed out` error caught cleanly into a 502 in 203ms (proving the fix actually prevents a hang, not just adding an unused option), then reverted; a real run with an input engineered to surface 7 candidate claims (market-size figures, a named regulation, two competitors' financials/pricing history, plus one deliberately subjective sentence) extracted 7, capped to 5, and the 5 retained were the clearly load-bearing statistics/precedents — the dropped two were the most peripheral facts and the explicitly subjective sentence (excluded by the existing subjectivity filter, not the cap); the `fact-check` stage itself completed in 13.5s for 5 parallel claims, consistent with the "bounded by the slowest single claim, not the count" reasoning. `npx tsc --noEmit` and `npm run lint` clean (pre-existing `global.d.ts` errors only). Not yet re-verified against live Vercel — same outstanding caveat as addenda #3 and #4.
