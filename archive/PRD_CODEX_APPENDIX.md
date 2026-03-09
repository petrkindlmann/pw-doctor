# PRD_CODEX_APPENDIX

## Scope Reality Check

This repository contains no application code. It contains one planning document: `/Users/petr/projects/pw-doctor/REBUILD_PROMPT.md`.

Implication: any claim about implementation maturity, architecture readiness, or differentiators is speculative. There is no proof in this workspace that the platform exists.

---

## Phase 1 — Hidden Assumptions

### Unstated assumptions

1. The system assumes selectors can be validated outside full test context.
Evidence: the plan validates selectors independently (`REBUILD_PROMPT.md:240-260`).
Failure mode: many selectors only become valid after prior UI actions, auth, feature flags, waits, or frame switches.

2. It assumes AST extraction can reliably map to real runtime targets.
Evidence: broad extraction of locator calls (`REBUILD_PROMPT.md:205-238`).
Failure mode: dynamic selector composition, helper wrappers, template literals, Page Object abstractions, and custom selector engines will reduce extraction coverage.

3. It assumes “intent” is inferable cheaply and consistently.
Evidence: AI intent detection is core (`REBUILD_PROMPT.md:271-281`, `REBUILD_PROMPT.md:624-625`).
Failure mode: intent is ambiguous without test assertions and domain context; wrong intent yields wrong fix.

4. It assumes rollback is simple.
Evidence: “backup/rollback system for all changes” (`REBUILD_PROMPT.md:617`).
Failure mode: partial edits across multiple files and generated artifacts make rollback non-trivial without git-integrated transactional patches.

5. It assumes confidence score can be made objective.
Evidence: weighted formula (`REBUILD_PROMPT.md:287-301`).
Failure mode: weights are arbitrary and uncalibrated; score can be overconfident and dangerous.

6. It assumes scan-to-fix can happen on “live sites.”
Evidence: repeated live-site validation (`REBUILD_PROMPT.md:242-254`, `REBUILD_PROMPT.md:680`).
Failure mode: production rate limits, bot protection, locale drift, A/B tests, and anti-automation defenses break reliability.

### Risky bets

1. Betting on AI-first repair quality before collecting dataset and feedback loop.
2. Shipping CLI + dashboard + auth + billing + GitHub App + integrations in 12 weeks (`REBUILD_PROMPT.md:602-662`) with zero existing code.
3. Offering included AI usage in low-price seats (`REBUILD_PROMPT.md:528-544`) before hard caps/cost controls are proven.
4. Promising offline capability while leaning on cloud analytics and SaaS sync.

### Market assumptions

1. Assumes selector maintenance is acute enough pain to buy a standalone product.
2. Assumes teams do not already solve this with test-id discipline, page objects, CI retries, and internal scripts.
3. Assumes QA engineers control budget and tool adoption in organizations.
4. Assumes willingness to grant third-party tooling access to repos, CI, and potentially production-like environments.

### Technical assumptions

1. Assumes TypeScript AST tooling can preserve formatting/comments reliably across complex syntax (`REBUILD_PROMPT.md:303-321`).
2. Assumes browser pool validation is cheap enough for routine use (`REBUILD_PROMPT.md:613-614`).
3. Assumes multi-provider AI fallback won’t fragment quality behavior (`REBUILD_PROMPT.md:180`, `REBUILD_PROMPT.md:283-286`).
4. Assumes multi-tenant SaaS can be secure with fast delivery.

### Overconfidence areas

1. “Build for 10,000+ users from day one” with no code and no PMF (`REBUILD_PROMPT.md:9`).
2. “Every feature must ACTUALLY WORK” while planning maximal scope (`REBUILD_PROMPT.md:10`, `REBUILD_PROMPT.md:602-662`).
3. “No vendor lock-in” while core value depends on third-party models and hosted auth/billing (`REBUILD_PROMPT.md:685-687`).
4. “Solved problem” positioning (`REBUILD_PROMPT.md:707`) without evidence of generalization beyond one internal context.

---

## Phase 2 — Product Logic Audit

### Core problem clarity

Partially clear: “broken selectors consume maintenance time.”
Not clear enough: which segment suffers enough to pay immediately, and what measurable pain threshold triggers purchase.

Missing:
- baseline hours lost per week
- median incident severity
- current workaround cost by team size
- replacement cost vs adopting better selector practices

### Target user specificity

Too broad. The document references QA engineers, teams, CI admins, and enterprise buyers simultaneously.
No explicit ICP:
- company size
- test suite size
- engineering maturity
- CI frequency
- regulatory constraints

### Value proposition sharpness

Current value statement mixes:
- scanner
- fixer
- analytics suite
- team governance
- integration platform

This dilutes the “must buy now” message. No single wedge is dominant.

### Contradictions

1. CLI-first and open-source core, but heavy emphasis on SaaS-only value extraction.
2. “Works offline” (`REBUILD_PROMPT.md:683`) vs live-site validation requirement (`REBUILD_PROMPT.md:680`).
3. “No vendor lock-in” vs built-in dependence on Claude/Groq/Ollama strategy matrix.
4. “Build for 10k users day one” vs zero code base and 12-week full-stack plan.

### Vague areas

1. Definition of “broken” in contextual flows.
2. How tests are selected for verification after a fix.
3. How the tool handles authenticated states and secrets safely.
4. How multi-repo monorepos and custom test wrappers are supported.
5. What happens when multiple candidate fixes pass.

### Painful problem or nice-to-have

This is painful only for teams with:
- large Playwright suites
- frequent UI churn
- weak test-id discipline
- high release cadence

For everyone else, this is a nice-to-have utility, not budget-priority software.

---

## Phase 3 — Feature Scope Analysis

### Overengineered for MVP

1. Full web dashboard with many pages (`REBUILD_PROMPT.md:566-581`).
2. GitHub App + GitLab + Slack + Teams in first release.
3. Multi-tenant org/role system + SSO in early stage.
4. Live WebSocket progress streaming.
5. Complex pricing tiers before usage distribution is known.
6. “Watch mode” plus CI plus dashboard simultaneously.
7. Broad research mandates before implementation (`REBUILD_PROMPT.md:8`, `REBUILD_PROMPT.md:96-164`) with no prioritization gates.

### Missing essentials

1. Hard constraints on safe auto-editing (max files changed, protected paths, branch-only mode).
2. Deterministic reproducibility controls for AI suggestions.
3. Calibration framework for confidence thresholds.
4. Evaluation harness and benchmark dataset.
5. Explicit redaction policy for DOM/test code sent to AI providers.
6. Incident plan when tool introduces bad fixes.

### Cut from MVP

1. SaaS dashboard
2. Team management
3. Billing
4. SSO
5. GitHub App
6. GitLab integration
7. Slack/Teams integrations
8. Webhooks
9. Real-time streaming
10. Enterprise self-hosting claims

### V2 material

1. Hosted scan history and trends
2. CI integration via simple CLI + API key first
3. Basic web viewer for scan artifacts
4. Single integration (GitHub Actions comment bot)

### Complexity traps

1. AST editing across JS/TS variants and custom wrappers.
2. Contextual selectors requiring navigation flows.
3. Confidence scoring false positives causing trust collapse.
4. Multi-provider AI behavior drift and support burden.
5. Cross-platform credential storage edge cases.

---

## Phase 4 — UX & Workflow Logic

### User journey validity

Current journey assumes:
1. User can run scans against live environments reliably.
2. Tool can identify impacted tests and verify quickly.
3. User trusts auto-apply at >85% confidence.

These assumptions are fragile in real CI constraints.

### Friction points

1. Auth setup complexity for CLI + SaaS.
2. Environment setup for pages requiring login/state.
3. False positives from selectors that are only temporarily unavailable.
4. Time cost: full-suite selector validation can be slow and expensive.
5. Debug burden when tool edits tests incorrectly.

### Unrealistic steps

1. “Fix is suggested within seconds” after deploy breakage (`REBUILD_PROMPT.md:705`) at scale without costly always-on monitoring.
2. End-to-end from install to stable auto-healing in one pass without baseline tuning.
3. Confident intent inference with minimal context.

### Real user behavior mismatch

Most teams:
- fix failing tests inside existing PRs
- do not introduce an external healing tool unless it proves low-risk quickly
- require deterministic CI behavior over “smart” automation

### Mobile vs desktop conflicts

Low priority for this product. Primary interface is terminal/CI and desktop browser dashboard. Mobile adds little value in early stages.

---

## Phase 5 — Technical Architecture Review

### Stack appropriateness

CLI + TypeScript + Playwright: appropriate.
Full Next.js + Supabase + Stripe + integrations in first 12 weeks: not appropriate for zero-code starting point.

### Scalability risks

1. Browser-based validation is CPU heavy; parallelism can saturate runners quickly.
2. Storing raw snapshots/screenshots per selector scan can explode storage costs.
3. Per-selector AI analysis does not scale economically without aggressive sampling/caching.

### Compute cost traps

1. AI calls per broken selector multiplied by retries and provider fallback.
2. Repeated full scans on large suites due to weak incremental detection.
3. Visual matching in confidence formula adds expensive image operations.

### Infra bottlenecks

1. Centralized API for scan ingestion can become hotspot under CI bursts.
2. WebSocket stream endpoints increase operational complexity for little MVP value.
3. GitHub webhook processing and idempotency complexity appears under-modeled.

### Security and data risks

1. Sending DOM/test context to external AI can leak secrets/PII.
2. API key handling in CLI not fully specified.
3. Integration configs in DB marked “encrypted” but no KMS/key-rotation design.
4. Multi-tenant isolation and row-level security not defined.

### Third-party dependency risks

1. Model/provider policy changes break product economics and behavior.
2. Supabase/Stripe/GitHub API changes can stall roadmap.
3. Dependence on bot-detectable browser automation in user environments.

### Offline vs cloud conflicts

Document claims offline capability and optional SaaS, but major value props depend on cloud AI and centralized history.

### Vendor lock-in risks

1. “No lock-in” claim conflicts with SaaS workflows and provider-specific AI prompts.
2. Multi-provider support lowers lock-in but raises quality variance and support burden.

---

## Phase 6 — Monetization & Unit Economics

### Pricing alignment

Per-seat pricing is weakly aligned for a workload product driven by scan volume, repo size, and CI frequency.

### Compute coverage risk

“AI included” at low seat price risks negative gross margins when:
- large suites trigger many repair attempts
- long context windows are required for intent inference
- verification reruns increase runtime spend

### Freemium realism

Free unlimited local scans plus paid AI can work only if:
1. paid tier locks enough workflow value (CI governance/history)
2. free tier does not cannibalize paying users with BYOK AI plugins

### CAC vs LTV concerns

Standalone dev-tool motion likely requires:
- content-led acquisition
- community trust
- long proof period before team adoption

LTV uncertain without sticky team workflows and high switching costs.

### Venture-scale or niche-scale

Potentially venture-scale only if it evolves into broader test reliability platform (flakiness, root cause analytics, auto-fix workflows).
Selector repair alone is niche-scale unless expanded.

---

## Phase 7 — Competitive Positioning

### Differentiation clarity

Current differentiators are implementation details (AST, confidence score), not market-level outcomes.

### 10x vs 10%

As written: 10-30% better utility for teams already struggling.
To be 10x, it must:
- cut MTTR for selector failures by >70%
- keep false-fix rate below strict threshold
- require near-zero configuration

### Why users switch

They switch only if:
1. onboarding takes less than one hour
2. first run catches real breakages and proposes safe fixes
3. CI integration gives immediate signal with low noise

### Moat

Only durable moat candidate: proprietary repair dataset + feedback loop + verified outcomes across many repos.

### Copy risk

High copyability in baseline feature set. Any capable team can build AST scan + LLM prompt + patch pipeline.

---

## Phase 8 — Failure Scenarios

### 6 months

1. Team ships broad surface area with weak reliability.
2. Early users see wrong fixes and uninstall.
3. No clear ICP conversion path; usage is sporadic.
4. Burn is consumed by infra/integration complexity instead of core fix accuracy.

### 12 months

1. Unit economics break due to unbounded AI costs.
2. Support burden from edge-case repos exceeds small team capacity.
3. Competitors bundle similar capability into broader testing platforms.
4. Product remains “interesting tool,” not default workflow.

### 24 months

1. Growth plateaus at niche audience.
2. Roadmap debt from early over-scope blocks strategic expansion.
3. Enterprise deals stall on security and compliance gaps.
4. Product becomes commoditized unless it owns reliability data network effects.

---

## Phase 9 — Concrete Corrections

### REMOVE

1. 12-week full-stack all-in plan.
2. Early GitLab + Slack + Teams + SSO.
3. WebSocket live stream complexity.
4. “Unlimited AI calls” enterprise language before real infra model.
5. “Build for 10k users day one” requirement.

### SIMPLIFY

1. One AI provider in MVP; add BYOK later.
2. Confidence model: start with observable heuristics + calibration dataset, not arbitrary weighted blend.
3. Verification: run minimal impacted-test subset, not full regression.
4. Auth: local-first CLI without mandatory SaaS login.
5. Data model: reduce tables to scans, selectors, repairs, usage.

### ADD

1. Explicit ICP and disqualifiers.
2. Safety guardrails:
   - default `--dry-run`
   - max changed files per run
   - auto-apply only in dedicated branch
3. Evaluation harness and quality gates:
   - precision/recall for breakage detection
   - accepted-fix rate
   - false-fix rate
4. Data redaction and privacy controls before any cloud AI request.
5. Cost controls:
   - per-org usage caps
   - token budgets
   - degraded mode without AI

### DELAY

1. Hosted dashboard until CLI proves repair accuracy and retention.
2. Billing until recurring value signal is clear.
3. Multi-tenant enterprise architecture until initial paying cohort.
4. Advanced analytics until reliable data ingestion baseline.

---

## Forensic Contradiction Matrix

1. Claim: offline support.
Conflict: live-site validation + cloud AI dependence.
Impact: user trust and expectation mismatch.

2. Claim: no vendor lock-in.
Conflict: product strategy anchored in third-party AI and hosted stack.
Impact: legal/procurement objections.

3. Claim: 10k-user scale day one.
Conflict: zero code and 12-week feature explosion.
Impact: guaranteed delivery failure.

4. Claim: confidence-driven safe automation.
Conflict: no calibration plan, no benchmark corpus.
Impact: confidence theater.

---

## Decision Gate Before Building Anything Else

Pass criteria for MVP go/no-go:

1. On 10 real repos, detect selector breakages with precision >= 0.9.
2. Suggested fixes accepted by humans >= 60% on first proposal.
3. False-fix rate after verification <= 3%.
4. Median runtime for `check` on 500 selectors <= 6 minutes on CI medium runner.
5. Gross margin stays positive under realistic usage caps.

If any gate fails, do not build dashboard/billing/integrations. Fix core repair engine first.
