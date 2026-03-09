// packages/cli/src/core/ast-patcher.ts
import * as recast from 'recast';
import * as parser from '@babel/parser';
import type { Node } from '@babel/types';
import * as t from '@babel/types';
import { PLAYWRIGHT_LOCATOR_METHODS } from '@pw-doctor/shared';

export interface PatchResult {
  patchedCode: string;
  patched: boolean;
}

/**
 * Cast an ast-types node (from recast) to a @babel/types Node so that
 * the t.isXxx type-guards work. At runtime the underlying objects are
 * the same Babel AST nodes — only the TS typings differ.
 */
function babelNode(n: unknown): Node {
  return n as Node;
}

export function patchSelector(
  sourceCode: string,
  targetLine: number,
  oldSelector: string,
  newSelector: string,
  newMethod?: string,
): PatchResult {
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

  let patched = false;

  recast.visit(ast, {
    visitCallExpression(path) {
      if (patched) return false;

      const node = path.node;
      const loc = node.loc;
      if (!loc || loc.start.line !== targetLine) {
        this.traverse(path);
        return;
      }

      const callee = babelNode(node.callee);

      // Check if this is a Playwright locator method call
      if (!t.isMemberExpression(callee)) {
        this.traverse(path);
        return;
      }

      if (!t.isIdentifier(callee.property)) {
        this.traverse(path);
        return;
      }

      const methodName = callee.property.name;
      if (!(PLAYWRIGHT_LOCATOR_METHODS as readonly string[]).includes(methodName)) {
        this.traverse(path);
        return;
      }

      const firstArg = babelNode(node.arguments[0]);
      if (!firstArg) {
        this.traverse(path);
        return;
      }

      // Match the old selector value
      if (t.isStringLiteral(firstArg) && firstArg.value === oldSelector) {
        // Patch the selector
        firstArg.value = newSelector;

        // Optionally change the method name
        if (newMethod) {
          callee.property.name = newMethod;
        }

        patched = true;
        return false;
      }

      this.traverse(path);
    },
  });

  if (!patched) {
    return { patchedCode: sourceCode, patched: false };
  }

  const patchedCode = recast.print(ast).code;
  return { patchedCode, patched: true };
}
