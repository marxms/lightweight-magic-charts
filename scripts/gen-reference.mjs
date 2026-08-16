#!/usr/bin/env node
/**
 * THE SYMBOL REFERENCE IS DERIVED FROM THE ENTRY, NEVER TYPED BY HAND (AD-016).
 *
 * The entry exports 290 symbols. A reference written by hand for 290 is not maintained, it is
 * abandoned: it agrees with the code on the day it is written and lies from the first signature
 * change onwards, and a document that lies is worse than one that is missing, because it is read as
 * true. Deriving makes the divergence IMPOSSIBLE instead of forbidden, and it turns the two-way
 * criterion — no undocumented export, no documented non-export — into a structural fact. The list
 * comes from the entry, so it cannot name a symbol that is not there and cannot forget one that is.
 *
 * GENERATING FROM TSDoc WAS THE OBVIOUS ROUTE AND IT WAS REFUSED, by measurement. AD-011 holds the
 * comment ratio in `src/` at or under 0.20, and writing a doc comment on 104 value exports bursts
 * it. Deriving from the SIGNATURE costs no comment line at all — the type is already written, in the
 * one place the compiler checks.
 *
 * THE OUTPUT IS A PURE FUNCTION OF THE ENTRY. No clock, no environment, no working directory, and
 * no directory listing: every symbol arrives from the checker's export list, and the ordering is
 * imposed here rather than inherited. Anything else would make the gate red on one machine and green
 * on another, which is a gate nobody can keep. The one impurity the compiler tries to inject — an
 * absolute `import("/…/node_modules/@types/react/index")` in a rendered type — is normalised to the
 * package name it came from.
 *
 * THE INDEX IS A MAP, NOT A CATALOGUE, and that was decided by measurement. Listing all 290 symbols
 * on one page produced 450 lines against the 300-line ceiling the shape gate holds. Truncating would
 * make the reference lie; exempting the index would open an exception for exactly the case the
 * ceiling exists to catch — a 450-line catalogue IS "the reader loses the thread before the answer".
 * So the index names the 49 modules and the symbols live on the module's own page.
 *
 * THE PROSE IS THE ONLY HAND-WRITTEN PART, and it lives in `reference-prose.mjs`. What a module is
 * FOR, and what calling it looks like, cannot be read out of a type. Everything else on a module
 * page — the symbol list, the signatures, the prop table with its types, optionality and defaults —
 * is derived here, so the two halves cannot disagree.
 *
 * Usage:
 *   node scripts/gen-reference.mjs            writes docs/reference/ whole
 *   node scripts/gen-reference.mjs --stdout   prints the index instead
 *   node scripts/gen-reference.mjs --tree     prints the component tree instead
 *   node scripts/gen-reference.mjs --json     prints every page as {path: text}, which the gate compares
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { dirname, join, relative, sep } from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';

import { REFERENCE_PROSE } from './reference-prose.mjs';

const LIB_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(LIB_ROOT, 'src');
const ENTRY = join(SRC, 'index.ts');
const REFERENCE = join(LIB_ROOT, 'docs', 'reference');
const INDEX_PAGE = '_index.md';
const TREE_PAGE = 'component-tree.md';

const TYPE_FLAGS =
  ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseSingleQuotesForStringLiteralType;

/** Comments out, whitespace collapsed: a signature is one line, and prose is not part of it. */
function oneLine(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * `import("<absolute path>")` is the compiler naming a module by where it sits on THIS disk.
 *
 * Left alone it is the one thing in the output that differs between two checkouts, so it is folded
 * back to the name the source would have written: the package for anything under `node_modules`,
 * and the path relative to `src/` for anything inside the package.
 */
function stableModules(signature) {
  return signature.replace(/import\("([^"]+)"\)/g, (_whole, path) => {
    const segments = path.split('/');
    const at = segments.lastIndexOf('node_modules');
    if (at !== -1) {
      const rest = segments.slice(at + 1);
      const scoped = rest[0] === '@types' ? rest.slice(1) : rest;
      const name = scoped[0]?.startsWith('@') ? `${scoped[0]}/${scoped[1]}` : scoped[0];
      return `import('${name}')`;
    }
    return `import('${relative(SRC, path).split(sep).join('/')}')`;
  });
}

function moduleOf(declaration) {
  return relative(SRC, declaration.getSourceFile().fileName)
    .split(sep)
    .join('/')
    .replace(/\.tsx?$/, '');
}

/** Renders what a member LOOKS like at the call site, which is the question a reference answers. */
function signatureOf(checker, symbol, declaration, isValue) {
  if (ts.isClassDeclaration(declaration)) return `class ${symbol.name}`;
  if (isValue) {
    const type = checker.getTypeOfSymbolAtLocation(symbol, declaration);
    return oneLine(checker.typeToString(type, declaration, TYPE_FLAGS));
  }
  if (ts.isTypeAliasDeclaration(declaration)) {
    const parameters = declaration.typeParameters
      ? `<${declaration.typeParameters.map((p) => oneLine(p.getText())).join(', ')}>`
      : '';
    return `type ${symbol.name}${parameters} = ${oneLine(declaration.type.getText())}`;
  }
  const members = checker
    .getPropertiesOfType(checker.getDeclaredTypeOfSymbol(symbol))
    .map((member) => {
      const site = member.declarations?.[0] ?? declaration;
      const type = oneLine(
        checker.typeToString(checker.getTypeOfSymbolAtLocation(member, site), site, TYPE_FLAGS),
      );
      const optional = (member.flags & ts.SymbolFlags.Optional) === 0 ? '' : '?';
      return `${member.name}${optional}: ${type}`;
    });
  return `interface ${symbol.name} { ${members.join('; ')} }`;
}

/**
 * What a component's declaration writes as `{ theme = DEFAULT_WORKSPACE_THEME }`.
 *
 * DERIVED, never typed: a default written into a table by hand is the first thing to rot, because
 * changing the initialiser and forgetting the document costs nothing and shows nothing. Read from
 * the destructuring pattern, a stale default is impossible rather than discouraged. A component that
 * takes `props` whole rather than destructuring simply has no defaults to report, and reporting none
 * is the honest answer.
 */
function defaultsFor(source, propsName) {
  const found = new Map();
  const fromParameter = (parameter) => {
    const type = parameter.type;
    if (
      type === undefined ||
      !ts.isTypeReferenceNode(type) ||
      type.typeName.getText() !== propsName ||
      !ts.isObjectBindingPattern(parameter.name)
    ) {
      return;
    }
    for (const element of parameter.name.elements) {
      if (element.initializer === undefined) continue;
      const key = (element.propertyName ?? element.name).getText();
      found.set(key, oneLine(element.initializer.getText()));
    }
  };
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      if (node.parameters.length > 0) fromParameter(node.parameters[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** One row per prop: the type and the optionality from the interface, the default from the code. */
function propsTableFor(checker, symbol, declaration) {
  const defaults = defaultsFor(declaration.getSourceFile(), symbol.name);
  return checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(symbol)).map((member) => {
    const site = member.declarations?.[0] ?? declaration;
    const type = stableModules(
      oneLine(checker.typeToString(checker.getTypeOfSymbolAtLocation(member, site), site, TYPE_FLAGS)),
    );
    return {
      name: member.name,
      type,
      required: (member.flags & ts.SymbolFlags.Optional) === 0,
      fallback: defaults.get(member.name) ?? null,
    };
  });
}

function readEntry() {
  const config = ts.readConfigFile(join(LIB_ROOT, 'tsconfig.json'), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, LIB_ROOT);
  // The entry is the ONLY root. Handing the program a directory listing would make the output
  // depend on what happens to be on disk beside it.
  const program = ts.createProgram([ENTRY], { ...parsed.options, noEmit: true });
  const checker = program.getTypeChecker();
  const entry = checker.getSymbolAtLocation(program.getSourceFile(ENTRY));
  if (entry === undefined) throw new Error('the entry has no module symbol; the program is wrong');
  const props = new Map();

  const exports = checker
    .getExportsOfModule(entry)
    .map((exported) => {
      const symbol =
        (exported.flags & ts.SymbolFlags.Alias) === 0
          ? exported
          : checker.getAliasedSymbol(exported);
      const declaration = symbol.declarations?.[0];
      if (declaration === undefined) throw new Error(`${exported.name} has no declaration`);
      const isValue = (symbol.flags & ts.SymbolFlags.Value) !== 0;
      const module = moduleOf(declaration);
      if (!isValue && exported.name.endsWith('Props') && ts.isInterfaceDeclaration(declaration)) {
        props.set(module, { name: exported.name, rows: propsTableFor(checker, symbol, declaration) });
      }
      return {
        name: exported.name,
        module,
        kind: isValue ? 'value' : 'type',
        signature: stableModules(signatureOf(checker, symbol, declaration, isValue)),
      };
    })
    // Ordering imposed, not inherited: the checker's order is an implementation detail and the file
    // has to be byte-identical between two checkouts of the same tree.
    .sort((a, b) => a.module.localeCompare(b.module, 'en') || a.name.localeCompare(b.name, 'en'));
  return { exports, props };
}

/** `react/chrome/labels` -> `react`. The map groups by it, because that is how the tree reads. */
const areaOf = (module) => module.split('/')[0];

const HEADER = [
  '<!-- GENERATED by scripts/gen-reference.mjs — do not edit by hand.',
  '     A gate compares this file byte for byte with what the generator produces now, so an edit',
  '     here is a failure, not a change. Change `scripts/reference-prose.mjs` and regenerate. -->',
];

function renderIndex(exports) {
  const values = exports.filter((row) => row.kind === 'value').length;
  const modules = [...new Set(exports.map((row) => row.module))];
  const areas = [...new Set(modules.map(areaOf))];
  const lines = [
    ...HEADER,
    '',
    '# Reference',
    '',
    `The public entry exports **${exports.length} symbols** — ${values} values and ` +
      `${exports.length - values} types — across **${modules.length} modules**.`,
    '',
    'This page is the map. Each module has its own page carrying what it is for, an example that is',
    'compiled by a gate, its prop table where it declares one, and every symbol it exports with the',
    'signature read out of the entry. The list cannot name a symbol the package does not export, and',
    'it cannot forget one it does.',
    '',
    '[`component-tree.md`](component-tree.md) draws what renders inside what, from the drop-in down.',
    'For why the package is shaped this way, see [`../explanation/`](../explanation/README.md); to get',
    'a chart drawing at all, start at [`../tutorial/first-chart.md`](../tutorial/first-chart.md).',
    '',
    'In the examples, `declare const` stands for a value you already hold — every block is compiled',
    'whole and on its own, so nothing is stitched in behind it.',
  ];
  for (const area of areas) {
    lines.push('', `## ${area}`, '', '| Module | Exports | What it holds |', '| --- | --- | --- |');
    for (const module of modules.filter((name) => areaOf(name) === area)) {
      const rows = exports.filter((entry) => entry.module === module);
      const valueCount = rows.filter((entry) => entry.kind === 'value').length;
      const held = REFERENCE_PROSE[module]?.title ?? '';
      lines.push(
        `| [\`${module}\`](${module}.md) | ${rows.length} (${valueCount} value) | ${held} |`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

/** How deep a module page sits, so its links back out are relative rather than guessed. */
const upTo = (module) => '../'.repeat(module.split('/').length - 1);

/**
 * A union type in a table cell ends the cell, backticks or not — Markdown splits on the bar before
 * it ever looks at the code span. Left alone, `string | undefined` silently becomes two columns and
 * every row after it is off by one, which is a table that looks fine in a diff and wrong on screen.
 */
const cell = (text) => text.replace(/\|/g, '\\|');

function renderModule(module, rows, table) {
  const prose = REFERENCE_PROSE[module];
  if (prose === undefined) throw new Error(`no prose written for module ${module}`);
  const up = upTo(module);
  const lines = [
    ...HEADER,
    '',
    `# \`${module}\``,
    '',
    prose.summary.trim(),
    '',
    '## Example',
    '',
    `\`\`\`${prose.language ?? 'ts'}`,
    prose.example.trim(),
    '```',
  ];
  if (table !== undefined) {
    lines.push(
      '',
      `## \`${table.name}\``,
      '',
      'Derived from the interface and from the destructuring in the component, so a default that',
      'changes in the code changes here.',
      '',
      '| Prop | Type | Required | Default |',
      '| --- | --- | --- | --- |',
      ...table.rows.map(
        (row) =>
          `| \`${row.name}\` | \`${cell(row.type)}\` | ${row.required ? 'yes' : 'no'} | ` +
          `${row.fallback === null ? '—' : `\`${cell(row.fallback)}\``} |`,
      ),
    );
  }
  lines.push('', '## Exports', '');
  for (const row of rows) lines.push(`- **\`${row.name}\`** · ${row.kind} · \`${row.signature}\``);
  lines.push(
    '',
    `Back to the [reference map](${up}_index.md) · why it is shaped this way is under`,
    `[\`explanation/\`](${up}../explanation/README.md).`,
  );
  return `${lines.join('\n')}\n`;
}

/*
 * ── THE COMPONENT TREE (DOC-08) ────────────────────────────────────────────────────────────────
 *
 * A tree drawn by hand goes stale on the first new region, and NOBODY NOTICES — a reader trusts a
 * diagram precisely because it is a diagram. So it is read out of the JSX of the drop-in root, tag
 * by tag, and every tag is resolved to where its component is declared. A tag that resolves to
 * nothing throws and names itself, so this can never quietly draw a tree with a hole in it.
 *
 * STRICT ASCII, not box drawing. The tree has to survive a diff, a terminal and a screen reader, and
 * `+--` and `|` clear all three in any encoding, where a renderer that mangles UTF-8
 * cannot mangle these.
 */

const ROOT_COMPONENT = 'ChartWorkspace';
const ROOT_FILE = join(SRC, 'react', 'workspace', 'ChartWorkspace.tsx');

const isComponentTag = (name) => /^[A-Z]/.test(name);

function tagNameOf(node) {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  return opening.tagName.getText();
}

/** Where a tag's component is declared, asked of the file rather than guessed from the name. */
function originOf(source, name) {
  let found;
  const visit = (node) => {
    if (found !== undefined) return;
    if (ts.isImportDeclaration(node)) {
      const specifier = node.moduleSpecifier.text;
      const clause = node.importClause;
      const named = clause?.namedBindings;
      const hit =
        clause?.name?.text === name ||
        (named !== undefined &&
          ts.isNamedImports(named) &&
          named.elements.some((element) => element.name.text === name));
      if (hit) {
        found = specifier.startsWith('.')
          ? {
              kind: 'module',
              where: relative(SRC, join(dirname(source.fileName), specifier))
                .split(sep)
                .join('/'),
            }
          : { kind: 'module', where: specifier };
      }
    }
    if (
      (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) &&
      node.name !== undefined &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
    ) {
      found = { kind: 'local', node };
    }
    if (ts.isBindingElement(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      const declaration = node.parent.parent;
      if (ts.isVariableDeclaration(declaration) && declaration.initializer !== undefined) {
        found = { kind: 'binding', where: declaration.initializer.getText() };
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (found === undefined) throw new Error(`the tag <${name}> resolves to no declaration`);
  return found;
}

/** The JSX under a node, as a tree of tags — fragments dropped, because they render nothing. */
function childrenOf(source, node, open) {
  const found = [];
  const descend = (current) => {
    if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current)) {
      found.push(nodeFor(source, current, open));
      return;
    }
    ts.forEachChild(current, descend);
  };
  const body = ts.isJsxElement(node) ? node.children : [];
  for (const child of body) descend(child);
  if (ts.isJsxSelfClosingElement(node)) {
    for (const attribute of node.attributes.properties) descend(attribute);
  } else {
    for (const attribute of node.openingElement.attributes.properties) descend(attribute);
  }
  return found;
}

function nodeFor(source, element, open) {
  const tag = tagNameOf(element);
  if (!isComponentTag(tag)) {
    return { tag: `<${tag}>`, origin: null, children: childrenOf(source, element, open) };
  }
  const origin = originOf(source, tag);
  if (origin.kind === 'local') {
    if (open.has(tag)) return { tag, origin: 'recursive', children: [] };
    const nested = new Set(open).add(tag);
    return { tag, origin: null, children: jsxOf(source, origin.node, nested) };
  }
  const children = childrenOf(source, element, open);
  return {
    tag,
    origin: origin.kind === 'binding' ? `chrome slot, from \`${origin.where}\`` : origin.where,
    children,
  };
}

/** The outermost JSX elements a component declaration returns. */
function jsxOf(source, declaration, open) {
  const found = [];
  const visit = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      found.push(nodeFor(source, node, open));
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(declaration, visit);
  return found;
}

function drawTree(nodes, prefix = '') {
  return nodes.flatMap((node, at) => {
    const last = at === nodes.length - 1;
    const label = node.origin === null ? node.tag : `${node.tag}  -- ${node.origin}`;
    return [
      `${prefix}${last ? '`-- ' : '|-- '}${label}`,
      ...drawTree(node.children, `${prefix}${last ? '    ' : '|   '}`),
    ];
  });
}

function collectTree() {
  // Parsed on its own, with parent pointers ON. The tree is a SYNTACTIC fact — who is written
  // inside whom — so a full program would buy type information nothing here asks for, and the
  // parent chain is what `getText` and the binding walk both need.
  const source = ts.createSourceFile(
    ROOT_FILE,
    readFileSync(ROOT_FILE, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const origin = originOf(source, ROOT_COMPONENT);
  if (origin.kind !== 'local') throw new Error(`${ROOT_COMPONENT} is not declared in the root file`);
  return jsxOf(source, origin.node, new Set([ROOT_COMPONENT]));
}

function renderTree(tree) {
  const drawn = drawTree(tree);
  const regions = new Set();
  const count = (nodes) => {
    for (const node of nodes) {
      if (!node.tag.startsWith('<')) regions.add(node.tag);
      count(node.children);
    }
  };
  count(tree);
  return `${[
    '<!-- GENERATED by scripts/gen-reference.mjs — do not edit by hand.',
    '     A gate compares this file byte for byte with what the generator produces now, so an edit',
    '     here is a failure, not a change. Run `node scripts/gen-reference.mjs` instead. -->',
    '',
    '# Component tree',
    '',
    `\`${ROOT_COMPONENT}\` is the drop-in: one component, and everything below is what it assembles.`,
    `It composes **${regions.size} components**, read out of the JSX in`,
    '`src/react/workspace/ChartWorkspace.tsx` and resolved tag by tag to where each is declared.',
    '',
    'Host elements appear as `<tag>` and carry no origin. A component declared in the root file is',
    'expanded in place rather than named and left closed, so the tree is one connected shape from the',
    'drop-in down. A tag that resolves to no declaration is a generator error, not a blank line.',
    '',
    '```text',
    ROOT_COMPONENT,
    ...drawn,
    '```',
    '',
    'For what each region does, see the page named after its module in this directory. For why the',
    'composition is cut this way, see',
    '[`../explanation/react-workspace.md`](../explanation/react-workspace.md).',
  ].join('\n')}\n`;
}

/** Every page of the reference, keyed by its path under `docs/reference/`. Order imposed. */
function renderAll() {
  const { exports, props } = readEntry();
  const pages = new Map();
  pages.set(INDEX_PAGE, renderIndex(exports));
  pages.set(TREE_PAGE, renderTree(collectTree()));
  for (const module of [...new Set(exports.map((row) => row.module))]) {
    const rows = exports.filter((entry) => entry.module === module);
    pages.set(`${module}.md`, renderModule(module, rows, props.get(module)));
  }
  return pages;
}

/** Every `.md` already under `docs/reference/`, so a page for a module that left can be removed. */
function existingPages(dir = REFERENCE, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const at = join(dir, entry.name);
    if (entry.isDirectory()) return existingPages(at, `${prefix}${entry.name}/`);
    return entry.name.endsWith('.md') ? [`${prefix}${entry.name}`] : [];
  });
}

const pages = renderAll();
if (process.argv.includes('--stdout')) {
  process.stdout.write(pages.get(INDEX_PAGE));
} else if (process.argv.includes('--tree')) {
  process.stdout.write(pages.get(TREE_PAGE));
} else if (process.argv.includes('--json')) {
  // One spawn, every page. The gate needs all of them and the program is what costs the seconds.
  process.stdout.write(`${JSON.stringify(Object.fromEntries(pages))}\n`);
} else {
  for (const [page, text] of pages) {
    const file = join(REFERENCE, page);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  // A module that left the entry leaves its page behind, and a stale page is exactly the lie this
  // generator exists to prevent. Scoped to `docs/reference/`, which is generated whole.
  const stale = existingPages().filter((page) => !pages.has(page));
  for (const page of stale) rmSync(join(REFERENCE, page));
  process.stdout.write(
    `gen-reference: wrote ${pages.size} pages under ${relative(LIB_ROOT, REFERENCE)}` +
      `${stale.length === 0 ? '' : `, removed ${stale.length} stale`}\n`,
  );
}
