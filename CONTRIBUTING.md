# Contributing

Thanks for opening the package. This file is the short path from a clone to a pull request that
passes: the commands that exist, the gates that decide, and what each gate does **not** answer.

Every command below was run against this tree before it was written down. If one of them fails on a
clean checkout, that is a bug in this file — report it as one.

## Setting up

The package lives inside a monorepo and is an npm workspace. Install from the repository root, once:

```sh
npm install
```

Everything after this is run from the repository root too. `-w libs/lightweight-magic-charts` is what
scopes a command to this package.

## Running the suite

```sh
npm test -w libs/lightweight-magic-charts
```

95 suites, 1131 tests as measured on 2026-08-14, jest with `ts-jest`. The count is written with its
date because it moves with every change; the command above is the authority, not this line. The
default environment is `node` on purpose — most of
this package is browser-free arithmetic, and a module that reaches for `window` should fail rather
than quietly work. Component suites opt in one file at a time with an `@jest-environment jsdom`
docblock.

Anything after `--` goes to jest:

```sh
npm test -w libs/lightweight-magic-charts -- test/gates/fileSize.spec.ts   # one file
npm test -w libs/lightweight-magic-charts -- -t "the exports map"          # one test, by name
```

## Building

```sh
npm run build -w libs/lightweight-magic-charts       # tsc (CommonJS + declarations), then build:esm
npm run build:esm -w libs/lightweight-magic-charts   # ESM tree + the extension rewrite and the marker
```

`build:esm` is not optional decoration: `tsc` emits extensionless specifiers and Node's ESM resolver
does no guessing, so `scripts/finalise-esm.mjs` completes them and writes the `type: module` marker.
Two checks below read `dist/` and refuse to measure output older than the source, so build before
you measure.

## The gates

```sh
npm run gate                                              # everything, from the repository root
npx --no-install biome lint libs/lightweight-magic-charts # this package only — must be zero errors
node libs/lightweight-magic-charts/scripts/size-gate.mjs  # the size probe, through its real CLI
```

`npm run gate` runs `scripts/quality-gate.sh`. Exit 0 is a pass; `[WARN]` never fails, `[FAIL]` does.
Two knobs, both read from the environment:

- `GATE_BASE=<sha> npm run gate` — the ratcheted checks take their scope from the diff against
  `<sha>` instead of the working tree. Use it when the change spans several commits;
- `GATE_SKIP_TESTS=1 npm run gate` — skips the slow wholesale suites. **It cannot produce a pass**:
  the script fails deliberately with `chart library gates NÃO EXECUTADOS`, because a skipped stage is
  not an approved one. It exists to read the earlier stages quickly, nothing else;
- `LAYOUT_PROBE=1 npm run gate` — adds the browser-geometry stage below. Without it that stage
  prints `[SKIP]` and the final verdict says so out loud.

### The gate stage that runs a browser, and why it is opt-in

```sh
LAYOUT_PROBE=1 npm run gate                             # the probe as a gate stage
npm run layout-probe -w libs/lightweight-magic-charts   # the same probe, on its own
```

`scripts/layout-probe.mjs` drives `example/` in a real Chromium and measures the geometry jsdom
cannot produce: whether the elastic members of the canvas row actually SHARE it. It is the check
that found the compact grid sitting at 0 px wide, and it is the **only** check in this repository
that has ever seen a pixel. Measured 2026-08-14: five edits of ONE property — `maxWidth: 0` on the
grid, `flex: 1` / `flexBasis: 0` / `maxWidth: 0` on the surface, `maxWidth: 0` on the row — paint a
blank screen and pass all 1131 library assertions and all 1204 of the app. The probe kills the five
in about seven seconds each.

It is **opt-in rather than unconditional**, and the reason is a hard dependency rather than a
preference: it needs `playwright-core` — which this package does not declare and which resolves only
transitively, through `apps/web` — plus a downloaded Chromium, which is a machine-local artefact and
not a repository one. Unconditional, it makes a browser download a prerequisite of every gate
invocation, and a stage that cannot go green on a clean machine gets switched off before it
discriminates anything.

Opt-in is **not** the "skipped stage" the convention above refuses. That rule is *a skipped stage is
not an approved one* — what it refuses is a **silent** one. The pattern for this exact case is
already written and in use for the gate's most important check, live parity: it runs under an
explicit signal, prints `[SKIP] layout probe (set LAYOUT_PROBE=1 to run …)` when it does not, and
the final verdict is rewritten to `GATE: PASS (WITHOUT … browser geometry — the layout probe; did
not run — this is not a full pass)`. Nobody can quote a pass that includes geometry without having
run it.

The jsdom side is the cheap half and it is asserted where the suite already runs —
`test/compactGrid.spec.tsx`, `test/chartSurface.spec.tsx` and `test/canvasRow.spec.tsx` pin the
declarations that decide the geometry, including the ones that only ever appear as an *absence*
(`style.flex` and `style.maxWidth` must both serialise empty). Those clauses are a strictly weaker
sensor than the probe: they fail on the declarations they name, the probe fails on the pixels.

A note on lint scope. `npm run lint` at the root runs biome over the whole monorepo and fails on a
pre-existing baseline that has nothing to do with this package (measured 2026-08-14: 52 errors, none
of them here). The gate therefore lints **this package only**, and there the verdict is zero errors.
Formatting is not gated: no stage runs `biome format`, and run by hand it disagrees with this
package's own style. Match the file you are editing.

### What each deterministic gate guarantees, and what it does not

Every gate in this package is a test suite, so a gate that stops running is a gate that fails: the
script reads each stage's verdict out of jest's own report and treats an absent one as `FAIL`, never
as silence. Several also carry a **dated ratchet ledger** of the violators that already existed. A
ledger is not an exception list — a file that is not on it fails on the spot, a file on it that gets
worse fails, and a file on it that stops violating **must be removed** or the equality assertion
fails. The list can only shrink.

And each one declares its own limit in its docblock. That is the house convention, not a courtesy:
a guard whose blind spot is unwritten gets read as covering everything.

| Gate | Guarantees | Does not guarantee |
| --- | --- | --- |
| `test/gates/fileSize.spec.ts` | no file under `src/` past 350 lines of **code** (comments and blanks are free) | nothing about cohesion — a 349-line file doing four jobs passes |
| `test/gates/propCount.spec.ts` | no component under `src/react` declares more than 12 **top-level** props, counted by the compiler | nothing about props moved into context. That hole is what `setupFanOut.spec.ts` measures |
| `test/gates/setupFanOut.spec.ts` | no file reads more than 4 distinct setup fields, and no selector takes the whole value | it counts reads, not coupling through other channels |
| `test/gates/hookPurity.spec.ts` | a `use*` module exports at most 2 non-hook symbols, none over 40 code lines | it does not look at the whole app: scope is this library plus the chart workspace hooks, deliberately |
| `test/gates/memoisation.spec.tsx` | every `react/workspace/` region and every chrome widget is `React.memo`, **and** a region does not re-render when the root does without its own field moving | it stops at that boundary. The published composites decide their own render discipline, because a host mounts them |
| `test/gates/danglingRef.spec.ts` | no comment in `src/`, `test/` or `docs/` points at an archived plan, and every `I1`..`I14` still names a live conformance case | it cannot tell a *correct* pointer from a merely *resolvable* one |
| `test/gates/commentBudget.spec.ts` | `src/` stays at or under 0.20 comment lines per code line, no single file past 1.0, and every `docs/<file>.md#<anchor>` written in `src/` resolves to a real file **and** a real heading | it counts lines, not truth. A comment can resolve, fit the budget and still be wrong |
| `test/gates/language.spec.ts` | comments in `src/` and `test/`, prose strings in `test/`, and diagnostics in `src/` are English | **product text is deliberately out of scope** — what the library paints belongs to the host, through `chrome.labels`. `src/indicator/coverage.ts` still builds a Portuguese footer, named rather than hidden |
| `test/gates/wording.spec.ts` | no component under `src/react` holds a sentence of its own, in what a reader sees, a screen reader hears or a pointer reveals | it guards the channel, not the wording. A bad English default passes |
| `test/gates/socketParity.spec.ts` | a region that declares a field the composition never passes fails the build | it sees declared fields, not behaviour: a field passed with the wrong value is invisible to it |
| `test/gates/packageName.spec.ts` | the published name is right, and the retired spelling cannot come back, across everything `git ls-files` tracks | the two record trees (`.specs/`, the frozen `openspec/` archive) are exempt with a written reason |
| `test/gates/sizeBudget.spec.ts` | the per-symbol byte budget, exercised through the probe's **CLI** — the exit code and the printed report, which is what CI depends on | it measures the ESM tree it is given. It refuses to measure a `dist/` older than `src/` rather than report a stale number |
| `test/gates/packaging.spec.ts` | both trees **load in a real `node`**, the tarball is listed out of a real archive, and declarations compile under the nested TypeScript 4.9 that `apps/web` runs | it asserts against artefacts, so it is only as fresh as your last build |
| `test/boundary.spec.ts` | per-file declared purity, what each layer may import, and that no business concept is named inside `src/` | prose *about* a rule is stripped before the scan, so a comment may name what the code may not |

## What a pull request has to carry

1. **A green `npm run gate`.** Paste the verdict line. `GATE: PASS` is the bar; a run that ends in
   `GATE: FAIL` is not ready, and a `GATE_SKIP_TESTS=1` run is not a run.
2. **Tests that assert an outcome, not an implementation.** New behaviour arrives with a test that
   would fail without it. Weakening, skipping or deleting a test to get to green is never the fix.
3. **A ledger that only shrank.** If your change makes a recorded violator comply, take it out of the
   ledger in the same commit. If it adds a violator, the answer is the code, not the ledger.
4. **Reasoning in `docs/`, one line and a pointer in the code.** See
   [`docs/README.md`](docs/README.md). Record the alternative you knocked down and what measured it —
   a rejected alternative with no written reason comes back with a fresh commit message.
5. **A number, when you claim one.** "Faster", "smaller" and "safer" are claims; the byte count, the
   measurement and the date are what make them checkable. That is the same standard the gates hold
   themselves to.
6. **A `CHANGELOG.md` entry for anything a consumer can see.** The entry for `0.1.0` lists what counts
   as a breaking change — read it before deciding your change is not one. Accessible names, roles and
   `data-testid` values are on that list, because a host's own tests hold on to them.
7. **English.** Comment, test name and diagnostic. Where non-English is on purpose, mark the line
   `non-english-fixture: <reason>` next to the string it excuses, with a reason long enough to be one.
8. **Commits in Conventional Commits form**, one logical change each.

## Adding a gate

A new deterministic rule ships as a suite under `test/gates/`, and it carries four things: the
requirement it serves, a **positive control** built from text so the rule is seen failing, its own
declared blind spot in the docblock, and — if it lands over existing violators — a dated ledger with
the equality assertion that keeps it shrinking. A gate lit over violators with no ledger is a gate
somebody suppresses, and a suppressed gate never measures anything again.

If the gate should block on its own rather than only inside the whole suite, add a `gate_stage` line
for it in `scripts/quality-gate.sh` so an absent report reads as `FAIL` instead of as silence.
