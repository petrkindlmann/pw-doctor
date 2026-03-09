# REBUILD PROMPT: PW-Doctor — AI-Powered Playwright Test Maintenance Platform

## Instructions for Claude

You are building **PW-Doctor** — a SaaS platform and CLI tool that automatically detects and fixes broken Playwright test selectors using AI. Think "GitHub Copilot for test maintenance" — it scans your Playwright test suite, finds broken selectors, discovers working replacements on your live sites, applies fixes with confidence scoring, and verifies everything works.

**CRITICAL RULES:**
1. Research 2026/2027 best practices BEFORE writing any code — 4 deep research blocks minimum
2. Build for 10,000+ users from day one — real SaaS with auth, billing, usage tracking
3. Every feature must ACTUALLY WORK — the CLI must really scan sites, really find broken selectors, really fix them
4. The AI must provide REAL value — not just pattern matching, but understanding DOM structure, selector intent, and suggesting resilient selectors
5. This is a developer tool — CLI-first experience, then web dashboard for analytics and team management

---

## Why This Is a Greenfield Build

The current state is:
- **`/pw-doctor/`** — Empty directory. Zero code.
- **`/pw-doctor-landing/`** — A single `index.html` marketing page with a beta signup form (web3forms.com). Beautiful glassmorphism design but literally just CSS and a form.

However, the **concept is battle-tested**. The founder built a working self-healing system inside a production test management platform (`test-management/`) for Czech News Center, monitoring 7+ media websites with 1,300+ URLs. The key files that prove the concept works:

### What Exists in the Reference Implementation (test-management)

1. **Self-Healing Engine** (`scripts/self-heal.ts`) — A 530-line TypeScript script that implements a 5-step cycle:
   - DETECT: Validate selectors against live sites, find broken ones
   - DISCOVER: Try candidate selectors from a hardcoded list of patterns
   - APPLY: Regex-replace selectors in the config file with auto-heal comments
   - VERIFY: Re-validate to confirm fixes work
   - REPORT: Generate summary

2. **Intelligence Service** (`src/services/intelligence-service.ts`) — A rule-based failure classification engine with:
   - 6 classification labels: TEST_OUTDATED, TEST_FLAKY, PRODUCT_BUG, INFRASTRUCTURE, EXPECTED, UNKNOWN
   - Confidence scoring (0-100%)
   - Owner team assignment (QA, Frontend, Backend, DevOps, Product)
   - Priority determination (P0-P3)
   - Signal-based evidence collection
   - Root cause detection via git commit correlation

3. **Site Configuration** (`src/configs/sites.ts`) — 1,791 lines of selector configs for 7 websites, showing real-world complexity of maintaining selectors across multiple sites with different consent systems, navigation patterns, and DOM structures.

### What's Wrong With the Reference Implementation (Why PW-Doctor Needs to Be a Product)

1. **Hardcoded candidate selectors** — The discover step uses a static list of ~50 CSS patterns. No AI, no DOM analysis, no understanding of what the selector was trying to do.

2. **Regex-based file editing** — The apply step uses fragile regex to find/replace in a specific file format. Breaks if the config file structure changes.

3. **No confidence scoring on fixes** — Every discovered selector is auto-applied regardless of quality. No "this is 92% likely correct" vs "this is 45% — flag for review."

4. **Single-repo, single-project** — Only works for one specific project structure. Not a general-purpose tool.

5. **No AI layer** — The intelligence service has "Layer 2: ML" and "Layer 3: LLM" marked as "future phase" — never built.

6. **No web interface** — CLI-only, no dashboard for trends, no team features, no history.

7. **No persistence** — No database tracking historical fixes, success rates, selector health over time.

---

## The Product Vision

PW-Doctor is a **developer tool** with two delivery modes:

### 1. CLI Tool (Primary — Open Source Core)
```bash
# Install
npm install -g pw-doctor

# Initialize in a Playwright project
pw-doctor init

# Scan and fix broken selectors
pw-doctor heal

# Validate all selectors without fixing
pw-doctor check

# Watch mode — monitor and alert on selector health
pw-doctor watch

# Generate health report
pw-doctor report
```

### 2. Web Dashboard (SaaS — Pro Features)
- Historical selector health trends
- Team management (who broke what, who fixed what)
- CI/CD integration (GitHub Actions, GitLab CI)
- Slack/Teams notifications
- Cross-project analytics
- AI-powered fix suggestions review queue

---

## Research Blocks (Complete These FIRST)

### Research Block 1: Playwright Internals & Selector Strategies
```
RESEARCH: How Playwright selectors work internally and best practices for resilient selectors in 2026

Topics to investigate:
- Playwright selector engines: CSS, text, role, testid, xpath, nth, has, filter — when to use which
- Playwright's built-in auto-waiting and how selectors resolve
- data-testid vs role-based selectors vs CSS — what's most resilient and why
- How Playwright Codegen generates selectors — the prioritization algorithm
- Playwright's locator.and(), locator.or(), locator.filter() for complex targeting
- AST parsing of Playwright test files: how to extract selectors from page.locator(), page.getByRole(), etc.
- Common selector breakage patterns: class name changes, DOM restructuring, dynamic IDs, framework updates
- How to compute selector "fragility score" — which selectors are likely to break next
- Existing tools: playwright-test-coverage, @playwright/test reporter API, trace viewer
- Playwright MCP server and new APIs available in 2026
```

### Research Block 2: AI for Selector Repair
```
RESEARCH: Using AI/LLM for automated DOM analysis and selector generation in 2026

Topics to investigate:
- How to feed DOM snapshots to LLMs efficiently (HTML is verbose — need smart truncation)
- Playwright's page.accessibility.snapshot() for semantic DOM representation
- Using Claude API for: "Given this DOM snapshot and the intent 'find the search input', what's the best selector?"
- Local AI options: Ollama (llama3, codellama), Groq (fast inference), local models for cost-sensitive users
- Selector intent detection: understanding WHAT a selector is trying to target (navigation, search, article list, etc.)
- Confidence scoring for AI-suggested selectors: how to compute reliability
- Multi-strategy repair: first try simple pattern matching (fast, free), then AI (slower, smarter)
- DOM diffing: comparing before/after DOM to understand what changed
- Visual regression as a signal: screenshot comparison to detect if the page looks different
- Training data: how to build a dataset of selector → intent → repair pairs
```

### Research Block 3: CLI Tool Architecture & Developer Experience
```
RESEARCH: Building world-class CLI tools for developers in 2026/2027

Topics to investigate:
- CLI frameworks: Commander.js vs Oclif vs Citty vs Clerc — which is best for 2026
- Interactive CLI: Inquirer.js vs Clack vs @clack/prompts for beautiful terminal UIs
- CLI config: cosmiconfig for .pw-doctor.config.ts / .pw-doctorrc / package.json config
- Plugin architecture: how to let users extend with custom selector strategies
- Progress reporting: ora spinners, listr2 for multi-step tasks, chalk for colors
- CLI testing: how to test a CLI tool (oclif testing patterns, vitest)
- npm package publishing: ESM/CJS dual packaging, bin entry, postinstall hooks
- Monorepo structure: CLI core + web dashboard + shared types (Turborepo)
- Version management: semantic versioning, changelogs, auto-release
- Open source licensing: MIT core + proprietary SaaS (source-available patterns like Sentry, PostHog)
```

### Research Block 4: SaaS Platform & Business Model
```
RESEARCH: Building a developer tools SaaS in 2026 — auth, billing, CI integration

Topics to investigate:
- Auth for developer tools: API keys (for CI), OAuth (for dashboard), CLI auth flow (device code grant)
- Stripe billing for usage-based pricing: per-scan pricing vs seat-based vs hybrid
- GitHub App integration: auto-scan on PR, post fix suggestions as PR comments
- GitLab CI integration: custom reporter, pipeline triggers
- Webhook architecture for CI/CD notifications
- Database: Supabase vs Neon for PostgreSQL (storing scan results, fix history, team data)
- Real-time: WebSocket for live scan progress in dashboard
- Multi-tenant architecture for team/org features
- Rate limiting and fair usage policies for API
- Developer documentation: Mintlify vs Nextra vs Starlight for docs site
```

---

## Tech Stack (2026/2027 Standards)

```
Monorepo:         Turborepo (packages: cli, web, shared, docs)
Language:         TypeScript 5.x (strict mode, ESM-first)

CLI Package:
  Framework:      Oclif or Commander.js (TBD from research)
  Interactive UI:  @clack/prompts (beautiful terminal prompts)
  Config:         cosmiconfig (.pw-doctor.config.ts)
  AST Parsing:    TypeScript Compiler API (extract selectors from test files)
  Browser:        Playwright (headless, for live site validation)
  AI Provider:    Claude API (primary) + Ollama (local fallback) + Groq (fast fallback)
  Output:         chalk + ora + listr2 (colored, animated terminal output)

Web Dashboard:
  Framework:      Next.js 15+ (App Router, Server Components)
  Styling:        Tailwind CSS 4 + Radix UI
  Charts:         Recharts or Tremor (health trends, fix history)
  Real-time:      WebSocket (live scan progress)
  Auth:           Supabase Auth (email/password + GitHub OAuth)

Shared:
  Database:       Supabase (PostgreSQL)
  Payments:       Stripe (subscriptions + usage-based)
  Email:          Resend (alerts, reports, onboarding)
  AI:             Claude API (selector analysis, intent detection)
  CI/CD:          GitHub Actions (own CI) + GitHub App (user integration)
  Monitoring:     Sentry (errors) + PostHog (product analytics)
  Docs:           Mintlify or Starlight
  Deployment:     Vercel (web) + npm (CLI)
```

---

## Core Architecture

### 1. Selector Scanner (AST-Based, Not Regex)

Parse Playwright test files using the TypeScript Compiler API to extract ALL selectors:

```typescript
// The scanner should find selectors from ALL Playwright APIs:
page.locator('css-selector')
page.locator('text=Something')
page.getByRole('button', { name: 'Submit' })
page.getByText('Hello')
page.getByTestId('login-form')
page.getByLabel('Email')
page.getByPlaceholder('Enter your email')
page.getByAltText('Logo')
page.locator('div').filter({ hasText: 'foo' })
page.locator('div >> nth=0')
// And chained locators:
page.locator('.parent').locator('.child')
page.getByRole('list').getByRole('listitem')
```

Output a structured map:
```typescript
interface SelectorMap {
  file: string;          // test file path
  line: number;          // line number
  column: number;        // column number
  selector: string;      // the selector string
  selectorType: 'css' | 'text' | 'role' | 'testid' | 'label' | 'placeholder' | 'alttext' | 'xpath';
  intent?: string;       // AI-inferred: "navigation menu", "search input", "article list"
  fragilityScore: number; // 0-100: how likely to break (class-based = high, testid = low)
  context: string;       // surrounding test code for AI context
}
```

### 2. Live Site Validator

For each extracted selector, validate against the actual live site:

```typescript
interface ValidationResult {
  selector: SelectorMap;
  status: 'healthy' | 'broken' | 'flaky' | 'degraded';
  elementCount: number;    // how many elements match
  isVisible: boolean;      // first match visible?
  responseTime: number;    // how long to find (ms)
  screenshot?: string;     // screenshot of matched element area
  domSnapshot?: string;    // accessibility tree around the match
}
```

Statuses:
- **healthy**: Selector finds expected element(s), visible, fast
- **broken**: Selector finds 0 elements
- **flaky**: Selector sometimes finds elements (run 3x, inconsistent)
- **degraded**: Selector finds elements but slowly (>2s) or finds wrong count

### 3. AI Repair Engine (Multi-Strategy)

When a selector is broken, repair in layers:

**Layer 1: Pattern Matching (Free, Fast, <100ms)**
- Check common alternatives: if `.class-name` broke, try `[data-testid]`, `[role]`, semantic HTML
- Check for common patterns: class name format changes (BEM→utility, camelCase→kebab)
- Check for DOM restructuring: parent/child relationships shifted

**Layer 2: AI Analysis (Claude API, Smart, ~2s)**
- Feed the AI:
  1. The broken selector and its intent (from test context)
  2. The current DOM snapshot (accessibility tree, not raw HTML)
  3. The test code surrounding the selector (what action follows)
  4. Historical data: what this selector looked like before
- Ask the AI to:
  1. Understand the intent ("this selector targets the main navigation menu")
  2. Find the element in the current DOM
  3. Suggest the most resilient selector
  4. Score its confidence (0-100%)

**Layer 3: Local AI Fallback (Ollama/Groq, for offline/cost-sensitive)**
- Same logic as Layer 2 but using local models
- Lower quality but free and private

**Confidence Scoring:**
```
confidence = weighted_average(
  selector_specificity * 0.2,     // testid > role > css class > nth-child
  element_uniqueness * 0.25,      // only 1 match = high, many matches = low
  visual_match * 0.2,             // screenshot comparison with baseline
  semantic_match * 0.2,           // accessibility tree similarity
  ai_confidence * 0.15            // AI's own confidence rating
)

Actions:
  > 85%: Auto-apply (with backup)
  60-85%: Suggest fix, require confirmation
  < 60%: Flag for manual review, provide context
```

### 4. File Updater (AST-Based, Not Regex)

Apply fixes by modifying the AST, not regex-replacing strings:

```typescript
// Using TypeScript Compiler API:
// 1. Parse the test file
// 2. Find the exact node containing the broken selector
// 3. Replace the selector string value
// 4. Preserve formatting, comments, and surrounding code
// 5. Write back with source map preservation
```

This is CRITICAL — the reference implementation uses regex which is fragile. AST manipulation ensures:
- No accidental changes to other parts of the file
- Correct handling of string literals (single/double quotes, template literals)
- Preserved formatting and comments
- Reversible changes (git-friendly diffs)

### 5. Verification & Rollback

After applying a fix:
1. Run the specific test that uses the fixed selector
2. If test passes → fix confirmed, commit to history
3. If test fails → rollback the change, mark as "needs manual review"
4. Store before/after states for rollback at any time

---

## Database Schema

```sql
-- Organizations (teams)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  stripe_customer_id VARCHAR(255),
  plan VARCHAR(20) DEFAULT 'free', -- free, pro, team, enterprise
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  avatar_url TEXT,
  github_username VARCHAR(50),
  organization_id UUID REFERENCES organizations(id),
  role VARCHAR(20) DEFAULT 'member', -- owner, admin, member
  api_key_hash VARCHAR(255), -- hashed API key for CLI auth
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projects (a Playwright project connected to PW-Doctor)
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  repo_url TEXT, -- GitHub/GitLab repo URL
  base_url TEXT, -- the site being tested
  config JSONB, -- project-specific pw-doctor config
  total_selectors INTEGER DEFAULT 0,
  healthy_selectors INTEGER DEFAULT 0,
  health_percentage DECIMAL(5,2) DEFAULT 100,
  last_scan_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, slug)
);

-- Selectors (every selector found in the project)
CREATE TABLE selectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_path VARCHAR(500) NOT NULL,
  line_number INTEGER NOT NULL,
  column_number INTEGER,
  selector_value TEXT NOT NULL,
  selector_type VARCHAR(20) NOT NULL, -- css, text, role, testid, etc.
  intent VARCHAR(100), -- AI-inferred intent
  fragility_score INTEGER DEFAULT 50, -- 0-100
  status VARCHAR(20) DEFAULT 'unknown', -- healthy, broken, flaky, degraded, unknown
  last_validated_at TIMESTAMPTZ,
  consecutive_failures INTEGER DEFAULT 0,
  total_repairs INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_selectors_project ON selectors(project_id, status);
CREATE INDEX idx_selectors_file ON selectors(project_id, file_path);

-- Scans (each time pw-doctor runs)
CREATE TABLE scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  triggered_by UUID REFERENCES users(id), -- null if CI-triggered
  trigger_source VARCHAR(20) NOT NULL, -- cli, ci, scheduled, webhook
  status VARCHAR(20) NOT NULL, -- running, completed, failed
  total_selectors INTEGER DEFAULT 0,
  healthy INTEGER DEFAULT 0,
  broken INTEGER DEFAULT 0,
  flaky INTEGER DEFAULT 0,
  degraded INTEGER DEFAULT 0,
  auto_fixed INTEGER DEFAULT 0,
  needs_review INTEGER DEFAULT 0,
  duration_ms INTEGER,
  git_commit VARCHAR(40),
  git_branch VARCHAR(100),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX idx_scans_project ON scans(project_id, started_at DESC);

-- Repairs (each fix applied)
CREATE TABLE repairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  selector_id UUID NOT NULL REFERENCES selectors(id) ON DELETE CASCADE,
  old_value TEXT NOT NULL,
  new_value TEXT NOT NULL,
  repair_strategy VARCHAR(20) NOT NULL, -- pattern_match, ai_claude, ai_local, manual
  confidence DECIMAL(5,2) NOT NULL, -- 0-100
  status VARCHAR(20) NOT NULL, -- applied, verified, rolled_back, pending_review
  ai_reasoning TEXT, -- AI's explanation of the fix
  verification_passed BOOLEAN,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX idx_repairs_scan ON repairs(scan_id);
CREATE INDEX idx_repairs_selector ON repairs(selector_id, applied_at DESC);

-- Selector Health History (time series for trend charts)
CREATE TABLE selector_health_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  total_selectors INTEGER,
  healthy INTEGER,
  broken INTEGER,
  flaky INTEGER,
  degraded INTEGER,
  health_percentage DECIMAL(5,2),
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_health_history ON selector_health_history(project_id, recorded_at DESC);

-- API Usage Tracking (for billing)
CREATE TABLE api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scan_id UUID REFERENCES scans(id),
  operation VARCHAR(50) NOT NULL, -- scan, repair_ai, repair_pattern, validate
  ai_tokens_used INTEGER DEFAULT 0,
  cost_cents INTEGER DEFAULT 0,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_usage_org ON api_usage(organization_id, recorded_at DESC);

-- GitHub/CI Integrations
CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL, -- github, gitlab, slack, teams
  config JSONB NOT NULL, -- encrypted connection details
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## CLI Commands

### `pw-doctor init`
- Detect Playwright project (find playwright.config.ts)
- Create `.pw-doctor.config.ts` with defaults
- Optionally link to SaaS account (device code auth flow)
- Scan for all selectors and show initial health report

### `pw-doctor check` (alias: `pw-doctor validate`)
- Parse all test files, extract selectors
- Validate each against live site (headless browser)
- Report health status per file, per selector type
- Exit code 0 = all healthy, 1 = broken found (for CI)
- Output: table of results, summary stats, fragility warnings

### `pw-doctor heal` (alias: `pw-doctor fix`)
- Run `check` first
- For broken selectors: attempt repair (pattern → AI → manual)
- Show proposed changes with confidence scores
- Interactive mode: confirm each fix
- `--auto` flag: auto-apply fixes above confidence threshold
- `--dry-run` flag: show what would change without applying
- `--ai-provider` flag: choose claude/ollama/groq

### `pw-doctor watch`
- Continuous monitoring mode
- Re-validate selectors on file change (chokidar)
- Alert on new breakages
- Auto-heal if configured
- Useful during active development

### `pw-doctor report`
- Generate detailed HTML report
- Show health trends over time
- List most fragile selectors
- Suggest proactive improvements (e.g., "migrate 23 CSS selectors to data-testid")

### `pw-doctor login`
- Device code flow to authenticate with SaaS dashboard
- Store API key in system keychain or ~/.pw-doctor/credentials

---

## Pricing Tiers

### Free (Open Source CLI)
- Unlimited local scans
- Pattern matching repairs (no AI)
- Basic terminal output
- Community support

### Pro ($19/month per seat)
- AI-powered repairs (Claude API — included, no BYOK needed)
- Web dashboard with history and trends
- GitHub/GitLab CI integration
- Slack notifications
- Email reports
- 500 AI repair calls/month

### Team ($49/month per seat, min 3 seats)
- Everything in Pro
- Team management and permissions
- Cross-project analytics
- Priority AI repairs (faster, more context)
- Custom confidence thresholds
- SSO (SAML)
- 2,000 AI repair calls/month/seat

### Enterprise (Custom)
- Self-hosted option
- Unlimited AI calls
- Custom AI model fine-tuning
- SLA and dedicated support
- Audit logs
- On-premise deployment

---

## Page Architecture (Web Dashboard)

### Public Pages
```
/                    → Landing page (upgrade from current static HTML — use Next.js)
/pricing             → Pricing comparison
/docs                → Documentation (Mintlify-powered or embedded)
/blog                → Engineering blog, tutorials
/changelog           → Product updates
```

### Dashboard Pages (Auth Required)
```
/dashboard           → Overview: all projects, health summary, recent scans
/projects            → List projects
/projects/new        → Connect new Playwright project
/projects/[id]       → Project detail: selector health, trend chart, file tree
/projects/[id]/scans → Scan history with drill-down
/projects/[id]/scans/[id] → Scan detail: every selector, fix applied, confidence
/projects/[id]/selectors → All selectors with health status, fragility, intent
/projects/[id]/repairs → Repair history, review queue for pending fixes
/projects/[id]/settings → Project config, base URL, CI integration
/team                → Team members, invitations, roles
/settings            → Account, billing, API keys, integrations
/settings/billing    → Stripe customer portal, usage, invoices
/settings/integrations → GitHub App, GitLab, Slack, Teams connections
```

### API Routes
```
/api/auth/device-code    → CLI authentication (device code flow)
/api/auth/verify         → Verify API key
/api/projects            → CRUD projects
/api/projects/[id]/scan  → Trigger scan (from CI/webhook)
/api/projects/[id]/selectors → List selectors with health
/api/projects/[id]/repairs → List repairs, approve/reject pending
/api/scans/[id]          → Scan results
/api/scans/[id]/stream   → WebSocket: live scan progress
/api/ai/analyze          → AI selector analysis endpoint
/api/ai/suggest-fix      → AI fix suggestion endpoint
/api/stripe/webhook      → Stripe webhook handler
/api/github/webhook      → GitHub App webhook (PR events)
/api/usage               → Usage stats for billing
```

---

## Implementation Plan (12 Weeks)

### Weeks 1-2: CLI Foundation
- [ ] Turborepo monorepo setup (packages: cli, web, shared)
- [ ] CLI framework with init, check, heal, report commands
- [ ] TypeScript AST parser: extract all Playwright selectors from test files
- [ ] Config system: `.pw-doctor.config.ts` with cosmiconfig
- [ ] Selector classification: type, fragility score, file location
- [ ] Beautiful terminal output: tables, progress bars, colored status

### Weeks 3-4: Live Validation & Pattern Repair
- [ ] Headless Playwright browser pool for parallel validation
- [ ] Validate selectors against live sites with status reporting
- [ ] Pattern matching repair engine (common alternatives, DOM patterns)
- [ ] File updater using TypeScript AST (not regex)
- [ ] Backup/rollback system for all changes
- [ ] `pw-doctor check` working end-to-end with exit codes for CI
- [ ] `pw-doctor heal` working with pattern-match-only repairs

### Weeks 5-6: AI Repair Engine
- [ ] Claude API integration for selector analysis
- [ ] DOM snapshot preparation (accessibility tree, smart truncation)
- [ ] Intent detection: understand what a selector targets
- [ ] AI-powered fix suggestions with confidence scoring
- [ ] Ollama/Groq local AI fallback
- [ ] Multi-strategy repair pipeline: pattern → AI → manual
- [ ] Confidence threshold system: auto-apply / suggest / flag
- [ ] `pw-doctor heal --ai-provider claude` working end-to-end

### Weeks 7-8: Web Dashboard Foundation
- [ ] Next.js 15 web app with Supabase auth
- [ ] Database schema migration
- [ ] API routes for projects, scans, selectors, repairs
- [ ] Dashboard overview: project list, health badges, last scan
- [ ] Project detail: selector health chart, file tree, scan history
- [ ] Scan detail: every selector with status, fix applied, confidence
- [ ] Repair review queue: approve/reject AI-suggested fixes
- [ ] CLI → SaaS sync: upload scan results, download settings

### Weeks 9-10: CI Integration & Team Features
- [ ] GitHub App: auto-scan on PR, post fix suggestions as PR review comments
- [ ] GitLab CI: custom reporter, pipeline integration
- [ ] Device code auth flow for CLI → SaaS connection
- [ ] API key management (create, revoke, rotate)
- [ ] Team invitations, roles, permissions
- [ ] Slack integration: scan results, breakage alerts
- [ ] Watch mode: continuous monitoring during development

### Weeks 11-12: Billing, Polish & Launch
- [ ] Stripe subscriptions: Free/Pro/Team tiers
- [ ] Usage tracking: AI repair calls, scan count
- [ ] Usage billing for overages
- [ ] Landing page rebuild in Next.js (keep glassmorphism design language)
- [ ] Documentation site (Mintlify or Starlight)
- [ ] npm package publishing pipeline
- [ ] GitHub Actions for own CI/CD
- [ ] Health trend charts and historical analytics
- [ ] Email: welcome, scan reports, weekly digests, alert notifications
- [ ] Open source README, CONTRIBUTING.md, LICENSE (MIT for CLI core)
- [ ] Product Hunt launch preparation

---

## Key Differentiators (Why PW-Doctor Wins)

1. **AST-based, not regex** — Parses test files properly, understands Playwright APIs, makes precise edits
2. **Multi-strategy AI** — Not just "ask ChatGPT" — layered approach from pattern matching (free, fast) to Claude API (smart) to local models (private)
3. **Confidence scoring** — Never auto-applies a fix without quantifying its reliability
4. **Developer-first UX** — CLI is the primary interface, not a web-only SaaS
5. **Open source core** — CLI is free forever, SaaS adds team features and AI
6. **CI-native** — Exit codes, GitHub App PR comments, GitLab pipeline integration
7. **Proactive, not reactive** — Fragility scoring warns you BEFORE selectors break

---

## Non-Negotiable Requirements

1. **AST parsing** — Never use regex to find or modify selectors in test files
2. **Real browser validation** — Selectors must be checked against the actual live site using Playwright
3. **Confidence scoring on every fix** — Users must know how reliable a suggested fix is
4. **Rollback capability** — Every change can be undone, always keep backups
5. **Works offline** — Pattern matching repairs work without internet/AI
6. **CI exit codes** — `pw-doctor check` returns proper exit codes for CI pipelines
7. **No vendor lock-in** — CLI works standalone, SaaS is optional enhancement
8. **Multi-AI support** — Claude API + Ollama + Groq, user chooses their provider
9. **Type-safe** — Strict TypeScript throughout, Zod validation on all inputs
10. **Beautiful DX** — Terminal output should be as polished as a modern CLI tool (think Astro, Biome, Turbo)

---

## What Success Looks Like

A QA engineer should be able to:

1. `npm install -g pw-doctor` in their existing Playwright project
2. `pw-doctor init` — scans the project, shows 247 selectors found, 12 fragile
3. `pw-doctor check` — validates against live site, finds 3 broken selectors
4. `pw-doctor heal` — AI suggests fixes with 91%, 87%, and 62% confidence
5. Auto-applies the two high-confidence fixes, flags the third for review
6. Runs the affected tests — both pass
7. `pw-doctor report` — shows health improved from 98.8% to 100%
8. Links to SaaS dashboard — sees trend chart showing health over last 30 days
9. Sets up GitHub Action — every PR now auto-checks selector health
10. Gets Slack notification when a deploy breaks a selector — fix is suggested within seconds

That's PW-Doctor — the tool that makes Playwright test maintenance a solved problem.
