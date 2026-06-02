// packages/cli/src/core/ast-patcher.ts
import * as recast from 'recast';
import * as parser from '@babel/parser';
import type { Node } from '@babel/types';
import * as t from '@babel/types';
import { PLAYWRIGHT_LOCATOR_METHODS } from '@pw-doctor/shared';

export interface PatchResult {
  patchedCode: string;
  patched: boolean;
  /**
   * Set when the target line/selector matched more than one locator call and
   * no column was supplied to disambiguate — the patch is skipped to avoid
   * editing the wrong call site.
   */
  ambiguous?: boolean;
}

export interface PatchOptions {
  /** New method name to switch to (e.g. 'getByRole'). */
  newMethod?: string;
  /** 0-based or 1-based column of the failing call, used to disambiguate
   *  multiple matching calls on the same line. Best-effort. */
  targetColumn?: number;
  /** Accessible name for a getByRole patch → `getByRole('role', { name }))`. */
  nameOption?: string;
}

/**
 * Cast an ast-types node (from recast) to a @babel/types Node so that
 * the t.isXxx type-guards work. At runtime the underlying objects are
 * the same Babel AST nodes — only the TS typings differ.
 */
function babelNode(n: unknown): Node {
  return n as Node;
}

/**
 * Escape a string for embedding inside a JS string literal delimited by `quote`.
 * Escapes backslashes first, then the delimiter itself, so the produced literal
 * is always valid (a selector value containing the quote can't break out).
 */
function escapeForQuote(value: string, quote: string): string {
  return value.replace(/\\/g, '\\\\').replace(new RegExp(quote, 'g'), `\\${quote}`);
}

interface CandidateCall {
  /** The recast/ast-types CallExpression node; `arguments` is a mutable array
   *  of Babel nodes at runtime. Typed loosely to bridge the two type systems. */
  node: { arguments: unknown[] };
  callee: t.MemberExpression;
  firstArg: t.StringLiteral;
  startColumn: number;
}

/**
 * Replace a selector value (and optionally the method name) in a Playwright
 * locator call. Preserves formatting via recast.
 *
 * Matching is intentionally strict to avoid editing the wrong call site:
 *  - the call's method must be a Playwright locator method;
 *  - the first argument must be a string literal equal to `oldSelector`;
 *  - the failing line must fall within the call's span
 *    (`loc.start.line <= targetLine <= loc.end.line`) so multi-line chains work;
 *  - when more than one call matches, a `targetColumn` (if provided) breaks the
 *    tie by nearest start column; without one, the patch is reported `ambiguous`
 *    and skipped rather than guessing.
 *
 * The 5th parameter accepts either a legacy method-name string or a
 * {@link PatchOptions} object.
 *
 * Assumes the caller has already validated that the call site is a Playwright
 * locator (e.g., via extractSelectors). No receiver validation is performed.
 */
export function patchSelector(
  sourceCode: string,
  targetLine: number,
  oldSelector: string,
  newSelector: string,
  methodOrOptions?: string | PatchOptions,
): PatchResult {
  const options: PatchOptions =
    typeof methodOrOptions === 'string'
      ? { newMethod: methodOrOptions }
      : methodOrOptions ?? {};
  const { newMethod, targetColumn, nameOption } = options;

  const ast = recast.parse(sourceCode, {
    parser: {
      parse(source: string) {
        return parser.parse(source, {
          sourceType: 'module',
          plugins: ['typescript', 'decorators-legacy'],
          tokens: true,
        });
      },
    },
  });

  // Collect every call on the target line/span whose first string arg matches
  // the old selector — then pick exactly one.
  const matches: CandidateCall[] = [];

  recast.visit(ast, {
    visitCallExpression(path) {
      const node = path.node;
      const loc = node.loc;
      // The failing line must fall within this call's span (covers chained,
      // multi-line locator expressions where loc.start.line < targetLine).
      if (!loc || targetLine < loc.start.line || targetLine > loc.end.line) {
        this.traverse(path);
        return;
      }

      const callee = babelNode(node.callee);
      if (!t.isMemberExpression(callee) || !t.isIdentifier(callee.property)) {
        this.traverse(path);
        return;
      }
      if (!(PLAYWRIGHT_LOCATOR_METHODS as readonly string[]).includes(callee.property.name)) {
        this.traverse(path);
        return;
      }

      const firstArg = babelNode(node.arguments[0]);
      // Only a plain string literal is patchable. A template literal / dynamic
      // selector is deliberately left untouched (no regex rewriting, no
      // guessing — see CLAUDE.md rule 3).
      if (t.isStringLiteral(firstArg) && firstArg.value === oldSelector) {
        matches.push({
          node: node as unknown as { arguments: unknown[] },
          callee,
          firstArg,
          startColumn: loc.start.column,
        });
      }

      this.traverse(path);
    },
  });

  if (matches.length === 0) {
    return { patchedCode: sourceCode, patched: false };
  }

  let target: CandidateCall;
  if (matches.length === 1) {
    target = matches[0];
  } else if (targetColumn !== undefined) {
    // Disambiguate by nearest start column. Playwright/stack columns are
    // 1-based while Babel loc.start.column is 0-based, so compare with a ±1
    // tolerance via absolute nearest.
    target = matches.reduce((best, m) =>
      Math.abs(m.startColumn - targetColumn) < Math.abs(best.startColumn - targetColumn) ? m : best,
    );
  } else {
    // Multiple identical selectors on the line and no column to disambiguate —
    // refuse to guess.
    return { patchedCode: sourceCode, patched: false, ambiguous: true };
  }

  applyPatch(target, newSelector, newMethod, nameOption);

  const patchedCode = recast.print(ast).code;
  return { patchedCode, patched: true };
}

function applyPatch(
  target: CandidateCall,
  newSelector: string,
  newMethod: string | undefined,
  nameOption: string | undefined,
): void {
  const { firstArg, callee, node } = target;

  // Preserve original quote style by switching to ESTree Literal type, which
  // recast prints via getPossibleRaw (respects extra.raw). Recast's
  // StringLiteral handler ignores extra.raw entirely.
  const rawNode = firstArg as unknown as {
    type: string;
    raw?: string;
    extra?: { rawValue?: string; raw?: string };
  };
  const originalQuote = rawNode.extra?.raw?.[0] ?? "'";
  const quote = originalQuote === '"' || originalQuote === '`' ? originalQuote : "'";
  // Escape backslashes and the active quote char inside the value so a selector
  // containing that quote (e.g. [aria-label="Save & Close"]) cannot break out of
  // the string literal and corrupt the file.
  const rawLiteral = `${quote}${escapeForQuote(newSelector, quote)}${quote}`;
  firstArg.value = newSelector;
  rawNode.type = 'Literal';
  rawNode.raw = rawLiteral;
  rawNode.extra = { rawValue: newSelector, raw: rawLiteral };

  if (newMethod && t.isIdentifier(callee.property)) {
    callee.property.name = newMethod;
  }

  // For a getByRole patch with an accessible name, emit the
  // `{ name: '<nameOption>' }` options object as the 2nd argument, replacing any
  // existing options object so a stale { name } from the old call can't survive.
  const effectiveMethod = newMethod ?? (t.isIdentifier(callee.property) ? callee.property.name : '');
  if (effectiveMethod === 'getByRole' && nameOption) {
    const nameLiteral = t.stringLiteral(nameOption);
    (nameLiteral as unknown as { extra?: unknown }).extra = {
      rawValue: nameOption,
      raw: `'${escapeForQuote(nameOption, "'")}'`,
    };
    const optionsObj = t.objectExpression([
      t.objectProperty(t.identifier('name'), nameLiteral),
    ]);
    node.arguments[1] = optionsObj;
    // Drop any further args (the old call shouldn't have had them, but be safe).
    node.arguments.length = 2;
  }
}
