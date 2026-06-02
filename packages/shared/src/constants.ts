// packages/shared/src/constants.ts

export const PLAYWRIGHT_LOCATOR_METHODS = [
  'locator',
  'getByRole',
  'getByTestId',
  'getByText',
  'getByLabel',
  'getByPlaceholder',
  'getByAltText',
  'getByTitle',
  'frameLocator',
] as const;

export const PLAYWRIGHT_RECEIVERS = [
  'page',
  'locator',
  'frame',
  'frameLocator',
] as const;

export const EXIT_CODES = {
  HEALTHY: 0,
  BROKEN_FOUND: 1,
  TOOL_ERROR: 2,
  FIXES_APPLIED: 3,
  FIXES_FAILED: 4,
} as const;

export const CONFIG_FILE_NAMES = [
  '.pw-doctor.config.json',
  '.pw-doctor.config.yaml',
  '.pw-doctor.config.yml',
  '.pw-doctorrc.json',
  '.pw-doctorrc.yaml',
  '.pw-doctorrc.yml',
];

export const PW_DOCTOR_DIR = '.pw-doctor';
export const SCHEMA_VERSION = 1;

/**
 * Default AI model. Single source of truth for schemas, defaults, and adapters.
 * Bump when the model line changes; cost-estimator pricing must follow.
 */
export const DEFAULT_AI_MODEL = 'claude-sonnet-4-6';

/**
 * Patterns redacted from any DOM text/attribute before it is sent to an AI
 * provider. Ordering matters: more specific token shapes come before the
 * broad high-entropy catch-all so the specific label is what survives in the
 * [REDACTED] swap. Every pattern is global (/g) and stateless — the redactor
 * clones a fresh RegExp per use to avoid `lastIndex` carry-over.
 */
export const REDACT_SENSITIVE_PATTERNS = [
  // Emails (PII)
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  // JWTs (header.payload, optional signature)
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]+)?/g,
  // Anthropic keys (before the generic sk- rule so the longer match wins)
  /sk-ant-[A-Za-z0-9_-]{20,}/g,
  // OpenAI / generic sk- keys (incl. sk-proj-)
  /sk-[A-Za-z0-9_-]{20,}/g,
  // Stripe publishable/secret keys
  /[ps]k_(live|test)_[A-Za-z0-9]{10,}/g,
  // GitHub tokens (PAT, OAuth, app, refresh, server-to-server)
  /gh[pos_ru]_[A-Za-z0-9]{20,}/g,
  // AWS access key IDs
  /(?:AKIA|ASIA)[A-Z0-9]{16}/g,
  // Google API keys
  /AIza[A-Za-z0-9_-]{20,}/g,
  // Slack tokens
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,
  // Bearer / Authorization tokens (header style)
  /\b[Bb]earer\s+[A-Za-z0-9._~+/=-]{12,}/g,
  // Cookie / Set-Cookie style name=value blobs (best-effort; redacts the value)
  /\b(?:Set-)?[Cc]ookie\s*[:=]\s*[^\s;,'"]+/g,
  // session/csrf/auth/token "name=value" pairs anywhere (value redacted)
  /\b(?:session|sess|sid|csrf|xsrf|auth|access[_-]?token|refresh[_-]?token|api[_-]?key|secret|password|passwd|pwd)["'\]]?\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{6,}/gi,
  // Credit-card-shaped digit groups (13-16 digits, optional separators)
  /\b(?:\d[ -]?){13,16}\b/g,
  // US SSN
  /\b\d{3}-\d{2}-\d{4}\b/g,
  // IPv4 addresses
  /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
  // E.164-ish phone numbers
  /\b\+?\d[\d\s().-]{7,}\d\b/g,
  // UUIDs (often session/user identifiers)
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
] as const;

/**
 * The full set of inline event-handler attributes the redactor strips from any
 * DOM before it leaves the machine. Shared so the config default and the
 * redactor cannot drift (a narrowed config default previously re-enabled
 * inline JS in the AI payload).
 */
export const STRIP_EVENT_HANDLER_ATTRIBUTES = [
  'style',
  'onclick', 'ondblclick', 'onmousedown', 'onmouseup', 'onmouseover',
  'onmousemove', 'onmouseout', 'onkeydown', 'onkeypress', 'onkeyup',
  'onload', 'onunload', 'onsubmit', 'onreset', 'onfocus', 'onblur',
  'onchange', 'oninput', 'onscroll', 'onerror', 'onresize',
  'oncontextmenu', 'ondrag', 'ondragend', 'ondragenter', 'ondragleave',
  'ondragover', 'ondragstart', 'ondrop',
] as const;

export const SELECTOR_RELEVANT_ATTRIBUTES = [
  'data-testid', 'data-test', 'data-cy',
  'role', 'aria-label', 'aria-labelledby', 'aria-describedby',
  'id', 'name', 'class', 'type', 'placeholder', 'alt', 'title',
  'href', 'for', 'value',
] as const;

export const PW_DOCTOR_CAPTURES_DIR = '.pw-doctor/captures';
