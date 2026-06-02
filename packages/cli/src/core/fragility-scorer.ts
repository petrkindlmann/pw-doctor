import type { SelectorInfo, SelectorType } from '@pw-doctor/shared';

const TYPE_BASE_SCORES: Record<SelectorType, number> = {
  testid: 10,
  role: 15,
  label: 20,
  title: 25,
  placeholder: 30,
  alttext: 30,
  text: 40,
  id: 35,
  css: 65,
  xpath: 80,
  dynamic: 90,
};

const TYPE_LABEL: Record<SelectorType, string> = {
  testid: 'data-testid',
  role: 'ARIA role',
  label: 'accessible label',
  title: 'title',
  placeholder: 'placeholder',
  alttext: 'alt text',
  text: 'visible text',
  id: 'id',
  css: 'CSS selector',
  xpath: 'XPath',
  dynamic: 'dynamic selector',
};

export interface FragilityResult {
  /** 0..100, higher = more fragile. */
  score: number;
  /** Human-readable contributing factors, e.g. `nth-child positional +15`. */
  reasons: string[];
}

/**
 * Heuristics that detect generated / non-semantic class names. These change on
 * every build (CSS-in-JS hashes, CSS-modules, Tailwind arbitrary values) and
 * make a selector fragile.
 */
const HASHED_CLASS_PATTERNS: Array<{ re: RegExp; why: string }> = [
  { re: /\bcss-[a-z0-9]{4,}\b/i, why: 'emotion/styled hashed class' },
  { re: /\b[a-z][\w-]*__[\w-]+--[\w-]+/i, why: 'BEM-with-hash build class' },
  { re: /\b[\w-]+_[\w-]{5,}\b/, why: 'CSS-modules hashed class' },
  { re: /\b[\w-]+-[0-9a-f]{6,}\b/i, why: 'hex-suffixed generated class' },
  { re: /\[[^\]]*[#:][^\]]*\]/, why: 'Tailwind arbitrary-value class' },
];

/**
 * Layout/utility class fragments that describe presentation, not identity.
 * Matching on these tends to bind tests to incidental styling.
 */
const LAYOUT_CLASS_TOKENS = new Set([
  'container', 'row', 'col', 'wrapper', 'inner', 'outer', 'flex', 'grid',
  'block', 'inline', 'hidden', 'mt', 'mb', 'ml', 'mr', 'pt', 'pb', 'pl', 'pr',
  'd-flex', 'd-none', 'text-center', 'pull-left', 'pull-right',
]);

function hasLayoutOnlyClass(value: string): boolean {
  const classes = value.match(/\.([a-zA-Z0-9_-]+)/g) ?? [];
  return classes.some((c) => {
    const name = c.slice(1).toLowerCase();
    return (
      LAYOUT_CLASS_TOKENS.has(name) ||
      /^col-(xs|sm|md|lg|xl)?-?\d/.test(name) ||
      /^(m|p)[trblxy]?-\d/.test(name)
    );
  });
}

/**
 * Score the fragility of a selector and explain why. Pure and deterministic so
 * a QA engineer can see exactly which factors moved the number.
 */
export function scoreFragility(selector: SelectorInfo): FragilityResult {
  const reasons: string[] = [];
  const value = selector.selectorValue;
  const base = TYPE_BASE_SCORES[selector.selectorType] ?? 50;
  let score = base;
  reasons.push(`${TYPE_LABEL[selector.selectorType] ?? 'selector'} base ${base}`);

  const add = (delta: number, why: string) => {
    score += delta;
    reasons.push(`${why} ${delta >= 0 ? '+' : ''}${delta}`);
  };

  // Positional / structural penalties
  if (value.includes('nth-child')) add(15, 'nth-child positional');
  if (value.includes('nth-of-type')) add(15, 'nth-of-type positional');
  if (value.includes(':nth(')) add(10, ':nth() positional');
  if (value.includes('>>')) add(10, 'Playwright chained `>>`');
  if (value.includes(':has(')) add(5, ':has() relational');

  // Long descendant chains (combinators) and long class chains
  const combinators = (value.match(/[>+~]|\s(?=[.#a-zA-Z*\[])/g) || []).length;
  if (combinators >= 3) add(15, `long descendant chain (${combinators} combinators)`);
  else if (combinators === 2) add(8, 'descendant chain');
  const dotCount = (value.match(/\./g) || []).length;
  if (dotCount > 2) add(10, `long class chain (${dotCount} classes)`);

  // Hashed / generated classes
  for (const { re, why } of HASHED_CLASS_PATTERNS) {
    if (re.test(value)) {
      add(20, `${why}`);
      break;
    }
  }

  // Layout-only / utility classes
  if (hasLayoutOnlyClass(value)) add(12, 'layout-only/utility class');

  // Specificity bonuses
  if (value.includes('data-testid')) add(-20, 'has data-testid');
  if (/^#[a-z][\w-]+$/i.test(value)) add(-10, 'clean static id');

  const clamped = Math.max(0, Math.min(100, score));
  if (clamped !== score) reasons.push(`clamped to ${clamped}`);
  return { score: clamped, reasons };
}

export function computeFragilityScore(selector: SelectorInfo): number {
  return scoreFragility(selector).score;
}

/**
 * Estimate fragility from a raw selector string + Playwright method, used by
 * the candidate ranker to down-weight fragile repair candidates. Maps the
 * method to a SelectorType so the same scoring table applies.
 */
const METHOD_TO_TYPE: Record<string, SelectorType> = {
  getByTestId: 'testid',
  getByRole: 'role',
  getByLabel: 'label',
  getByText: 'text',
  getByPlaceholder: 'placeholder',
  getByAltText: 'alttext',
  getByTitle: 'title',
  locator: 'css',
};

export function scoreSelectorStringFragility(
  selector: string,
  method: string,
): FragilityResult {
  let type: SelectorType = METHOD_TO_TYPE[method] ?? 'css';
  if (method === 'locator') {
    if (selector.startsWith('//') || selector.startsWith('xpath=')) type = 'xpath';
    else if (/^#[a-z][\w-]+$/i.test(selector)) type = 'id';
  }
  return scoreFragility({
    filePath: '',
    line: 0,
    column: 0,
    selectorValue: selector,
    selectorType: type,
    apiMethod: method,
    isDynamic: false,
    contextCode: '',
    fragilityScore: 0,
  });
}

export function enrichWithFragility(selectors: SelectorInfo[]): SelectorInfo[] {
  return selectors.map((s) => ({
    ...s,
    fragilityScore: computeFragilityScore(s),
  }));
}
