import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';
import { collectMarkdown, type Source } from './sourceScan';

/**
 * DOC-03, DOC-05 — every TypeScript block in `docs/` is COMPILED, not read for plausibility.
 *
 * An example that does not compile is worse than no example at all: the reader copies it, believes
 * it, and loses the afternoon. It has already bitten this package once — the README's blocks were
 * put under the compiler and the first version of them fell over, because the types they named were
 * not the ones the entry exports. Nothing about that block LOOKED wrong.
 *
 * THE BLOCK IS COMPILED WHOLE, AND ON ITS OWN. Each fence becomes one file, and the file holds the
 * fence and nothing else — no preamble stitched in, no imports helpfully supplied. A block that only
 * compiles with context the reader cannot see is a block that breaks the moment they copy it, so if
 * it needs an import, the import belongs inside the fence where they can see it.
 *
 * ONE PROGRAM, NOT ONE PER BLOCK. Type-checking is where the time goes and the entry is large;
 * checking it once for all blocks instead of once per block is the difference between a gate that
 * runs on every commit and one people start skipping. `moduleDetection: force` is what keeps the
 * blocks from seeing each other: without it a fence with no import or export is a SCRIPT, its
 * top-level names land in the global scope, and two blocks that each declare `chart` collide —
 * a failure caused by the harness rather than by either example.
 *
 * THE PACKAGE IS RESOLVED THE WAY A CONSUMER WRITES IT. `tsconfig.docs.json` extends the config that
 * already puts `example/` under the checker, so `import … from 'lightweight-magic-charts'` maps
 * through `paths` to `src/index.ts`. A block therefore reaches exactly the public surface and no
 * more: a deep import into `src/` fails here, which is the correct answer.
 *
 * AND THE PEERS RESOLVE TOO, WHICH IS WHY THE SCRATCH LIVES INSIDE THE PACKAGE. Measured while
 * writing the tutorial: with the blocks in the system temp directory, `paths` covered the package
 * and nothing else, so `import type { ReactElement } from 'react'`, `import { createChart } from
 * 'lightweight-charts'` and every `.tsx` fence — which needs `react/jsx-runtime` to exist — failed
 * with "cannot find module". TypeScript walks up from the IMPORTING file for a bare specifier, and
 * `/tmp` has no `node_modules` above it. A gate that can only compile blocks importing this package
 * cannot compile the one page that mounts the component, which is the page that decides adoption.
 * Writing the scratch under `node_modules/` here puts the blocks on the real resolution chain, so
 * they see the two peers exactly as a consumer's own `tsc` would — and `node_modules/` is ignored by
 * git, so a crashed run leaves nothing behind to commit.
 *
 * AN EXEMPTION IS DECLARED AT THE FENCE, WITH ITS REASON. ```` ```ts no-compile — <why> ```` is for
 * the cases where compiling is the wrong question: pseudocode, a shell transcript, a fragment being
 * quoted to be criticised. A bare `no-compile` fails — an exemption with no reason is a suppression
 * under another name.
 *
 * IT NEEDS NO BROWSER, so it is unconditional in the quality gate. Nothing here mounts anything.
 */

const LIB_ROOT = join(__dirname, '..', '..');
const DOCS = join(LIB_ROOT, 'docs');
const DOCS_CONFIG = join(LIB_ROOT, 'tsconfig.docs.json');
/** Inside the package, so a bare specifier walks the same `node_modules` chain a consumer's does. */
const SCRATCH_HOME = join(LIB_ROOT, 'node_modules');

/** A reason has to be a sentence. Twenty characters is the same floor the language gate uses. */
const EXEMPTION = /^no-compile\s*[—:-]\s*(\S.{19,})$/;

interface Block {
  readonly doc: string;
  /** 1-based line of the opening fence, so a report points at what the reader sees. */
  readonly fence: number;
  readonly language: 'ts' | 'tsx';
  readonly code: string;
}

interface Exempt {
  readonly doc: string;
  readonly fence: number;
  readonly reason: string | null;
}

interface Harvest {
  readonly blocks: readonly Block[];
  readonly exempt: readonly Exempt[];
}

/**
 * Fences read line by line, because a document is a stream of fences and not a grammar.
 *
 * Only an opening fence carries an info string, and everything up to the next fence of the same
 * width is the block. A regular expression over the whole file would happily pair the closing fence
 * of one block with the opening fence of the next.
 */
function harvest(source: Source): Harvest {
  const lines = source.text.split('\n');
  const blocks: Block[] = [];
  const exempt: Exempt[] = [];
  let at = 0;
  while (at < lines.length) {
    const opening = (lines[at].match(/^```(.*)$/) as RegExpMatchArray | null)?.[1];
    if (opening === undefined) {
      at += 1;
      continue;
    }
    const info = opening.trim();
    let closes = at + 1;
    while (closes < lines.length && !/^```\s*$/.test(lines[closes])) closes += 1;
    const language = info.split(/\s+/)[0];
    const rest = info.slice(language.length).trim();
    if (language === 'ts' || language === 'tsx') {
      if (rest === '') {
        blocks.push({
          doc: source.file,
          fence: at + 1,
          language,
          code: lines.slice(at + 1, closes).join('\n'),
        });
      } else {
        const match = rest.match(EXEMPTION);
        exempt.push({ doc: source.file, fence: at + 1, reason: match === null ? null : match[1] });
      }
    }
    at = closes + 1;
  }
  return { blocks, exempt };
}

/** `docs/<name>.md:<line>` — the two coordinates a reader needs to find the fence. */
const at = (doc: string, line: number): string => `docs/${doc}:${line}`;

function compile(blocks: readonly Block[]): readonly string[] {
  if (blocks.length === 0) return [];
  const config = ts.readConfigFile(DOCS_CONFIG, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, LIB_ROOT);
  mkdirSync(SCRATCH_HOME, { recursive: true });
  const scratch = mkdtempSync(join(SCRATCH_HOME, '.doc-blocks-'));
  try {
    const written = blocks.map((block, index) => {
      const file = join(scratch, `block-${index}.${block.language}`);
      writeFileSync(file, `${block.code}\n`);
      return file;
    });
    const program = ts.createProgram(written, { ...parsed.options, noEmit: true });
    const diagnostics = [
      ...program.getSemanticDiagnostics(),
      ...program.getSyntacticDiagnostics(),
    ];
    return diagnostics
      .map((diagnostic) => {
        const index = written.indexOf(diagnostic.file?.fileName ?? '');
        const block = blocks[index];
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
        if (block === undefined) return `FAIL <no block> :: ${message}`;
        // The line INSIDE the block, put back on the line the document actually has: the fence sits
        // on `block.fence`, so the block's first line is the one after it.
        const inside =
          diagnostic.file === undefined || diagnostic.start === undefined
            ? 0
            : diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line;
        return `FAIL ${at(block.doc, block.fence + 1 + inside)} :: block opened at line ${block.fence} does not compile — ${message}`;
      })
      .sort();
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const harvested = collectMarkdown(DOCS).map((doc) => ({ doc, ...harvest(doc) }));
const blocks = harvested.flatMap((row) => row.blocks);
const exempt = harvested.flatMap((row) => row.exempt);
const failures = compile(blocks);

describe('DOC-03, DOC-05 — every TypeScript block in `docs/` compiles', () => {
  it('reads real fences out of the real documents, so a green gate is not a gate over nothing', () => {
    // POSITIVE CONTROL. Zero blocks compile vacuously, and the clause below would be green over a
    // harvester that had quietly stopped finding anything.
    expect(harvested.length).toBeGreaterThanOrEqual(10);
    expect(blocks.length + exempt.length).toBeGreaterThanOrEqual(1);
  });

  it('compiles every block against the public entry, and names the ones that do not', () => {
    expect(failures).toEqual([]);
  });

  it('every `no-compile` fence carries a written reason', () => {
    // An exemption with no reason is a suppression wearing another word. The reason sits ON the
    // fence, where a reader meets it, rather than in a list of paths nobody opens.
    expect(exempt.filter((fence) => fence.reason === null).map((fence) => at(fence.doc, fence.fence))).toEqual([]);
  });

  it('a block that imports a symbol the entry does not export fails, naming document and line', () => {
    // DISCRIMINATION PROOF, served from memory — a violator on disk would prove the tree is dirty
    // rather than that this gate can tell a working example from a broken one.
    const planted: Block = {
      doc: 'synthetic/Planted.md',
      fence: 12,
      language: 'ts',
      code: "import { thisWasNeverExported } from 'lightweight-magic-charts';\nvoid thisWasNeverExported;",
    };
    const reported = compile([planted]);
    expect(reported).toHaveLength(1);
    expect(reported[0]).toContain('docs/synthetic/Planted.md:13');
    expect(reported[0]).toContain('block opened at line 12');
    expect(reported[0]).toContain('thisWasNeverExported');

    // AND THE SAME BLOCK, IMPORTING A SYMBOL THAT IS THERE, GOES QUIET.
    expect(
      compile([
        {
          ...planted,
          code: "import { computeLayout } from 'lightweight-magic-charts';\nvoid computeLayout;",
        },
      ]),
    ).toEqual([]);
  });

  it('reaches the two peers as well as the package, which is what a mounting example needs', () => {
    // The tutorial mounts a React component over the real renderer, so its fences name `react`,
    // `lightweight-charts` and JSX. Each of the three failed with "cannot find module" while the
    // scratch sat in the system temp directory, and each is asserted here rather than left to be
    // rediscovered: a bare specifier resolves from the importing FILE, so where the block is written
    // decides what it can see.
    expect(
      compile([
        {
          doc: 'synthetic/Peers.md',
          fence: 1,
          language: 'tsx',
          code: [
            "import { ChartWorkspace } from 'lightweight-magic-charts';",
            "import { createChart } from 'lightweight-charts';",
            "import type { ReactElement } from 'react';",
            'void createChart;',
            'export const mounted = (props: Parameters<typeof ChartWorkspace>[0]): ReactElement => (',
            '  <ChartWorkspace {...props} />',
            ');',
          ].join('\n'),
        },
      ]),
    ).toEqual([]);
  });

  it('the block is compiled WHOLE and alone — context the reader cannot see is not supplied', () => {
    // The half a lazy harness would paper over: a fence that leans on a name declared in a NEIGHBOUR
    // fence has to fail, because the reader copies one fence, not the document.
    const declares: Block = {
      doc: 'synthetic/First.md',
      fence: 3,
      language: 'ts',
      code: 'export const sharedByAccident = 1;',
    };
    const leans: Block = {
      doc: 'synthetic/Second.md',
      fence: 9,
      language: 'ts',
      code: 'void sharedByAccident;',
    };
    const reported = compile([declares, leans]);
    expect(reported.map((line) => line.split(' :: ')[0])).toEqual(['FAIL docs/synthetic/Second.md:10']);
  });

  it('reads a fence as a fence: an exemption without a reason is not an exemption', () => {
    const doc: Source = {
      file: 'synthetic/Fences.md',
      text: [
        '```ts',
        'export const a = 1;',
        '```',
        '',
        '```ts no-compile',
        'this is not typescript at all',
        '```',
        '',
        '```ts no-compile — pseudocode for the shape of the seam, never a real call',
        'seed(scope) -> apply(frame) -> repeat',
        '```',
        '',
        '```text',
        'not typescript, and not claimed to be',
        '```',
      ].join('\n'),
    };
    const found = harvest(doc);
    expect(found.blocks.map((block) => block.fence)).toEqual([1]);
    expect(found.exempt.map((fence) => [fence.fence, fence.reason === null])).toEqual([
      [5, true],
      [9, false],
    ]);
  });
});
