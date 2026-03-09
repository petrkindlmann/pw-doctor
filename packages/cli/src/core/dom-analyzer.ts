import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';

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
    this.$(`[${attr}="${value}"]`).each((_, el) => {
      results.push(this.toElement(this.$(el)));
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
      this.$(`.${cls}`).each((_, el) => {
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

    // Approximate visibility
    const isVisible = !attributes['hidden'] &&
      attributes['type'] !== 'hidden' &&
      !attributes['aria-hidden'];

    return {
      tag,
      text,
      attributes,
      isVisible: isVisible !== false,
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
      parts.unshift(tag);
      current = current.parent();
    }

    return parts.join(' > ');
  }
}
