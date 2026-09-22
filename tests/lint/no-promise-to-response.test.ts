/**
 * no-promise-to-response.test.ts — no route hands a Promise to res.json/res.send.
 *
 * `res.json(service.getThing())` where getThing is async serialises the Promise
 * as `{}`. TypeScript cannot see it (res.json takes `any`), and it is the same
 * missing-await bug class that drove the PostgreSQL migration. The 2026-09-22
 * Work QA found 29 of them in 12 route files: org context always empty,
 * insights and budgets `{}`, the quality leaderboard `{}` (the page crashed on
 * `.reduce`), /graph and /patterns crashing on `.map`.
 *
 * Typed check through the compiler API over the server build config: flags a
 * Promise passed directly, or as a property / spread of an object literal.
 */
import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import path from 'node:path';

const ROOT = process.cwd();

function findPromiseResponses(): string[] {
  const cfgPath = ts.findConfigFile(ROOT, ts.sys.fileExists, 'tsconfig.server.build.json');
  if (!cfgPath) throw new Error('tsconfig.server.build.json not found');
  const cfg = ts.readConfigFile(cfgPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, path.dirname(cfgPath));
  const program = ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true });
  const checker = program.getTypeChecker();

  const isPromise = (t: ts.Type): boolean => {
    if (t.isUnion()) return t.types.some(isPromise);
    const name = (t.getSymbol() ?? t.aliasSymbol)?.getName();
    if (name === 'Promise' || name === 'PromiseLike') return true;
    return !!checker.getPropertyOfType(t, 'then') && !!checker.getPropertyOfType(t, 'catch');
  };

  // A Promise anywhere in what is sent: the value itself, an array element, or
  // a property — three levels deep ({ rows: [{ m }] }). `rows.map(r => ({ ...r, m: asyncFn() }))`
  // answered `{}` for every `m` without tripping a direct check.
  const containsPromise = (t: ts.Type, depth: number): boolean => {
    if (isPromise(t)) return true;
    if (depth <= 0) return false;
    if (t.isUnion()) return t.types.some((u) => containsPromise(u, depth));
    if (checker.isArrayType(t)) {
      const [el] = checker.getTypeArguments(t as ts.TypeReference);
      return !!el && containsPromise(el, depth - 1);
    }
    if (t.flags & ts.TypeFlags.Object && !t.getCallSignatures().length) {
      return checker.getPropertiesOfType(t).some((p) => {
        const decl = p.valueDeclaration ?? p.declarations?.[0];
        if (!decl) return false;
        return containsPromise(checker.getTypeOfSymbolAtLocation(p, decl), depth - 1);
      });
    }
    return false;
  };

  const hits: string[] = [];
  for (const sf of program.getSourceFiles()) {
    const file = sf.fileName.replace(/\\/g, '/');
    if (!file.includes('/server/') || file.includes('/node_modules/')) continue;
    const visit = (n: ts.Node): void => {
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
        && (n.expression.name.text === 'json' || n.expression.name.text === 'send') && n.arguments.length === 1) {
        const arg = n.arguments[0];
        const bad: string[] = [];
        if (containsPromise(checker.getTypeAtLocation(arg), 3)) bad.push('(value)');
        if (ts.isObjectLiteralExpression(arg)) {
          for (const p of arg.properties) {
            const node = ts.isPropertyAssignment(p) ? p.initializer
              : ts.isShorthandPropertyAssignment(p) ? p.name
              : ts.isSpreadAssignment(p) ? p.expression : null;
            if (node && isPromise(checker.getTypeAtLocation(node))) bad.push(p.name?.getText(sf) ?? '...spread');
          }
        }
        if (bad.length) {
          const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
          hits.push(`${path.relative(ROOT, file).replace(/\\/g, '/')}:${line + 1} ${bad.join(',')}`);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return hits;
}

describe('server routes', () => {
  it('never pass a Promise to res.json / res.send (a missing await answers {})', () => {
    expect(findPromiseResponses()).toEqual([]);
  }, 180_000);
});
