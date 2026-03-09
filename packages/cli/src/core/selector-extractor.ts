// packages/cli/src/core/selector-extractor.ts
import fs from 'node:fs';
import * as parser from '@babel/parser';
import type { TraverseOptions } from '@babel/traverse';
import _traverseModule from '@babel/traverse';
import * as t from '@babel/types';
import type { SelectorInfo, SelectorType } from '@pw-doctor/shared';
import { PLAYWRIGHT_LOCATOR_METHODS } from '@pw-doctor/shared';

// Handle ESM/CJS interop for @babel/traverse
// At runtime the default import may be the traverse function or a namespace with .default
type TraverseFn = (parent: t.Node, opts?: TraverseOptions) => void;
const traverse: TraverseFn = (
  typeof (_traverseModule as unknown) === 'function'
    ? _traverseModule as unknown as TraverseFn
    : (_traverseModule as unknown as { default: TraverseFn }).default
);

export function extractSelectors(filePath: string): SelectorInfo[] {
  const source = fs.readFileSync(filePath, 'utf-8');
  const lines = source.split('\n');

  const ast = parser.parse(source, {
    sourceType: 'module',
    plugins: ['typescript', 'decorators-legacy'],
  });

  const selectors: SelectorInfo[] = [];

  traverse(ast, {
    CallExpression(path) {
      const node = path.node;
      const callee = node.callee;

      if (!t.isMemberExpression(callee)) return;
      if (!t.isIdentifier(callee.property)) return;

      const methodName = callee.property.name;

      if (
        !(PLAYWRIGHT_LOCATOR_METHODS as readonly string[]).includes(methodName)
      ) {
        return;
      }

      // Verify the receiver looks like a Playwright object
      if (!isPlaywrightReceiver(callee.object)) return;

      const firstArg = node.arguments[0];
      if (!firstArg) return;

      const loc = node.loc;
      if (!loc) return;

      const line = loc.start.line;
      const column = loc.start.column;
      const contextCode = getContextLines(lines, line, 5);

      if (t.isStringLiteral(firstArg)) {
        const selectorValue = firstArg.value;
        const selectorType = classifySelectorType(methodName, selectorValue);

        const info: SelectorInfo = {
          filePath,
          line,
          column,
          selectorValue,
          selectorType,
          apiMethod: methodName,
          isDynamic: false,
          contextCode,
          fragilityScore: 0, // computed later
        };

        // Extract roleOptions for getByRole
        if (methodName === 'getByRole' && node.arguments[1]) {
          info.roleOptions = extractObjectLiteral(node.arguments[1]);
        }

        selectors.push(info);
      } else if (t.isTemplateLiteral(firstArg)) {
        const isDynamic = firstArg.expressions.length > 0;
        const rawValue = firstArg.quasis.map((q) => q.value.raw).join('${...}');

        selectors.push({
          filePath,
          line,
          column,
          selectorValue: rawValue,
          selectorType: isDynamic ? 'dynamic' : classifySelectorType(methodName, rawValue),
          apiMethod: methodName,
          isDynamic,
          contextCode,
          fragilityScore: 0,
        });
      }
    },
  });

  return selectors;
}

function isPlaywrightReceiver(node: t.Node): boolean {
  // Direct: page.locator(...)
  if (t.isIdentifier(node) && ['page', 'frame'].includes(node.name)) {
    return true;
  }

  // Chained: page.locator(...).locator(...)
  if (t.isCallExpression(node)) {
    if (t.isMemberExpression(node.callee) && t.isIdentifier(node.callee.property)) {
      const method = node.callee.property.name;
      if ((PLAYWRIGHT_LOCATOR_METHODS as readonly string[]).includes(method)) {
        return true;
      }
      // .first(), .last(), .nth(), .filter(), .and(), .or()
      if (['first', 'last', 'nth', 'filter', 'and', 'or'].includes(method)) {
        return true;
      }
    }
  }

  // Member access on result: page.locator(...).something
  if (t.isMemberExpression(node)) {
    return isPlaywrightReceiver(node.object);
  }

  return false;
}

function classifySelectorType(method: string, value: string): SelectorType {
  if (method === 'getByRole') return 'role';
  if (method === 'getByTestId') return 'testid';
  if (method === 'getByText') return 'text';
  if (method === 'getByLabel') return 'label';
  if (method === 'getByPlaceholder') return 'placeholder';
  if (method === 'getByAltText') return 'alttext';
  if (method === 'getByTitle') return 'title';
  if (method === 'frameLocator') return 'css';

  // For page.locator(), classify by value
  if (value.startsWith('//') || value.startsWith('xpath=')) return 'xpath';
  if (value.startsWith('text=') || value.startsWith('"')) return 'text';
  if (value.startsWith('#')) return 'id';
  if (value.includes('[data-testid')) return 'testid';
  if (value.includes('[role=') || value.startsWith('role=')) return 'role';

  return 'css';
}

function getContextLines(
  lines: string[],
  targetLine: number,
  contextSize: number,
): string {
  const start = Math.max(0, targetLine - 1 - contextSize);
  const end = Math.min(lines.length, targetLine + contextSize);
  return lines.slice(start, end).join('\n');
}

function extractObjectLiteral(
  node: t.Node,
): Record<string, unknown> | undefined {
  if (!t.isObjectExpression(node)) return undefined;

  const result: Record<string, unknown> = {};
  for (const prop of node.properties) {
    if (
      t.isObjectProperty(prop) &&
      t.isIdentifier(prop.key) &&
      t.isStringLiteral(prop.value)
    ) {
      result[prop.key.name] = prop.value.value;
    } else if (
      t.isObjectProperty(prop) &&
      t.isIdentifier(prop.key) &&
      t.isBooleanLiteral(prop.value)
    ) {
      result[prop.key.name] = prop.value.value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}
