# Contributing

Thanks for opening the package. This file is the short path from a clone to a pull request that
passes: the commands that exist, the gates that decide, and what each gate does **not** answer.

Every command below was run against this tree before it was written down. If one of them fails on a
clean checkout, that is a bug in this file — report it as one.

## Setting up

This package is its own repository and has no runtime dependencies. One install, from the root:

```sh
npm ci        # or `npm install` if you are changing the manifest
```

**Node 22 or newer**, which is what `engines` declares and what CI runs: 22, 24 and 26, the three
still supported upstream. That range is not decoration — `10 ** -4` is `0.0001` on one Node and
`0.00009999999999999999` on another, and the defect reached master because a single version was the
only version. If your local Node is outside the range, the suite may pass here and fail there.

Every command below is run from the repository root. There is no workspace flag: this package used
to live inside a monorepo and was extracted, so if you find a `-w libs/…` anywhere in this tree, it
is a leftover and a bug.

## Running the suite

```sh
npm test
```

100 suites, 1198 tests as measured on 2026-08-16, jest with `ts-jest`. The count is written with its
date because it moves with every change; the command above is the authority, not this line. The
default environment is `node` on purpose — most of
this package is browser-free arithmetic, and a module that reaches for `window` should fail rather
than quietly work. Component suites opt in one file at a time with an `@jest-environment jsdom`
docblock.

Anything after `--` goes to jest:

```sh
npm test -- test/gates/fileSize.spec.ts   # one file
npm test -- -t "the list only shrinks"    # one test, by name, across every suite that has it
```

### Three gates do not run here, and the reason is in the config

`jest.config.js` ignores `hookPurity`, `packageName` and `packaging`. They read `apps/web` — the
consumer this library was extracted out of. They are real gates and they still run **in the
monorepo**, where that app exists. Here they would read a path that is not there and fail for the
wrong reason, which is worse than not running: a red suite that means "wrong checkout" trains people
to ignore red. `boundary.spec.ts` is deliberately **not** on that list — most of it audits this
package, and only its final case reaches into the app, skipped from inside the file with the reason
next to it.

If you change what those three measure, you are changing something this checkout cannot verify. Say
so in the pull request.

## Building

```sh
npm run build       # tsc (CommonJS + declarations), then build:esm
npm run build:esm   # ESM tree + the extension rewrite and the marker
```

`build:esm` is not optional decoration: `tsc` emits extensionless specifiers and Node's ESM resolver
does no guessing, so `scripts/finalise-esm.mjs` completes them and writes the `type: module` marker.
Two checks below read `dist/` and refuse to measure output older than the source, so build before
you measure.

## The gates

There is no gate script. The gates **are** the suite, so the whole verdict is two commands:

```sh
npm run build   # the size budget and the derived reference measure the BUILT entry
npm test        # every gate below, plus the behavioural suites
node scripts/size-gate.mjs             # the size probe again, through its real CLI
node scripts/verify-package-paths.mjs  # every path files[] and exports promise resolves
```

Run in that order. A suite run against a stale `dist/` asserts against an artefact nobody is
shipping — which is why `sizeBudget` refuses to measure a `dist/` older than `src/` rather than
report a stale number.

The third command is not redundant with the second. `test/gates/sizeBudget.spec.ts` exercises the
probe **through its CLI** — the exit code and the printed report — because that is the surface CI
depends on; running it by hand is how you read the table when a budget moves. Measured 2026-08-16:
`size-gate: OK — 16 measurements under the budget`, exit 0.

```sh
npm run e2e   # the demo, in a real browser
```

**The one command that renders anything.** Everything above runs without a browser, and on 2026-08-16
that gap let seven defects reach the published page at once — an empty volume pane, an empty studies
panel, a heatmap that painted nothing, a drawing tool that armed and never drew, a price alert that
could not be removed, four of six chosen studies not plotting, and every category glyph rendered as
an empty box. All seven were green across the whole suite, because none of it looks at a canvas.

`scripts/e2e-demo.mjs` mounts `example/` in Chromium and asserts on legend readings, `data-testid`
counters and canvas checksums compared against a captured control — never on a screenshot matching a
golden file, which fails on a font and passes on a blank chart. It needs a browser once:

```sh
npx playwright-core install --with-deps chromium
```

The fourth command is the one a library owes the people installing it: `files[]` and `exports` are
promises made to someone not in the room, and a target that resolves to nothing is an install that
succeeds and then throws on first import. It lives in a script rather than inside a workflow
precisely so this list can contain it — nothing in CI is stronger than what you can run locally, and
nothing local is weaker than CI. `.github/workflows/ci.yml` runs these on every pull request, and
`release.yml` runs them again on the tag, because the run that publishes is the run that most needs
to have checked.

### The check that answers for the vendor's arithmetic

```sh
npm run proof   # every offered indicator, and every offered control
```

`scripts/indicator-proof.mjs` is the owner's own acceptance condition, executed before he executes
it: every indicator the committed manifest offers has to draw, be deterministic, be pure, be
bar-length and index-aligned, sit on the scale it declares and break no asserted bound — and **every
control it offers has to move the drawing**, re-proved on the spot rather than read from a cached
census. The other half is asserted too: every control the library declares and the manifest holds
back carries a written reason, because "held back" and "forgotten" look identical otherwise.

It verifies the manifest; it does not decide what is offered. A second funnel over the same set
would be a second source of truth about what the product offers, and two of those diverge on the
first release.

It also re-derives the committed FINGERPRINTS, which are digests of computed VALUES rather than of
names and shapes — a vendor release that moves one number by one part in a billion turns it red and
says which indicator. The catalogue itself is generated:

```sh
node scripts/build-indicator-manifest.mjs           # regenerate
node scripts/build-indicator-manifest.mjs --check   # derive again, write nothing, fail if stale
```

The generator REFUSES to write when an id in the committed manifest has vanished from the library
and neither `example/indicators/renames.json` nor the defect ledger says why. It can see that the id
is gone; it cannot tell a rename from a removal, and a host's saved workspace can — so silent loss
only gets through a red build.

**It refuses on the same terms when a NUMBER moved.** Regenerating the fingerprints is the ordinary
way to take a vendor release, and that is exactly what turns the fingerprint check into a check of
itself: the digest moves, the file moves with it, and the gate is green over a value nobody read.
Measured with an inverted-weight `wma`, 2.1% wrong, shipped the way a release arrives — every check
passed. So a moved digest has to be declared in `example/indicators/value-changes.json`, which is
append-only, with the id, the digest it moved from, the digest it moved to and the reason. Taking a
release therefore reads: run `--check`, read the refusal it prints, satisfy yourself about each
indicator it names, write the declaration, then regenerate.

Its own command and its own CI job, for the same reason `npm run e2e` has one: it loads a 1.05 MB
third-party library and computes three hundred indicators over 1664 bars. Measured 2026-08-21:
`indicator-proof: 29/29 passed in 11.3 s`, exit 0. `lightweight-charts-indicators` and `oakscriptjs`
are devDependencies pinned EXACTLY — a range would let every digest move while the check stayed
green — and `test/boundary.spec.ts` is what keeps either of them out of `src/`, statically and
through `import()` alike.

### The check that runs a browser, and why it is not wired in

```sh
npm run layout-probe   # builds the ESM tree, then drives example/ in a real Chromium
```

`scripts/layout-probe.mjs` measures the geometry jsdom cannot produce: whether the elastic members
of the canvas row actually SHARE it. It is the check that found the compact grid sitting at 0 px
wide. It was the only check here that had ever seen a pixel until `npm run e2e` joined it, and the
two do not overlap: the probe interrogates one layout invariant, the suite drives the whole demo.
Measured
2026-08-14: five edits of ONE property — `maxWidth: 0` on the grid, `flex: 1` / `flexBasis: 0` /
`maxWidth: 0` on the surface, `maxWidth: 0` on the row — paint a blank screen and pass every
library assertion. The probe kills the five in about seven seconds each.

`playwright-core` is a declared devDependency, so `npm ci` installs the driver. The **browser** is a
machine-local artefact rather than a repository one, so it is fetched once, by hand:

```sh
npx playwright install --only-shell chromium
```

`--only-shell` is the headless shell rather than the full browser: this probe measures layout, and
nothing here needs a window. Without it the probe exits 2 and names what is missing rather than
reporting a pass it did not earn.

It does **not** run in CI. The job that does render is `e2e`, below, and it drives the whole demo
rather than this one measurement — the probe stays a tool you reach for when geometry is the
suspect.

This is the correction of a real gap, and it is worth knowing why the rule exists. Until 2026-08-16
the probe had no home: it resolved `playwright-core` by accident through the monorepo's app, and the
extraction removed the accident without replacing it. `0.1.0` then shipped with a demo whose studies
panel could not be closed by keyboard — past a green suite and a green CI, because nothing in the
pipeline rendered anything.

The jsdom side is the cheap half and it is asserted where the suite already runs —
`test/compactGrid.spec.tsx`, `test/chartSurface.spec.tsx` and `test/canvasRow.spec.tsx` pin the
declarations that decide the geometry, including the ones that only ever appear as an *absence*
(`style.flex` and `style.maxWidth` must both serialise empty). Those clauses are a strictly weaker
sensor than the probe: they fail on the declarations they name, the probe fails on the pixels.

A note on lint. There is none, and that is the honest state rather than a policy: the monorepo
linted this package with biome from its root, and no biome configuration came across with the
extraction. Nothing in this repository checks style today. Match the file you are editing, and if
you add a linter, add it as a gate with a ledger like every other rule here.

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
| `test/gates/hookPurity.spec.ts` **(monorepo only)** | a `use*` module exports at most 2 non-hook symbols, none over 40 code lines | it does not look at the whole app: scope is this library plus the chart workspace hooks, deliberately. **Ignored in this checkout** — it reads `apps/web` |
| `test/gates/memoisation.spec.tsx` | every `react/workspace/` region and every chrome widget is `React.memo`, **and** a region does not re-render when the root does without its own field moving | it stops at that boundary. The published composites decide their own render discipline, because a host mounts them |
| `test/gates/danglingRef.spec.ts` | no comment in `src/`, `test/` or `docs/` points at an archived plan, and every `I1`..`I14` still names a live conformance case | it cannot tell a *correct* pointer from a merely *resolvable* one |
| `test/gates/commentBudget.spec.ts` | `src/` stays at or under 0.20 comment lines per code line, no single file past 1.0, and every `docs/<file>.md#<anchor>` written in `src/` resolves to a real file **and** a real heading | it counts lines, not truth. A comment can resolve, fit the budget and still be wrong |
| `test/gates/language.spec.ts` | comments in `src/` and `test/`, prose strings in `test/`, and diagnostics in `src/` are English | **product text is deliberately out of scope** — what the library paints belongs to the host, through `chrome.labels`. `src/indicator/coverage.ts` still builds a Portuguese footer, named rather than hidden |
| `test/gates/wording.spec.ts` | no component under `src/react` holds a sentence of its own, in what a reader sees, a screen reader hears or a pointer reveals | it guards the channel, not the wording. A bad English default passes |
| `test/gates/socketParity.spec.ts` | a region that declares a field the composition never passes fails the build | it sees declared fields, not behaviour: a field passed with the wrong value is invisible to it |
| `test/gates/packageName.spec.ts` **(monorepo only)** | the published name is right, and the retired spelling cannot come back, across everything `git ls-files` tracks | the two record trees (`.specs/`, the frozen `openspec/` archive) are exempt with a written reason. **Ignored in this checkout** — it reads `apps/web` |
| `test/gates/sizeBudget.spec.ts` | the per-symbol byte budget, exercised through the probe's **CLI** — the exit code and the printed report, which is what CI depends on | it measures the ESM tree it is given. It refuses to measure a `dist/` older than `src/` rather than report a stale number |
| `test/gates/packaging.spec.ts` **(monorepo only)** | both trees **load in a real `node`**, the tarball is listed out of a real archive, and declarations compile under the nested TypeScript 4.9 that `apps/web` runs | it asserts against artefacts, so it is only as fresh as your last build. **Ignored in this checkout** — the nested-TypeScript half needs the app. CI covers the tarball half with its own pack check |
| `test/gates/docExamples.spec.ts` | every TypeScript block in `docs/` and the README is **compiled**, not read for plausibility | it compiles a block, it does not run one. Code that type-checks and does the wrong thing passes |
| `test/gates/docReference.spec.ts` | the symbol reference is **derived** from the entry, so it cannot name an absent symbol or omit an exported one | it holds the list equal to the exports, not the prose equal to the behaviour |
| `test/gates/docShape.spec.ts` | no tutorial, how-to or reference page past 300 lines, and no orphan page nothing links to | length and reachability are not readability. A reachable 299-line page can still answer nothing |
| `test/gates/readmeExample.spec.ts` | the two blocks the README calls "verbatim" are byte-for-byte equal to `example/` | whether either side is any GOOD. Equality says the two agree, not that they compile — `tsconfig.example.json` is what puts `example/` under the type-checker |
| `test/boundary.spec.ts` | per-file declared purity, what each layer may import, and that no business concept is named inside `src/` | prose *about* a rule is stripped before the scan, so a comment may name what the code may not. Its final case, the one that reaches into `apps/web`, skips itself here |

## What a pull request has to carry

1. **A green `npm run build && npm test`.** Paste the counts jest prints. That is the bar, and it is
   the same thing CI runs. A suite run without the build in front of it is not a run: two gates
   measure `dist/`, and they will refuse rather than report a stale number.
2. **A green `npm run e2e` when the change can reach the page.** Anything under `example/`, and
   anything in `src/react/`, is that kind of change. The suite is the only thing here that renders.
   **A green `npm run proof` when the change touches the indicator manifest or the vendor pin.**
   That gate is the one that answers for somebody else's arithmetic.
3. **Tests that assert an outcome, not an implementation.** New behaviour arrives with a test that
   would fail without it. Weakening, skipping or deleting a test to get to green is never the fix.
4. **A ledger that only shrank.** If your change makes a recorded violator comply, take it out of the
   ledger in the same commit. If it adds a violator, the answer is the code, not the ledger.
5. **Reasoning in `docs/`, one line and a pointer in the code.** See
   [`docs/README.md`](docs/README.md). Record the alternative you knocked down and what measured it —
   a rejected alternative with no written reason comes back with a fresh commit message.
6. **A number, when you claim one.** "Faster", "smaller" and "safer" are claims; the byte count, the
   measurement and the date are what make them checkable. That is the same standard the gates hold
   themselves to.
7. **A `CHANGELOG.md` entry for anything a consumer can see.** The entry for `0.1.0` lists what counts
   as a breaking change — read it before deciding your change is not one. Accessible names, roles and
   `data-testid` values are on that list, because a host's own tests hold on to them.
8. **English.** Comment, test name and diagnostic. Where non-English is on purpose, mark the line
   `non-english-fixture: <reason>` next to the string it excuses, with a reason long enough to be one.
9. **Commits in Conventional Commits form**, one logical change each.

## Releasing

There is no release ceremony and nothing to run by hand. **The version in `package.json` is the
release decision**, and it is made in a pull request like everything else.

On every merge into `master`, `.github/workflows/release.yml` asks the registry whether
`lightweight-magic-charts@<version>` already exists. If it does, the run is a clean no-op. If it does
not, the same build, the same suite and the same tarball check run again, and the package is
published with `--provenance`.

Three consequences worth knowing before you bump anything:

- **A merge that does not touch the version publishes nothing.** That is the ordinary case, and it is
  silent rather than red.
- **The publish waits for a human.** It runs in the `npm` environment, which carries a required
  reviewer. An irreversible act gets one deliberate approval.
- **The live example is redeployed from the published version**, not from `master`. A page ahead of
  the package teaches the reader an API that `npm install` does not hand them. It deploys in its own
  job, so a Pages outage cannot fail a run that has already published.
- **The tag is written after the publish, not before.** `v0.1.0` appears once `0.1.0` is on the
  registry, so a tag in this repository always means that version shipped. It is a record, never a
  trigger — GitHub does not start workflow runs from events raised with the default `GITHUB_TOKEN`,
  so a release driven by a tag this workflow creates would look configured and never run.

If the registry answers anything other than "present" or "absent", the run stops instead of guessing.
An outage must not read as "not published yet".

## Adding a gate

A new deterministic rule ships as a suite under `test/gates/`, and it carries four things: the
requirement it serves, a **positive control** built from text so the rule is seen failing, its own
declared blind spot in the docblock, and — if it lands over existing violators — a dated ledger with
the equality assertion that keeps it shrinking. A gate lit over violators with no ledger is a gate
somebody suppresses, and a suppressed gate never measures anything again.

There is no separate stage to register it in: a suite under `test/gates/` is picked up by `npm test`
and therefore by CI, which is the whole reason the gates were built as suites rather than as shell
stages. A gate that needs something the suite cannot give it — a browser, a sibling package, a
network — does not belong in `test/gates/` until that dependency is declared, or it becomes the next
`layout-probe`: a real measurement nobody runs.
