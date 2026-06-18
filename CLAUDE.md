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
- **OpenAI SDK:** `openai` npm package for Stages 4–5. Model choice for OpenAI calls is an implementation decision for that session (pick a current GPT model with web search/tool-use support for Stage 5) — confirm model name availability at build time rather than hardcoding a guess into this spec.
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

(empty — no sessions shipped yet)
