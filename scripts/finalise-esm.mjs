/**
 * FINALISE THE ESM TREE — the two things `tsc` emits but does not finish.
 *
 * AD-006 buys "no bundler in the dependency graph" by running `tsc` twice. The price is that
 * neither run produces a tree Node can load as ESM, and the two missing pieces are finished here.
 *
 *   1. THE MARKER. `dist/esm/package.json` is what makes the tree ESM. It must declare BOTH
 *      `type` and `sideEffects`, because a nested manifest SHADOWS the root one and that is where
 *      `sideEffects: false` lives. Measured: an incomplete marker puts a ~2.267 B floor under
 *      every symbol. The size probe already refuses to measure without it; this refuses to WRITE
 *      it wrong, which is one step earlier.
 *
 *   2. THE EXTENSIONS. `tsc` never rewrites a module specifier, so `import './paneStack'` is
 *      emitted verbatim — legal TypeScript, and unloadable by Node, whose ESM resolver does no
 *      extension guessing. Bundlers paper over it, which is exactly why it survives unnoticed:
 *      the tree looks fine right up until somebody actually runs `node`.
 *
 * The rewrite reads the specifier off the PARSED SYNTAX TREE, never off a regular expression. A
 * specifier is a string literal in a known syntactic position; a regex over text cannot tell one
 * from the same characters inside a template literal or a comment. Same reasoning as the boundary
 * guard (AD-005) and the hook-purity gate (AD-007): ask the compiler what the thing IS.
 *
 * And every rewrite is CHECKED against the filesystem before it is written. A specifier that
 * resolves to nothing throws and names itself, so this can never quietly emit a tree that is
 * broken in a new way instead of the old one.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';

const LIB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ESM_DIR = join(LIB_ROOT, 'dist', 'esm');
const MARKER_SOURCE = join(LIB_ROOT, 'esm-package.json');

/** Extensions Node's ESM resolver accepts verbatim. Anything else has to be completed. */
const EXPLICIT = /\.(m?js|cjs|json|node)$/;

function writeMarker() {
  const declared = JSON.parse(readFileSync(MARKER_SOURCE, 'utf8'));
  if (declared.type !== 'module') {
    throw new Error(
      `${MARKER_SOURCE}: type=${JSON.stringify(declared.type)}, expected "module" — without it the tree is not ESM`,
    );
  }
  if (declared.sideEffects !== false) {
    throw new Error(
      `${MARKER_SOURCE}: sideEffects=${JSON.stringify(declared.sideEffects)}, expected false —` +
        ' the nested manifest shadows the root one and a floor of ~2.267 B falls on every symbol',
    );
  }
  mkdirSync(ESM_DIR, { recursive: true });
  writeFileSync(join(ESM_DIR, 'package.json'), `${JSON.stringify(declared, null, 2)}\n`);
}

function jsFilesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) return jsFilesUnder(abs);
    return entry.name.endsWith('.js') ? [abs] : [];
  });
}

/** Every string literal the module system reads: static import, re-export, and dynamic import. */
function specifiersOf(source) {
  const found = [];
  const visit = (node) => {
    const literal =
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier !== undefined
        ? node.moduleSpecifier
        : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
          ? node.arguments[0]
          : undefined;
    if (literal !== undefined && ts.isStringLiteral(literal)) found.push(literal);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** What a bare relative specifier actually points at, or `null` when it points at nothing. */
function completionFor(fileDir, specifier) {
  const target = resolve(fileDir, specifier);
  if (existsSync(`${target}.js`)) return `${specifier}.js`;
  if (existsSync(join(target, 'index.js'))) return `${specifier}/index.js`;
  return null;
}

function completeExtensions() {
  let rewritten = 0;
  for (const file of jsFilesUnder(ESM_DIR)) {
    const text = readFileSync(file, 'utf8');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
    const edits = [];
    for (const literal of specifiersOf(source)) {
      const specifier = literal.text;
      if (!specifier.startsWith('.') || EXPLICIT.test(specifier)) continue;
      const completed = completionFor(dirname(file), specifier);
      if (completed === null) {
        throw new Error(
          `${relative(LIB_ROOT, file)}: '${specifier}' resolves to no emitted module —` +
            ' refusing to write a tree that is broken in a new way',
        );
      }
      edits.push({ start: literal.getStart(source), end: literal.getEnd(), text: `'${completed}'` });
    }
    if (edits.length === 0) continue;
    // Back to front, so an earlier edit never moves a later one's offsets.
    const patched = edits
      .sort((a, b) => b.start - a.start)
      .reduce((acc, edit) => acc.slice(0, edit.start) + edit.text + acc.slice(edit.end), text);
    writeFileSync(file, patched);
    rewritten += edits.length;
  }
  return rewritten;
}

if (!existsSync(join(LIB_ROOT, 'dist', 'esm', 'index.js'))) {
  console.error('finalise-esm: dist/esm/index.js does not exist — run `tsc -p tsconfig.esm.json` first');
  process.exit(1);
}

writeMarker();
const rewritten = completeExtensions();
console.log(`finalise-esm: marker written, ${rewritten} specifier(s) completed`);
