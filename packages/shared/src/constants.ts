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
