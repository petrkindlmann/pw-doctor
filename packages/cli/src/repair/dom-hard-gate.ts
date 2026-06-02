import type { DomAnalyzer, DomElement } from '../core/dom-analyzer.js';

export interface DomGateCandidate {
  selector: string;
  method: string;
  /** Accessible name for a getByRole candidate (role + name pair). */
  name?: string;
}

export interface DomGateOptions {
  /**
   * The action the test will perform on the matched element.
   * When set, the gate enforces that the matched element's tag/role
   * is compatible with that action.
   *
   * Example: `click` → element must be interactive (button, link,
   * input, [role=button|link|menuitem|tab|...]).
   */
  expectedAction?: 'click' | 'fill' | 'check' | 'select' | 'hover' | 'press';
}

export interface DomGateResult {
  passes: boolean;
  reason?: string;
}

const INTERACTIVE_TAGS = new Set([
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  'details',
  'label',
]);

const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'tab',
  'switch',
  'checkbox',
  'radio',
  'option',
  'textbox',
  'combobox',
  'searchbox',
  'spinbutton',
  'slider',
  'treeitem',
]);

const FORM_TAGS = new Set(['input', 'textarea', 'select']);

const FORM_ROLES = new Set([
  'textbox',
  'searchbox',
  'spinbutton',
  'combobox',
  'slider',
]);

const CHECKABLE_TAGS = new Set(['input']);

const CHECKABLE_ROLES = new Set(['checkbox', 'radio', 'switch', 'menuitemcheckbox', 'menuitemradio']);

const SELECTABLE_TAGS = new Set(['select']);

const SELECTABLE_ROLES = new Set(['combobox', 'listbox']);

function isInteractive(el: DomElement): boolean {
  if (INTERACTIVE_TAGS.has(el.tag)) return true;
  const role = el.attributes['role'];
  if (role && INTERACTIVE_ROLES.has(role)) return true;
  // tabindex on a non-interactive element exposes it to keyboard activation
  if (el.attributes['tabindex'] !== undefined && el.attributes['tabindex'] !== '-1') {
    return true;
  }
  return false;
}

function isFormField(el: DomElement): boolean {
  if (FORM_TAGS.has(el.tag)) {
    // <input type=button|submit|...> is not a fillable field
    const type = (el.attributes['type'] ?? 'text').toLowerCase();
    if (el.tag === 'input' && ['button', 'submit', 'reset', 'image', 'checkbox', 'radio', 'file'].includes(type)) {
      return false;
    }
    return true;
  }
  const role = el.attributes['role'];
  return role !== undefined && FORM_ROLES.has(role);
}

function isCheckable(el: DomElement): boolean {
  if (CHECKABLE_TAGS.has(el.tag)) {
    const type = (el.attributes['type'] ?? '').toLowerCase();
    if (type === 'checkbox' || type === 'radio') return true;
  }
  const role = el.attributes['role'];
  return role !== undefined && CHECKABLE_ROLES.has(role);
}

function isSelectable(el: DomElement): boolean {
  if (SELECTABLE_TAGS.has(el.tag)) return true;
  const role = el.attributes['role'];
  return role !== undefined && SELECTABLE_ROLES.has(role);
}

function checkActionCompatibility(
  el: DomElement,
  action: NonNullable<DomGateOptions['expectedAction']>,
): { ok: true } | { ok: false; reason: string } {
  switch (action) {
    case 'click':
    case 'hover':
    case 'press':
      if (!isInteractive(el)) {
        return { ok: false, reason: `${action} target is <${el.tag}> with no interactive role` };
      }
      return { ok: true };
    case 'fill':
      if (!isFormField(el)) {
        return { ok: false, reason: `fill target <${el.tag}> is not a form field` };
      }
      return { ok: true };
    case 'check':
      if (!isCheckable(el)) {
        return { ok: false, reason: `check target <${el.tag}> is not a checkbox/radio/switch` };
      }
      return { ok: true };
    case 'select':
      if (!isSelectable(el)) {
        return { ok: false, reason: `select target <${el.tag}> is not a <select> or combobox` };
      }
      return { ok: true };
  }
}

export function verifyAgainstDom(
  candidate: DomGateCandidate,
  analyzer: DomAnalyzer,
  options?: DomGateOptions,
): DomGateResult {
  let matches: DomElement[];

  try {
    matches = findMatches(candidate, analyzer);
  } catch {
    return { passes: false, reason: 'selector query threw an error' };
  }

  if (matches.length === 0) {
    return { passes: false, reason: 'no elements matched' };
  }

  if (matches.length > 1) {
    return { passes: false, reason: `matched ${matches.length} elements, expected 1` };
  }

  if (!matches[0].isVisible) {
    return { passes: false, reason: 'matched element is not visible' };
  }

  if (options?.expectedAction) {
    const compat = checkActionCompatibility(matches[0], options.expectedAction);
    if (!compat.ok) {
      return { passes: false, reason: compat.reason };
    }
  }

  return { passes: true };
}

function findMatches(candidate: DomGateCandidate, analyzer: DomAnalyzer): DomElement[] {
  switch (candidate.method) {
    case 'locator':
      return analyzer.findByCss(candidate.selector);
    case 'getByTestId':
      return analyzer.findByAttribute('data-testid', candidate.selector);
    case 'getByRole':
      return analyzer.findByRole(candidate.selector, candidate.name);
    case 'getByText':
      return analyzer.findByText(candidate.selector);
    case 'getByLabel':
      return analyzer.findByAttribute('aria-label', candidate.selector);
    case 'getByPlaceholder':
      return analyzer.findByAttribute('placeholder', candidate.selector);
    case 'getByAltText':
      return analyzer.findByAttribute('alt', candidate.selector);
    case 'getByTitle':
      return analyzer.findByAttribute('title', candidate.selector);
    default:
      return [];
  }
}
