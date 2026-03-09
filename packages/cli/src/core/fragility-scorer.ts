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

export function computeFragilityScore(selector: SelectorInfo): number {
  let score = TYPE_BASE_SCORES[selector.selectorType] ?? 50;

  const value = selector.selectorValue;

  // Structural penalties
  if (value.includes('nth-child')) score += 15;
  if (value.includes('nth-of-type')) score += 15;
  if (value.includes('>>')) score += 10;
  if ((value.match(/\./g) || []).length > 2) score += 10;
  if (value.includes(':has(')) score += 5;
  if (value.includes(':nth(')) score += 10;

  // Specificity bonus
  if (value.includes('data-testid')) score -= 20;
  if (/^#[a-z][\w-]+$/i.test(value)) score -= 10;

  return Math.max(0, Math.min(100, score));
}

export function enrichWithFragility(selectors: SelectorInfo[]): SelectorInfo[] {
  return selectors.map((s) => ({
    ...s,
    fragilityScore: computeFragilityScore(s),
  }));
}
