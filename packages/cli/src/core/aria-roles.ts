/**
 * ARIA role helpers used by attribute_match so it only emits `getByRole` with a
 * role Playwright actually understands, and can recover the implicit role of a
 * native element that has no explicit `role` attribute.
 */

/** The subset of WAI-ARIA roles Playwright's getByRole accepts. */
export const ARIA_ROLES = new Set<string>([
  'alert', 'alertdialog', 'application', 'article', 'banner', 'blockquote',
  'button', 'caption', 'cell', 'checkbox', 'code', 'columnheader', 'combobox',
  'complementary', 'contentinfo', 'definition', 'deletion', 'dialog',
  'directory', 'document', 'emphasis', 'feed', 'figure', 'form', 'generic',
  'grid', 'gridcell', 'group', 'heading', 'img', 'insertion', 'link', 'list',
  'listbox', 'listitem', 'log', 'main', 'marquee', 'math', 'meter', 'menu',
  'menubar', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'navigation',
  'none', 'note', 'option', 'paragraph', 'presentation', 'progressbar',
  'radio', 'radiogroup', 'region', 'row', 'rowgroup', 'rowheader',
  'scrollbar', 'search', 'searchbox', 'separator', 'slider', 'spinbutton',
  'status', 'strong', 'subscript', 'superscript', 'switch', 'tab', 'table',
  'tablist', 'tabpanel', 'term', 'textbox', 'time', 'timer', 'toolbar',
  'tooltip', 'tree', 'treegrid', 'treeitem',
]);

export function isValidAriaRole(role: string): boolean {
  return ARIA_ROLES.has(role.trim().toLowerCase());
}

/**
 * Implicit ARIA role of common native HTML elements. Best-effort — covers the
 * tags QA selectors most often target. Returns undefined when the implicit role
 * is ambiguous (e.g. depends on attributes we don't have) or has none.
 */
export function implicitRole(
  tag: string,
  attributes: Record<string, string>,
): string | undefined {
  const t = tag.toLowerCase();
  switch (t) {
    case 'button':
      return 'button';
    case 'a':
      return attributes['href'] !== undefined ? 'link' : undefined;
    case 'nav':
      return 'navigation';
    case 'main':
      return 'main';
    case 'header':
      return 'banner';
    case 'footer':
      return 'contentinfo';
    case 'aside':
      return 'complementary';
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return 'heading';
    case 'img':
      return attributes['alt'] !== undefined ? 'img' : undefined;
    case 'ul':
    case 'ol':
      return 'list';
    case 'li':
      return 'listitem';
    case 'table':
      return 'table';
    case 'select':
      return 'combobox';
    case 'textarea':
      return 'textbox';
    case 'input': {
      const type = (attributes['type'] ?? 'text').toLowerCase();
      const ROLE_BY_INPUT_TYPE: Record<string, string> = {
        button: 'button',
        submit: 'button',
        reset: 'button',
        checkbox: 'checkbox',
        radio: 'radio',
        range: 'slider',
        number: 'spinbutton',
        search: 'searchbox',
        email: 'textbox',
        tel: 'textbox',
        url: 'textbox',
        text: 'textbox',
      };
      return ROLE_BY_INPUT_TYPE[type];
    }
    default:
      return undefined;
  }
}

/**
 * Accessible name of an element, best-effort from the static snapshot: explicit
 * aria-label wins, then visible text, then alt/title/value. Returns undefined
 * when there is nothing usable.
 */
export function accessibleName(
  attributes: Record<string, string>,
  text: string,
): string | undefined {
  const label = attributes['aria-label']?.trim();
  if (label) return label;
  const trimmed = text.trim();
  if (trimmed && trimmed.length <= 50) return trimmed;
  const alt = attributes['alt']?.trim();
  if (alt) return alt;
  const title = attributes['title']?.trim();
  if (title) return title;
  return undefined;
}
