/**
 * LMC-23 — the data feed, and the FRAMING THAT DEPENDED ON POSITION.
 *
 * THE DEFECT THIS FILE CLOSES. The base frames what the series hold at the INSTANT of the call, so
 * framing before writing frames the previous market. While everything lived in a single file, the
 * right order was guaranteed by the POSITION of the blocks: the framing's comment said, out loud,
 * "declaration order is execution order, so this block's position in the file IS the guarantee". A
 * guarantee like that does not survive an extraction — one new hook declared before it is enough,
 * and the order inverts with nothing turning red.
 *
 * The fix is one of shape: writing and framing became ONE body, and the order became the program's.
 * The clauses below read that from the CODE, through the compiler API, because it is the only way
 * to assert "in the same effect" — behaviour alone does not tell "in the same body" from "in two
 * bodies in the right order", which is exactly the fragile arrangement that left here.
 *
 * THE BEHAVIOUR itself stays proved where it always was, against the mounted component:
 * `test/workspaceSurface.spec.tsx` § "a escala e o conjunto de barras" — nine cases, among them the
 * decisive one, which asserts the RANGE of the price axis after an asset switch and fails any
 * implementation that frames before writing.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';

import { stripComments } from './gates/sourceScan';

const SURFACE_DIR = join(__dirname, '..', 'src', 'react', 'surface');
const DATA_MODULE = join(SURFACE_DIR, 'useSeriesData.ts');
const COMPOSITION = join(__dirname, '..', 'src', 'react', 'surface', 'ChartSurface.tsx');

interface HookCall {
  readonly file: string;
  readonly name: string;
  readonly line: number;
  readonly body: string;
}

/** Every `useEffect`/`useCallback`/`useMemo` in the file, with the body STRIPPED of comments. */
function hookCalls(file: string): HookCall[] {
  const text = readFileSync(file, 'utf8');
  const parsed = ts.createSourceFile(file, text, ts.ScriptTarget.ES2021, true, ts.ScriptKind.TSX);
  const found: HookCall[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      /^use(Effect|Callback|Memo)$/.test(node.expression.text) &&
      node.arguments.length >= 1
    ) {
      found.push({
        file: file.slice(file.lastIndexOf('/') + 1),
        name: node.expression.text,
        line: parsed.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        // NO COMMENTS. A body read with the prose inside makes the clause flag the text that
        // EXPLAINS the rule instead of the code that breaks it — the mistake this slice has already
        // made four times.
        body: stripComments(node.arguments[0].getText()),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return found;
}

function everyHook(): HookCall[] {
  return [
    COMPOSITION,
    ...readdirSync(SURFACE_DIR)
      .filter((name) => /\.tsx?$/.test(name))
      .map((name) => join(SURFACE_DIR, name)),
  ].flatMap(hookCalls);
}

describe('LMC-23 — the framing happens in the same effect that wrote the data', () => {
  it('there is exactly one body that frames, and it is a body that writes', () => {
    const framing = everyHook().filter((call) => /fitContent\(\)/.test(call.body));
    expect(framing.map((call) => `${call.file}:${call.name}`)).toEqual([
      'useSeriesData.ts:useEffect',
    ]);
    // THE CENTRAL CLAUSE: the same body writes. A framing that went back to having an effect of its
    // own would satisfy the line above by file and would fail here.
    expect(framing[0].body).toMatch(/\.setData\(/);
  });

  it('inside that body, writing comes BEFORE framing', () => {
    // Not redundant with the clause above: "in the same body" and "in the right order" are two
    // facts, and the base frames what the series hold at the instant of the call.
    const [framing] = everyHook().filter((call) => /fitContent\(\)/.test(call.body));
    const lastWrite = framing.body.lastIndexOf('.setData(');
    const fit = framing.body.indexOf('fitContent()');
    expect(lastWrite).toBeGreaterThan(-1);
    expect(fit).toBeGreaterThan(lastWrite);
    // And the re-arming of the PRICE axis comes before the framing of time, which is what makes
    // price take the new window instead of the previous one.
    expect(framing.body.indexOf('autoScale: true')).toBeLessThan(fit);
  });

  it('no other module of the surface writes series data', () => {
    // POSITIVE CONTROL of the scan, and the ratchet: the writing must not spread out again. If a
    // second owner appears, "in the same effect" stops meaning "after EVERY write".
    const writers = everyHook().filter((call) => /\.setData\(/.test(call.body));
    expect(new Set(writers.map((call) => call.file))).toEqual(new Set(['useSeriesData.ts']));
    expect(writers.length).toBeGreaterThanOrEqual(1);
  });
});

describe('LMC-23 — the crossing notification left the data effect', () => {
  const dataSource = stripComments(readFileSync(DATA_MODULE, 'utf8'));

  it('the data module does not know the alerts layer', () => {
    // It was driven by `bars` and therefore LOOKED like a data effect. It reads the alerts layer,
    // talks to the owner of the levels, and fails together with the capture drag — not with
    // `setData`.
    for (const alien of ['alerts', 'observe(', 'onPriceAlertCrossed', 'PriceAlert']) {
      expect(dataSource).not.toContain(alien);
    }
  });

  it('and it still exists, on the alerts side', () => {
    // NEGATIVE CONTROL. Without this half, deleting the notification would satisfy the clause above
    // — and "left the data effect" would become "vanished".
    // By `lines.observe(` — the container's width observer also observes, and matching the verb
    // alone would flag two bodies that have nothing to do with each other. And by the VERB and not
    // by the prop name: the alerts module receives the report under its own name, and a clause tied
    // to the outside name would turn into an empty search on the next task.
    const crossing = everyHook().filter((call) => /lines\.observe\(/.test(call.body));
    expect(crossing).toHaveLength(1);
    expect(crossing[0].file).not.toBe('useSeriesData.ts');
    // The crossing is ANNOUNCED, and not merely measured: without this line, deleting the report
    // would pass.
    expect(crossing[0].body).toMatch(/crossed\.length > 0/);
    // And it writes no data at all: the two responsibilities really are separated.
    expect(crossing[0].body).not.toMatch(/\.setData\(/);
  });
});
