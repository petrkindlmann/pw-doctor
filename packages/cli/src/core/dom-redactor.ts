import * as cheerio from 'cheerio';
import { REDACT_SENSITIVE_PATTERNS, SELECTOR_RELEVANT_ATTRIBUTES } from '@pw-doctor/shared';
import type { AnyNode, Element } from 'domhandler';

export interface RedactionOptions {
  preset?: 'moderate' | 'strict' | 'minimal';
  stripAttributes?: string[];
  preserveAttributes?: string[];
  stripSelectors?: string[];
  customPatterns?: RegExp[];
  maxDepth?: number;
  maxSize?: number;
}

export interface RedactionResult {
  html: string;
  stats: {
    elementsRemoved: number;
    attributesStripped: number;
    patternsRedacted: number;
    truncated: boolean;
  };
}

const DEFAULT_STRIP_ATTRIBUTES = [
  'style',
  'onclick', 'ondblclick', 'onmousedown', 'onmouseup', 'onmouseover',
  'onmousemove', 'onmouseout', 'onkeydown', 'onkeypress', 'onkeyup',
  'onload', 'onunload', 'onsubmit', 'onreset', 'onfocus', 'onblur',
  'onchange', 'oninput', 'onscroll', 'onerror', 'onresize',
  'oncontextmenu', 'ondrag', 'ondragend', 'ondragenter', 'ondragleave',
  'ondragover', 'ondragstart', 'ondrop',
];

const SELECTOR_RELEVANT_SET = new Set<string>(SELECTOR_RELEVANT_ATTRIBUTES);

/**
 * Creates fresh RegExp copies from the shared patterns to avoid stateful lastIndex issues
 * with the global /g flag on module-level constants.
 */
function freshPatterns(): RegExp[] {
  return REDACT_SENSITIVE_PATTERNS.map(
    (p) => new RegExp(p.source, p.flags),
  );
}

function redactString(value: string, patterns: RegExp[], stats: RedactionResult['stats']): string {
  let result = value;
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const replaced = result.replace(pattern, '[REDACTED]');
    if (replaced !== result) {
      // Count the number of replacements
      const freshP = new RegExp(pattern.source, pattern.flags);
      const matches = result.match(freshP);
      stats.patternsRedacted += matches ? matches.length : 0;
      result = replaced;
    }
  }
  return result;
}

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname) {
      return parsed.hostname;
    }
    return '[REDACTED]';
  } catch {
    // Try adding a scheme to see if it's a bare domain with path
    try {
      const parsed = new URL('https://' + url);
      if (parsed.hostname && parsed.hostname.includes('.')) {
        return parsed.hostname;
      }
    } catch {
      // not a URL
    }
    return '[REDACTED]';
  }
}

function getDepth($: cheerio.CheerioAPI, el: AnyNode): number {
  let depth = 0;
  let current: AnyNode | null = el;
  while (current && current.type === 'tag') {
    const parent: cheerio.Cheerio<AnyNode> = $(current).parent();
    if (!parent.length || !parent.prop('tagName')) break;
    const parentTag = (parent.prop('tagName') as string ?? '').toLowerCase();
    if (parentTag === 'html' || parentTag === 'body' || parentTag === '') break;
    depth++;
    current = parent[0] ?? null;
  }
  return depth;
}

export function redactHtml(html: string, options?: RedactionOptions): RedactionResult {
  const preset = options?.preset ?? 'moderate';
  const stats: RedactionResult['stats'] = {
    elementsRemoved: 0,
    attributesStripped: 0,
    patternsRedacted: 0,
    truncated: false,
  };

  const $ = cheerio.load(html);
  const customPatterns = options?.customPatterns
    ? options.customPatterns.map((p) => new RegExp(p.source, p.flags))
    : [];
  const allPatterns = [...freshPatterns(), ...customPatterns];

  const stripAttrs = options?.stripAttributes ?? DEFAULT_STRIP_ATTRIBUTES;
  const preserveAttrs = new Set(options?.preserveAttributes ?? []);

  // Remove custom selectors
  if (options?.stripSelectors) {
    for (const selector of options.stripSelectors) {
      $(selector).each((_, el) => {
        stats.elementsRemoved++;
        $(el).remove();
      });
    }
  }

  if (preset === 'minimal') {
    // Minimal: only strip <script> and <style> tags
    $('script').each((_, el) => {
      stats.elementsRemoved++;
      $(el).remove();
    });
    $('style').each((_, el) => {
      stats.elementsRemoved++;
      $(el).remove();
    });

    const result = $.html();
    return applyMaxSize(result, options?.maxSize, stats);
  }

  // Moderate and Strict: remove script, style, noscript
  for (const tag of ['script', 'style', 'noscript']) {
    $(tag).each((_, el) => {
      stats.elementsRemoved++;
      $(el).remove();
    });
  }

  // Remove HTML comments
  removeComments($, $.root()[0]!);

  // Redact password input values
  $('input[type="password"]').each((_, el) => {
    const $el = $(el);
    if ($el.attr('value') !== undefined) {
      $el.attr('value', '[REDACTED]');
      stats.patternsRedacted++;
    }
  });

  // Strip href/src/action down to domain only
  $('[href], [src], [action]').each((_, el) => {
    const $el = $(el);
    for (const attr of ['href', 'src', 'action'] as const) {
      const val = $el.attr(attr);
      if (val !== undefined) {
        const domain = extractDomain(val);
        $el.attr(attr, domain);
      }
    }
  });

  if (preset === 'strict') {
    // Strip ALL attributes except SELECTOR_RELEVANT_ATTRIBUTES + preserveAttributes
    $('*').each((_, el) => {
      if (el.type !== 'tag') return;
      const $el = $(el);
      const attrs = $el.attr();
      if (!attrs) return;
      for (const attrName of Object.keys(attrs)) {
        if (!SELECTOR_RELEVANT_SET.has(attrName) && !preserveAttrs.has(attrName)) {
          $el.removeAttr(attrName);
          stats.attributesStripped++;
        }
      }
    });

    // Strip ALL text content (replace with [TEXT])
    replaceTextNodes($, $.root()[0]!, stats, allPatterns, true);
  } else {
    // Moderate: strip listed attributes, apply patterns to text/attributes
    const stripSet = new Set(stripAttrs.filter((a) => !preserveAttrs.has(a)));

    $('*').each((_, el) => {
      if (el.type !== 'tag') return;
      const $el = $(el);
      const attrs = $el.attr();
      if (!attrs) return;

      for (const attrName of Object.keys(attrs)) {
        if (stripSet.has(attrName)) {
          $el.removeAttr(attrName);
          stats.attributesStripped++;
        } else if (attrName !== 'href' && attrName !== 'src' && attrName !== 'action') {
          // Apply sensitive patterns to remaining attribute values
          const val = $el.attr(attrName);
          if (val) {
            const redacted = redactString(val, allPatterns, stats);
            if (redacted !== val) {
              $el.attr(attrName, redacted);
            }
          }
        }
      }
    });

    // Apply patterns to text nodes
    replaceTextNodes($, $.root()[0]!, stats, allPatterns, false);
  }

  // Apply maxDepth - flatten elements deeper than N levels
  if (options?.maxDepth !== undefined) {
    applyMaxDepth($, options.maxDepth, stats);
  }

  const result = $.html();
  return applyMaxSize(result, options?.maxSize, stats);
}

function removeComments($: cheerio.CheerioAPI, node: AnyNode): void {
  if (!node) return;
  const children = $(node).contents().toArray();
  for (const child of children) {
    if (child.type === 'comment') {
      $(child).remove();
    } else if (child.type === 'tag') {
      removeComments($, child);
    }
  }
}

function replaceTextNodes(
  $: cheerio.CheerioAPI,
  node: AnyNode,
  stats: RedactionResult['stats'],
  patterns: RegExp[],
  stripAll: boolean,
): void {
  if (!node) return;
  const children = $(node).contents().toArray();
  for (const child of children) {
    if (child.type === 'text') {
      const textNode = child as unknown as { data: string };
      const original = textNode.data;
      if (original.trim().length === 0) continue;

      if (stripAll) {
        textNode.data = '[TEXT]';
        stats.patternsRedacted++;
      } else {
        const redacted = redactString(original, patterns, stats);
        if (redacted !== original) {
          textNode.data = redacted;
        }
      }
    } else if (child.type === 'tag') {
      replaceTextNodes($, child, stats, patterns, stripAll);
    }
  }
}

function applyMaxDepth(
  $: cheerio.CheerioAPI,
  maxDepth: number,
  stats: RedactionResult['stats'],
): void {
  // Find all elements and check their depth
  // We need to process deepest-first to avoid issues with nested removal
  const toFlatten: Element[] = [];

  $('body *').each((_, el) => {
    if (el.type !== 'tag') return;
    const depth = getDepth($, el);
    if (depth >= maxDepth) {
      toFlatten.push(el as Element);
    }
  });

  // Sort deepest first
  toFlatten.sort((a, b) => getDepth($, b) - getDepth($, a));

  for (const el of toFlatten) {
    const $el = $(el);
    // Check element still exists in tree
    if (!$el.parent().length) continue;
    const depth = getDepth($, el);
    if (depth >= maxDepth) {
      // Replace with its text content
      const text = $el.text();
      $el.replaceWith(text);
      stats.elementsRemoved++;
    }
  }
}

function applyMaxSize(
  html: string,
  maxSize: number | undefined,
  stats: RedactionResult['stats'],
): RedactionResult {
  if (maxSize !== undefined && html.length > maxSize) {
    stats.truncated = true;
    const truncated = html.slice(0, maxSize) + '<!-- pw-doctor: truncated -->';
    return { html: truncated, stats };
  }
  return { html, stats };
}
