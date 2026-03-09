# PRD_CODEX_OPTIMIZED

## 1. Product Definition

### Product name
PW-Doctor

### One-line definition
CLI tool that detects broken Playwright selectors and proposes safe, verifiable fixes with explicit confidence and rollback.

### Business objective (6-month runway)
Reach repeat weekly usage in at least 20 paying teams by solving selector breakage faster than manual repair while maintaining positive gross margin.

---

## 2. Problem Statement

Playwright suites degrade as UI changes break selectors. Teams lose release velocity because failures are discovered late and fixed manually under time pressure.

Current alternatives:
- manual test repair
- brittle internal scripts
- strict `data-testid` discipline (not universally adopted)

Gap:
No reliable CLI-first tool that can find breakages across a suite and generate reviewable fixes with measurable quality.

---

## 3. Target User and ICP

### Primary ICP (MVP)
1. Product engineering teams with 15-200 engineers.
2. Active Playwright usage with >= 300 selectors.
3. Weekly UI releases and frequent selector churn.
4. CI-driven development with failing tests blocking merge.

### Secondary users
QA leads and test infrastructure owners.

### Explicit non-ICP (MVP)
1. Teams with < 100 selectors.
2. Teams with strict, stable test-id conventions and low breakage rates.
3. Highly regulated orgs requiring immediate on-prem deployment.

---

## 4. Core Value Proposition

For teams with frequent selector breakage, PW-Doctor reduces mean time to repair by:
1. pinpointing broken selectors fast,
2. generating candidate fixes,
3. verifying fixes against affected tests,
4. producing small, reversible patches.

Success condition for buyer:
At least 50% reduction in manual selector-fix time within 30 days.

---

## 5. Product Scope by Tier

## MVP (Months 1-4)

### Included
1. `pw-doctor check`
   - parse Playwright tests
   - detect selector references
   - validate selectors in reproducible browser sessions
   - output machine-readable and human-readable reports
2. `pw-doctor heal --dry-run` (default)
   - propose fixes via deterministic heuristics first
   - optional AI suggestion path (single provider, BYOK)
   - confidence score with explanation trace
3. `pw-doctor heal --apply`
   - writes patch only when confidence threshold and safety guards pass
   - creates backup patch metadata for rollback
4. `pw-doctor verify`
   - reruns impacted tests only
   - auto-reverts failed edits
5. CI mode
   - stable exit codes
   - JSON artifacts for pipeline storage

### Excluded
1. Hosted dashboard
2. Team management and SSO
3. Billing
4. GitHub App
5. GitLab/Slack/Teams integrations
6. Multi-provider AI routing

## V2 (Months 5-6, only if MVP gates pass)

1. Minimal hosted scan history viewer.
2. API key auth for artifact upload.
3. GitHub Actions integration template (not full GitHub App).
4. Usage caps and paid plan activation.

## Future

1. Full dashboard with multi-project analytics.
2. Organization roles, SSO, enterprise controls.
3. Multi-provider AI support.
4. Broader reliability features beyond selectors.

---

## 6. User Workflow (MVP)

1. Install: `npm i -D pw-doctor`
2. Configure once: `pw-doctor init`
3. Run in CI or local: `pw-doctor check --report json`
4. On failures: `pw-doctor heal --dry-run`
5. Review patch summary; apply: `pw-doctor heal --apply`
6. Verify impacted tests: `pw-doctor verify`
7. If verification fails: automatic revert and failure report

Design principle:
No silent mutation. Every write is explicit, reviewable, and reversible.

---

## 7. Functional Requirements

### FR-1 Selector Extraction
1. Parse TS/JS Playwright tests.
2. Support direct locator calls and common chained patterns.
3. Report unsupported dynamic constructions explicitly.

### FR-2 Validation Engine
1. Execute deterministic validation with configurable context hooks.
2. Support authenticated state via user-provided storage state file.
3. Classify result: `healthy`, `broken`, `ambiguous`.

### FR-3 Repair Engine
1. Heuristic repair first.
2. Optional AI fallback behind feature flag.
3. Produce ranked candidates with rationale.

### FR-4 Safe Apply
1. Default dry-run.
2. Hard limits:
   - max files changed per run
   - max replacements per file
3. Write patch metadata to `.pw-doctor/history`.

### FR-5 Verification and Rollback
1. Build impacted-test list from selector-to-test mapping.
2. Run only impacted tests.
3. Revert changes automatically on verification failure.

### FR-6 Reporting
1. CLI table output.
2. JSON artifact schema versioned.
3. Exit code contract documented for CI consumers.

---

## 8. Non-Functional Requirements

1. Determinism: identical inputs should produce identical candidate ranking for heuristic path.
2. Performance: `check` on 500 selectors completes within 6 minutes on standard CI runner profile.
3. Reliability: false-fix rate after verify <= 3% on calibration corpus.
4. Security: no secrets or raw auth tokens sent to AI provider; redact sensitive DOM attributes by policy.
5. Privacy: AI path is opt-in and disabled by default.

---

## 9. Technical Architecture (MVP)

### Components
1. CLI package (`Node.js + TypeScript`).
2. Parser module (AST-based extraction and file edits).
3. Validator module (Playwright execution).
4. Repair module (heuristics + optional AI adapter).
5. Verifier module (impacted test execution).
6. Reporter module (terminal + JSON outputs).

### Storage
Local only for MVP:
1. run metadata
2. patch history
3. calibration snapshots (optional)

No required cloud dependencies in MVP execution path.

### AI integration model
1. Single provider adapter interface.
2. BYOK only in MVP.
3. Token and request budgets configurable per run.

### Why this architecture
Minimizes integration surface and burn. Proves core utility before platform cost expansion.

---

## 10. Data Contracts (MVP)

### Validation result
1. selector id
2. source file and position
3. status
4. evidence (match count, visibility, error type)

### Repair candidate
1. old selector
2. proposed selector
3. strategy (`heuristic` or `ai`)
4. confidence
5. rationale

### Verification report
1. impacted tests
2. pass/fail
3. rollback performed (boolean)

All contracts versioned (`schemaVersion`).

---

## 11. Security and Compliance Baseline

1. AI opt-in with explicit consent.
2. Redaction policy for DOM/test snippets (emails, tokens, IDs, URLs with secrets).
3. Local credential storage only for BYOK key.
4. No cloud retention in MVP unless user enables upload feature.

---

## 12. Pricing and Monetization Logic

## MVP monetization

1. Free tier:
   - local heuristic `check/heal/verify`
   - no hosted history
2. Pro tier (usage-based, not seat-first):
   - AI-assisted repairs (BYOK pass-through fee optional in early phase)
   - monthly included repair credits
   - overage pricing per repair request

Rationale:
Cost driver is workload volume, not headcount.

### Unit economics guardrails
1. Hard monthly usage caps per plan.
2. Per-run token budget and max AI calls.
3. Automatic downgrade to heuristic-only when budget exhausted.

No “unlimited AI” plans until empirical cost curve is stable.

---

## 13. Competitive Strategy

Wedge:
Most reliable safe auto-repair CLI for Playwright selectors.

Differentiation target:
1. lowest false-fix rate in class
2. fastest path from failure to reviewable patch
3. zero mandatory cloud lock-in for core function

Moat-building path:
opt-in anonymized repair outcomes corpus to improve ranking and confidence calibration over time.

---

## 14. Delivery Plan (6 Months)

## Month 1
1. CLI skeleton and config.
2. AST extraction coverage for top locator patterns.
3. Baseline `check`.

## Month 2
1. Validation context hooks (auth state, setup steps).
2. Heuristic repair candidates.
3. Dry-run patch preview.

## Month 3
1. Safe apply and rollback engine.
2. Impacted-test verification.
3. JSON schema and CI contract.

## Month 4
1. Calibration harness and quality gates.
2. Early adopter pilots (10 repos).
3. Reliability hardening.

## Month 5 (conditional on gates)
1. Minimal hosted artifact viewer.
2. API key upload.
3. Paid plan activation.

## Month 6 (conditional on gates)
1. GitHub Actions helper.
2. Onboarding and docs optimization.
3. Sales motion for ICP expansion.

---

## 15. Quality Gates (Must Pass)

1. Breakage detection precision >= 0.90 on pilot corpus.
2. Human acceptance rate of top suggestion >= 0.60.
3. Post-verify false-fix rate <= 0.03.
4. Median MTTR reduction >= 50% in pilot teams.
5. Gross margin positive at pilot paid usage profile.

Failing any gate blocks V2 expansion.

---

## 16. Key Risks and Mitigations

1. Risk: low repair accuracy on real-world dynamic apps.
Mitigation: strict guardrails, verification-first, gradual auto-apply rollout.

2. Risk: AI costs exceed revenue.
Mitigation: usage caps, BYOK-first, heuristic-first pipeline.

3. Risk: trust collapse from bad automated edits.
Mitigation: dry-run default, explicit review step, atomic rollback.

4. Risk: weak adoption due to setup burden.
Mitigation: fast-start templates and opinionated defaults for common Playwright setups.

---

## 17. Explicit Non-Goals (MVP)

1. “Autonomous healing” without verification.
2. Full enterprise governance.
3. Broad cross-platform testing analytics.
4. Replacing existing test frameworks or CI systems.

---

## 18. Launch Readiness Checklist

1. Stable CLI commands and schema.
2. Pilot corpus results published with transparent metrics.
3. Incident rollback playbook documented.
4. Cost-control defaults enabled.
5. Installation-to-first-value under 30 minutes for ICP repos.
