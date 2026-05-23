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

export const REDACT_SENSITIVE_PATTERNS = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /sk-ant-[A-Za-z0-9-]{20,}/g,
  /pk_(live|test)_[A-Za-z0-9]{10,}/g,
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
] as const;

export const SELECTOR_RELEVANT_ATTRIBUTES = [
  'data-testid', 'data-test', 'data-cy',
  'role', 'aria-label', 'aria-labelledby', 'aria-describedby',
  'id', 'name', 'class', 'type', 'placeholder', 'alt', 'title',
  'href', 'for', 'value',
] as const;

export const PW_DOCTOR_CAPTURES_DIR = '.pw-doctor/captures';
