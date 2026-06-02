import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { implicitRole as implicitRoleOf } from './aria-roles.js';

export interface DomElement {
  tag: string;
  text: string;
  attributes: Record<string, string>;
  isVisible: boolean;
  isUnique: boolean;
  cssPath: string;
}

export class DomAnalyzer {
  private $: cheerio.CheerioAPI;

  constructor(html: string) {
    this.$ = cheerio.load(html);
  }

  findByText(text: string): DomElement[] {
    const results: DomElement[] = [];
    this.$('*').each((_, el) => {
      const $el = this.$(el);
      const directText = $el.contents()
        .filter((_, node) => node.type === 'text')
        .text()
        .trim();
      if (directText.includes(text)) {
        results.push(this.toElement($el));
      }
    });
    return results;
  }

  findByAttribute(attr: string, value: string): DomElement[] {
    const results: DomElement[] = [];
    this.$('*').filter((_, el) => {
      return this.$(el).attr(attr) === value;
    }).each((_, el) => {
      results.push(this.toElement(this.$(el)));
    });
    return results;
  }

  /**
   * Match by ARIA role — explicit `role=` attribute OR the element's implicit
   * role (e.g. <button>, <a href>, headings). When `name` is given, also filter
   * by accessible name (aria-label or trimmed visible text), mirroring
   * Playwright's getByRole(role, { name }).
   */
  findByRole(role: string, name?: string): DomElement[] {
    const results: DomElement[] = [];
    this.$('*').each((_, el) => {
      const $el = this.$(el);
      const domEl = this.toElement($el);
      const explicit = domEl.attributes['role']?.trim().toLowerCase();
      const implicit = implicitRoleOf(domEl.tag, domEl.attributes);
      if (explicit !== role && implicit !== role) return;
      if (name !== undefined) {
        const accName = (
          domEl.attributes['aria-label'] ??
          domEl.text ??
          domEl.attributes['alt'] ??
          domEl.attributes['title'] ??
          ''
        ).trim();
        if (accName !== name.trim()) return;
      }
      results.push(domEl);
    });
    return results;
  }

  findByCss(selector: string): DomElement[] {
    const results: DomElement[] = [];
    try {
      this.$(selector).each((_, el) => {
        results.push(this.toElement(this.$(el)));
      });
    } catch {
      // Invalid selector
    }
    return results;
  }

  findByTag(tag: string): DomElement[] {
    const results: DomElement[] = [];
    this.$(tag).each((_, el) => {
      results.push(this.toElement(this.$(el)));
    });
    return results;
  }

  findSimilarByClasses(classes: string[]): DomElement[] {
    const results: DomElement[] = [];
    for (const cls of classes) {
      this.$('*').filter((_, el) => {
        const classAttr = this.$(el).attr('class') ?? '';
        return classAttr.split(/\s+/).includes(cls);
      }).each((_, el) => {
        const domEl = this.toElement(this.$(el));
        if (!results.some((r) => r.cssPath === domEl.cssPath)) {
          results.push(domEl);
        }
      });
    }
    return results;
  }

  private toElement($el: cheerio.Cheerio<AnyNode>): DomElement {
    const tag = ($el.prop('tagName') ?? '').toLowerCase();
    const text = $el.text().trim();
    const attributes: Record<string, string> = {};

    const rawAttrs = $el.attr();
    if (rawAttrs) {
      for (const [key, value] of Object.entries(rawAttrs)) {
        attributes[key] = value ?? '';
      }
    }

    // Check uniqueness
    let isUnique = true;
    const testId = attributes['data-testid'];
    if (testId) {
      isUnique = this.$(`[data-testid="${testId}"]`).length === 1;
    } else if (attributes['id']) {
      isUnique = this.$(`#${attributes['id']}`).length === 1;
    } else {
      isUnique = false;
    }

    // Approximate visibility from the static snapshot. We cannot run layout, so
    // this catches the explicit hide signals: hidden attr, type=hidden,
    // aria-hidden, and inline display:none / visibility:hidden styles.
    const style = (attributes['style'] ?? '').toLowerCase().replace(/\s+/g, '');
    const styleHides =
      style.includes('display:none') || style.includes('visibility:hidden');
    const isVisible =
      !attributes['hidden'] &&
      attributes['type'] !== 'hidden' &&
      attributes['aria-hidden'] !== 'true' &&
      !styleHides;

    return {
      tag,
      text,
      attributes,
      isVisible,
      isUnique,
      cssPath: this.buildCssPath($el),
    };
  }

  private buildCssPath($el: cheerio.Cheerio<AnyNode>): string {
    const parts: string[] = [];
    let current = $el;

    while (current.length && current.prop('tagName')) {
      const tag = (current.prop('tagName') ?? '').toLowerCase();
      if (tag === 'html' || tag === 'body') break;

      const id = current.attr('id');
      if (id) {
        parts.unshift(`${tag}#${id}`);
        break;
      }

      // Include nth-of-type index for disambiguation of same-tag siblings
      const parent = current.parent();
      if (parent.length) {
        const siblings = parent.children(tag);
        if (siblings.length > 1) {
          let index = 0;
          siblings.each((i, sib) => {
            if (sib === current.get(0)) index = i + 1;
          });
          parts.unshift(`${tag}:nth-of-type(${index})`);
        } else {
          parts.unshift(tag);
        }
      } else {
        parts.unshift(tag);
      }
      current = parent;
    }

    return parts.join(' > ');
  }
}
