# Indicator render fidelity — Validation

**Date**: 2026-08-22
**Spec**: `.specs/features/indicator-render-fidelity/spec.md`
**This pass**: `b2c0082..a57dbb3` — 8 commits, tasks T18–T24, branch `feat/indicator-library-adoption`
**Cumulative**: `0480c76..a57dbb3` — 26 commits, 24 tasks
**Report committed at**: `773481d` — this report's own commit, `.specs/` only. `git diff a57dbb3..773481d -- src/ test/ scripts/ example/ conformance/ package.json size-budget.json .github/` is **empty**, and every gate below was re-run at `773481d` with identical results (1478/1478 · 96/96 · 33/33 · 104853/104853 · `--check` OK, 310 offered). A validation report cannot cover the commit that carries it; this line closes that gap by measurement.
**Verifier**: independent sub-agent, second pass (author ≠ verifier). Coverage re-derived from the
spec and the diff, evidence-or-zero. Nothing was inherited from `tasks.md` or from the first pass's
report — every one of the four failing attacks was rebuilt from scratch and re-run in both
directions.

---

## Verdict: ✅ PASS

**Result**: PASS ✅

The four surviving mutants that failed the first pass are dead. I killed them with mutations I wrote
myself, and for the two where a *false* red was the risk I also ran the counter-direction and
confirmed the test stays **green** when the neighbouring channel is removed — which is what
distinguishes a repaired sensor from a re-armed accident.

`git diff b2c0082..a57dbb3 -- src/` is **empty**. Confirmed. This pass added no published byte, no
runtime behaviour inside the package, and exactly one runtime rule anywhere: the loaded-window test
in `example/studyMarks.ts`, which implements a spec edge case that had no implementation at all.

One second-order mutant survives and it is **not** a regression from this phase: the new ledger
guard's own call site inside the generator is unpinned by any gate — and I measured that the
*pre-existing* vanished-id refusal, which this one copies, has exactly the same property. It is
recorded below under limitations, not ranked as a gap.

---

## 1. The four re-attacks, rebuilt from zero

### G1 — the marker sensor. **Both directions confirmed.**

The first pass found that T13's point colours had disarmed T11's control: the scene drove
`realtime-volume-bars`, which writes `#00FF00`/`#FF0000` from **two** channels, so `up > 0 && down > 0`
could no longer fall to zero.

Baseline on the real tree, measured by me: `marks.reach-the-bars` reads **up 393, down 426** against
`marks.none-before-the-pick` at **0, 0** (`scripts/e2e-demo.mjs:1454`, `:1442`).

| Direction | Mutation | Result |
| --- | --- | --- |
| **(a) the channel under test** | delete `withMarkers` at `example/engine.ts:124` → `return created;` | **up 0, down 0 — RED, `npm run e2e` 95/96, exit 1** |
| **(b) the neighbouring channel** | `alignColors` returns `null` at `src/indicator/availability.ts:55` | **up 392, down 426 — GREEN, 96/96** |

Direction (a) is decisive on its own: **both hues go to exactly zero** when only the marker plugin is
removed. Nothing else on the page — not the point colours, not the 975 `barColors` `t3-psar` also
emits — writes either hue, and that is measured rather than asserted. Direction (b) is the proof the
first pass demanded: with the point-colour channel dead the scene is unmoved (one pixel of
antialias), so it cannot be satisfied through that channel. The mutation was confirmed live in the
browser bundle (`dist/esm/indicator/availability.js:36` carried it), not merely in the TypeScript
source.

The study choice is independently corroborated: `example/indicators/manifest.json` records `t3-psar`
with `{"fills":1,"markers":259,"barColors":975}` in category **Moving Averages** — 259 marks, as
claimed, and the category with the space that forced the `domId` change judged in §5.

**Verdict: the sensor is repaired, not cosmetically re-armed.**

### G2 — every rule in `markOf`, ablated one at a time

`example/studyMarks.ts` had no test file at all when the first pass looked; deleting the whole
narrowing left `npm test` and `npm run e2e` green. `test/studyMarks.spec.ts` now exists (21 cases).
I deleted each rule separately, in a scratch worktree, and ran the suite:

| # | Rule removed (`example/studyMarks.ts`) | Cases red |
| --- | --- | --- |
| G2-R1 | `typeof time !== 'number'` alone, keeping `loaded.has` | **0 — equivalent mutant**, see below |
| G2-R2 | `!loaded.has(time)` — the loaded-window test | **3** |
| G2-R2b | the whole time rule (`:60`) | **4** |
| G2-R3 | the shape allow-list (`:61`) | **3** |
| G2-R3a | only `DRAWABLE.has(shape)`, keeping the `undefined` check | **2** |
| G2-R4 | the position allow-list (`:62`) | **2** |
| G2-R4a | only `PLACED.has(position)` | **1** |
| G2-R5 | the colour rule (`:63`) | **1** |
| G2-R5a | only `color === ''`, keeping `typeof` | **1** |
| G2-R6 | `text` dropped when empty (`:70`) | **1** |
| G2-R7 | **all four rules at once** (the first pass's M20) | **9** |
| G2-R8 | `loaded` built from the marks instead of `pass.grid` (`:99`) | **3** |

**Every rule kills at least one case, and every rule kills a case no other rule kills.** G2-R7 — the
mutation that survived last time with 1449/1449 green — now takes down 9 of 21.

**G2-R1 is an equivalent mutant, not a survivor.** With the `typeof` guard removed and a cast added
so it still compiles, all 21 cases pass — because `loaded` is a `Set<number>` and
`new Set([10,20]).has('20')` is already `false`. The case `drops a time that is not a number at all`
(`test/studyMarks.spec.ts:167`) still passes through the membership rule. Removing the guard *without*
the cast is a TypeScript error, which is exactly what the module's own docblock says it is for
("the `typeof` guard stays because it is what types `time`").

**Judgement on `Number.isFinite`: real subsumption, with one stated reason that is wrong.**

The docblock justifies the removal with *"a set of bar times holds neither `NaN` nor `Infinity`."*
That is a claim about the caller's data, not about `Set`. `Set` uses SameValueZero, so
`new Set([NaN]).has(NaN)` is **true**. I measured it directly: against a grid whose own times are
`[NaN, Infinity, 20]`, `markOf` keeps **all three** marks, including the two non-finite ones; against
a finite grid it keeps only `20`.

So the subsumption is real **for every grid this host can produce** and false in general. Weighing it:

- The behaviour the spec asks for is unchanged and still asserted — `test/studyMarks.spec.ts:161`
  drops a `NaN` time, and G2-R2 shows that case goes red when the replacement rule is removed.
- The replacement is strictly stronger for finite grids: it also closes `spec.md:195`, which the
  finiteness test never did.
- The precondition is a bar grid with finite times. Nothing in `src/` or `example/` validates it, but
  a `NaN`-timed bar breaks the candle series long before it reaches a marker, and this file is
  host-side with 0 B in the package.

**Verdict: subsumption, not a rule deleted with an excuse.** The docblock's reasoning is imprecise
and I have recorded a lesson for it; the code is not weaker in any reachable state.

### G3 — `BandFillOverlay.zOrder`

`example/bandOverlay.ts:159` `readonly zOrder = 'behind' as const` → `'ahead'`.

**RED.** `test/bandOverlay.spec.ts` 1 failed / 13 passed — `declares the bottom layer on the fill
itself, not on a probe of the seam`, at `test/bandOverlay.spec.ts:125`:
`expect(new BandFillOverlay('anchor').zOrder).toBe('behind')`.

The assertion is read at the production object, matching `test/densityField.spec.ts:60` and
`test/channelOverlays.spec.ts:262`. The synthetic-probe test of the seam
(`test/overlayAnchor.spec.tsx:267`) is still there and still tests a different, correct thing.

### G4 — the catalogue can no longer shrink without a signature. **All three confirmed.**

I planted a **new** rule in `scripts/build-indicator-manifest.mjs` that withdraws three ordinary
indicators (`bop`, `mass-index`, `momentum`) — the first pass's M19b, rebuilt — and ran the real
generator against three ledger states:

| # | `example/indicators/withdrawals.json` | `node scripts/build-indicator-manifest.mjs` |
| --- | --- | --- |
| **G4a** | `withdrawals: []` | **exit 1**, refuses to write, names all three ids and the rule that took each |
| **G4c** | `reason: "   "`, a missing `reason`, and `reason: ""` | **exit 1**, all three still faults |
| **G4b** | all three signed with a real reason | **exit 0**, 307 rows written |
| **G4d** | `--check` mode, empty ledger | **exit 1** — the CI step at `.github/workflows/ci.yml:128` is on the same path |

The refusal message is the instruction and is tested with the rule
(`scripts/indicator-proof/manifest-shape.mjs:168`, asserted at `test/manifestChannels.spec.ts:293`).
The rule itself is a pure function both sides call, so neither tests a copy —
`withdrawalFaults` at `manifest-shape.mjs:155`, called at `build-indicator-manifest.mjs:345`,
exercised at `test/manifestChannels.spec.ts:259-297`. Five mutations of that function, all killed:

| Mutation | Red |
| --- | --- |
| return `[]` — the old exemption | 4 |
| ignore the ledger entirely | 2 |
| accept a blank reason as a declaration | 1 |
| count a *vanished* id as a withdrawal | 1 |
| drop the id list from the refusal message | 1 |

The `CONTROL — the same two withdrawals, signed, are not a fault` case
(`test/manifestChannels.spec.ts:268`) is what stops the rule degenerating into "refuse every
withdrawal", and it is the case that dies under "ignore the ledger". The accepting branch is
asserted, not only the refusing one.

---

## 2. The central claim, measured with my own instruments

I did not reuse the e2e's hue list. I served `example/` with the same esbuild configuration, drove
Chromium myself, picked **Ichimoku Cloud** by its own catalogue id, and histogrammed every canvas
pixel under `[data-testid="workspace-surface"]` before and after the pick, keeping only colours that
were **absent before** and present at ≥300 px after, clustered at 24/channel.

```
NEW HUES (>=300 px, zero before the pick)
  rgb(71,163,71)    13427 px   <- Kumo, bullish fill
  rgb(245,71,51)     8425 px   <- Kumo, bearish fill
  rgb(76,154,255)    1805 px   <- plot0  Conversion Line
  rgb(38,198,218)    1562 px   <- plot2  Lagging Span
  rgb(199,146,234)   1363 px   <- plot1  Base Line
  rgb(245,166,35)    1029 px   <- plot3  Leading Span A
  rgb(102,187,106)    872 px   <- plot4  Leading Span B
  rgb(19,23,34)      3752 px   <- chart chrome (background, dashed guide)
  rgb(149,152,161)    756 px   <- chart chrome (axis and legend grey)
CONSOLE ERRORS: 0
```

Then I repainted the canvas as a segmentation mask — each of the seven indicator hues replaced by a
maximally distinct pseudo-colour, black everywhere else, so the two greens could not be confused by
eye — and **I looked at it**.

```
plot0 line #4c9aff   px=  3108   distinct x-columns= 853
plot1 line #c792ea   px=  2928   distinct x-columns= 807
plot2 line #26c6da   px=  3052   distinct x-columns= 806
plot3 line #f5a623   px=  2326   distinct x-columns= 712
plot4 line #66bb6a   px=  1892   distinct x-columns= 617
kumo bullish         px= 13478   distinct x-columns= 340
kumo bearish         px=  8439   distinct x-columns= 265
```

**I counted FIVE lines.** Five continuous, separately coloured curves, each spanning 617–853 distinct
x-columns of a 998 px canvas, plus a shaded band in **two** colours bounded above and below by the
`plot3` and `plot4` curves, with the curves drawn over the shading. The five hues are exactly the
first five entries of the host's own palette (`example/panes.ts:21`
`['#4c9aff','#c792ea','#26c6da','#f5a623','#66bb6a','#ef5350']`), which the host cycles **by plot
position** — so five distinct hues is five distinct plot slots drawn, not one line drawn five times.
The Lagging Span is visibly displaced from the other four, which is why counting the legend would
have been the wrong instrument.

**Five lines and a two-coloured Kumo. Confirmed by eye and by count.**

---

## 3. Gates — all re-run by me on the real tree, after the sensor

| Gate | Command | Result |
| --- | --- | --- |
| Build | `npm run build` | exit 0 |
| Quick | `npm test` | **120 suites, 1478 tests, 0 failed, 0 skipped**, exit 0 |
| Full | `npm run e2e` | **96/96**, exit 0 |
| Proof | `npm run proof` | **33/33** in 10.4 s, exit 0 |
| Build | `node scripts/size-gate.mjs` | OK — 16 measurements, entry **104853 / 104853**, exit 0 |
| Build | `node scripts/verify-package-paths.mjs` | OK — `files[]` and `exports` both resolve (7 entries), exit 0 |
| Catalogue | `node scripts/build-indicator-manifest.mjs --check` | OK — 310 offered, exit 0 |

**Test integrity.** `b2c0082`: 119 suites / 1449 tests. `a57dbb3`: **120 / 1478**. Delta **+1 suite,
+29 tests**; nothing decreased. e2e 96 → 96 and proof 33 → 33 are unchanged because T18 *repointed* an
existing scene rather than adding one.
`git diff --diff-filter=D --name-only b2c0082..a57dbb3 -- test/ scripts/ conformance/ example/ src/`
is **empty** — no suite, script or module deleted. No `.skip`, `.only`, `xit`, `fit`, `xdescribe` or
`fdescribe` added anywhere in the range. The single `-1` line in `test/manifestChannels.spec.ts` is
the import statement being extended, not an assertion removed.

**Skill gates.** `validate_spec.py` → 0 errors, 0 warnings. `validate_tasks.py` → 0 errors, 3
warnings (judged in §5). All 8 commit messages pass `check_commit.py`. One atomic commit per task,
T18 → T24, in order.

---

## 4. Discrimination sensor

**Isolation.** Two temporary `git worktree`s at `a57dbb3` under the session scratchpad, with
`node_modules` symlinked and a full `npm run build` so the scratch baseline was itself **120 suites /
1478 tests green** before any mutation. `git stash` was never used. Real-tree
`git status --porcelain` was **empty** before the sensor and is **empty** after (0 bytes, byte-identical
to the captured baseline); both worktrees were removed with `--force` and pruned; HEAD is unchanged
at `a57dbb3` on `feat/indicator-library-adoption`.

**Depth**: P0-full — 33 behaviour-level mutations across the whole diff surface of this pass, plus 2
counter-direction controls and 1 reachability probe.

| # | Mutation | File:line | Result |
| --- | --- | --- | --- |
| G1a | marker plugin removed from the real engine | `example/engine.ts:124` | ✅ **Killed** — e2e 95/96, up 0 / down 0 |
| G1b | `alignColors` returns nothing (counter-direction control) | `src/indicator/availability.ts:55` | ✅ **Marks scene stays GREEN**, 392/426 — the point-colour channel cannot satisfy it |
| G2-R1 | `typeof time` guard only, type-safe | `example/studyMarks.ts:60` | ⚪ **Equivalent mutant** — `Set.has('20')` is already false |
| G2-R2 | loaded-window membership removed | `example/studyMarks.ts:60` | ✅ Killed — 3 |
| G2-R2b | whole time rule removed | `example/studyMarks.ts:60` | ✅ Killed — 4 |
| G2-R3 | shape allow-list removed | `example/studyMarks.ts:61` | ✅ Killed — 3 |
| G2-R3a | `DRAWABLE.has` only | `example/studyMarks.ts:61` | ✅ Killed — 2 |
| G2-R4 | position allow-list removed | `example/studyMarks.ts:62` | ✅ Killed — 2 |
| G2-R4a | `PLACED.has` only | `example/studyMarks.ts:62` | ✅ Killed — 1 |
| G2-R5 | colour rule removed | `example/studyMarks.ts:63` | ✅ Killed — 1 |
| G2-R5a | empty-string clause only | `example/studyMarks.ts:63` | ✅ Killed — 1 |
| G2-R6 | `text` kept when empty | `example/studyMarks.ts:70` | ✅ Killed — 1 |
| G2-R7 | the whole narrowing (the first pass's M20) | `example/studyMarks.ts:60-63` | ✅ Killed — **9** |
| G2-R8 | `loaded` built from the marks, not the grid | `example/studyMarks.ts:99` | ✅ Killed — 3 |
| G3 | band fill `zOrder` `'behind'` → `'ahead'` | `example/bandOverlay.ts:159` | ✅ **Killed** — `test/bandOverlay.spec.ts:125` |
| MZ1 | `paneViews()` rebuilds the view array per call | `src/render/overlayBridge.ts:92` | ✅ Killed — 2 |
| MZ2 | `zOrder()` answers a different layer on a later frame | `src/render/overlayBridge.ts:73` | ✅ Killed — 1 |
| MZ3 | `Z_ORDER` always `'top'` | `src/render/overlayBridge.ts:73` | ✅ Killed — 2 |
| G4a | planted rule withdraws 3 rows, ledger empty | `scripts/build-indicator-manifest.mjs` | ✅ **Killed** — generator exit 1 naming all three |
| G4b | the same three, signed (counter-direction control) | same | ✅ **Accepted** — exit 0, 307 rows |
| G4c | the same three, blank / missing reasons | same | ✅ **Killed** — exit 1 |
| G4d | G4a under `--check` (the CI step) | same | ✅ **Killed** — exit 1 |
| G4e/G4f | the guard's own call site deleted | `scripts/build-indicator-manifest.mjs:345-353` | ❌ **SURVIVED** — see limitation L1 |
| WF-1 | `withdrawalFaults` returns `[]` | `scripts/indicator-proof/manifest-shape.mjs:155` | ✅ Killed — 4 |
| WF-2 | ledger ignored | same | ✅ Killed — 2 |
| WF-3 | blank reason accepted | same | ✅ Killed — 1 |
| WF-4 | a vanished id counted as a withdrawal | same | ✅ Killed — 1 |
| WF-5 | refusal message drops the id list | `manifest-shape.mjs:168` | ✅ Killed — 1 |
| OPT-1 | `Overlay.anchor?` deleted | `src/extension/plugins.ts:36` | ✅ Killed — **24 suites** + `tsc` exit 2 |
| OPT-2 | `Point.color?` deleted | `src/domain/types.ts:41` | ⚠️ Killed — **1 test, and it is the docs-byte gate** `test/gates/docReference.spec.ts`; `tsc -p tsconfig.example.json` still exits **0** |
| OPT-3 | `SourceResolution.colors?` deleted | `src/indicator/resolution.ts:51` | ✅ Killed — 13 suites + `tsc` exit 2 |
| BND-1 | banned vendor import planted in `src/` | `src/indicator/availability.ts:1` | ✅ Killed — 5 boundary clauses |
| BND-2 | `import(<variable>)` planted in `src/` | `src/indicator/availability.ts` | ✅ Killed — 4 clauses, fails **closed** |
| BND-3 | `lightweight-charts-drawing` planted in `src/` | `src/indicator/availability.ts:1` | ✅ Killed — 5 clauses |
| DOMID | `pickStudy`'s `domId` narrowing reverted | `scripts/e2e-demo.mjs:115` | ✅ Killed — e2e `TimeoutError`, exit 1 |
| NAN | reachability probe: a grid whose own times are `NaN`/`Infinity` | `example/studyMarks.ts:99` | ⚠️ **Non-finite marks pass through** — precision note in §1 (G2) |

**Sensor result**: 33 mutations injected · **31 killed** · 1 equivalent · 1 survived (second-order, §6 L1).
Plus 2 counter-direction controls, both behaving as the fix requires.

---

## 5. The three declared deviations — judged

### 1. `pickStudy` applies `SeriesMenu`'s own `domId` narrowing. **Necessary.**

`src/react/SeriesMenu.tsx:73` renders `data-testid={domId(prefix, value)}` where
`domId = (p, v) => \`${p}-${v.replace(/[^a-zA-Z0-9]+/g, '-')}\``. Every category the suite drove until
now was a single word, so the transform was the identity. `t3-psar` sits in **Moving Averages**,
which has a space, and the rendered attribute is therefore
`workspace-catalogue-category-Moving-Averages`. The e2e helper must apply the same transform or the
locator cannot resolve.

I measured the failure mode: reverting `scripts/e2e-demo.mjs:115` to the raw `${category}` makes
`npm run e2e` die with a `TimeoutError` and exit 1. **It fails closed** — a divergence between the
helper's copy of the transform and the production one cannot silently pass; it can only stop the
suite. Not a workaround: the production code narrows, so the probe must narrow.

Residual: the transform is duplicated in a `.mjs` script rather than imported from the `.tsx` module,
which the script cannot import. That is a structural limit of the harness, and the failure direction
is safe.

### 2. `Number.isFinite` removed from `markOf` as subsumed. **Real subsumption; the stated reason is wrong.**

Fully argued in §1 (G2). Behaviour unchanged in every reachable state, strictly stronger for finite
grids, still asserted at `test/studyMarks.spec.ts:161`, and the replacement rule is what makes that
case red. The docblock's justification — that a `Set` of bar times cannot hold `NaN` — is a claim
about the caller, not about `Set`; `Set.has(NaN)` is `true` under SameValueZero, which I measured.
Lesson recorded. Not a defect.

### 3. `validate_tasks.py` emits 3 warnings. **All three are correctly justified. Acceptable.**

| Warning | Judgement |
| --- | --- |
| T19: `Where` names `example/studyMarks.ts` **and** `test/studyMarks.spec.ts` | The validator's granularity smell is calibrated for multiple *implementation* files. Here the second file is the first one's test, and the task's whole point is that the module had none. Splitting would produce a task that writes a failing test and a task that makes it pass — the opposite of one atomic commit. |
| T22: `Tests: none` | The Test Coverage Matrix at `tasks.md:28` prescribes `none` for `Documentation & decision log`. T22 corrects a narrative sentence in `spec.md` only. |
| T23: `Tests: none` | Same row, same reason. T23 is the LINES-03 rewording, `spec.md` only. |

Both `Tests: none` tasks nevertheless carry `Gate: quick` and ran `npm test`.

---

## 6. Spec-anchored acceptance criteria

Only the rows that moved this pass are re-argued; the remaining rows were verified in the first pass
over `0480c76..b2c0082`, are unchanged by an empty `src/` diff, and their evidence citations still
resolve.

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| **FILL-03** fill beneath the lines it spans | the fill's own z-order is `behind` | `test/bandOverlay.spec.ts:125` — `expect(new BandFillOverlay('anchor').zOrder).toBe('behind')`; sensor G3 flips it to `'ahead'` and the suite goes red | ✅ **PASS** (was ❌) |
| **MARK-01** markers placed on the bars they name | marks on screen, on the study's own series | Canvas: `scripts/e2e-demo.mjs:1454` `up > 0 && down > 0` on hues **exclusive to the marker channel** — G1a takes both to **0**, G1b leaves both unmoved. Unit: `test/studyMarks.spec.ts:101,126,144,184,220,228,290` — shape, position, colour, window, series key and the exact port shape, each with the neighbour that is kept | ✅ **PASS** (was ❌) |
| **MARK-02** no marker door ⇒ lines still draw, no marks offered | draw, do not fail | `test/studyMarks.spec.ts:235` `expect([...channel.map(...).keys()]).toEqual([])` when every mark is refused; `:257` one study's emptiness leaves the other keyed; `test/chartSurface.spec.tsx:744-746` unchanged | ✅ PASS (strengthened) |
| **PROOF-01** a dropped channel fails the proof, naming both | indicator + channel named | unchanged from the first pass, **plus** the withdrawal ratchet: `test/manifestChannels.spec.ts:259` `toEqual([{id:'bop',measured:'planted rule'},{id:'mass-index',…}])`, control at `:268` `toEqual([])`, one-at-a-time at `:272`, blank reason at `:280`, vanished-id separation at `:289`, message at `:293`; sensors G4a/G4c/G4d red, G4b green | ✅ PASS (strengthened) |
| **LINES-03** lines on screen = live plots | *equality* on the bitmap (clause 3); *inequality* at catalogue scale (clause 3a) | `spec.md:95` now words the equality **and names where it is measured**: e2e `scripts/e2e-demo.mjs` five hues, each 0 before the pick — re-measured independently in §2. `spec.md:96` words 3a as an explicit inequality with the proof's own number: `lines.every-live-plot-has-a-slot-in-the-declared-resource` → **949 live of 1026 declared, 77 dead across 23 rows**, planted control `auto-support: 40 live against a declared 20` | ✅ **PASS** — the spec-precision gap is **closed by narrowing the wording**, which was one of the two options the first pass offered |
| **FILL-05** bounds unresolvable ⇒ not offered | the indicator is withheld | unchanged: half asserted at `test/bandOverlay.spec.ts:110-111`; the non-offering half has no producer — **360 of 360 bounds resolve** | ⚠️ **PARTIAL — declared and honest.** Not re-judged this pass; the first pass judged it and it does not block |
| FILL-01/02/04/06, LINES-01/02/04, POINT-01/02/03, BAR-01/02, REST-01, PROOF-02/02a/03/04 | — | unchanged; `src/` diff empty; all first-pass citations still resolve | ✅ PASS |

**Status**: **22 of 23 rows PASS · 0 gaps · 1 PARTIAL (FILL-05, declared) · 0 unflagged
spec-precision gaps.**

### Edge cases — all five now carry evidence

`spec.md:199-205` now records where each one is asserted and what discriminates it. I verified the
table rather than reading it.

| Edge case (`spec.md:192-196`) | Evidence | Sensor | Result |
| --- | --- | --- | --- |
| a non-finite bound interrupts the fill | `test/bandOverlay.spec.ts:123`, control at `:133` | first pass M2 kills 2 | ✅ |
| the lane grows rather than the study being cut | `test/hostSlots.spec.ts:125,131-152` (`overPrice: 56, ownPane: 14`) | first pass M9 → e2e 93/96 | ✅ |
| two overlays tying on z-order keep their order across redraws | `test/overlayBridge.spec.ts:172-208` — identity at `:193`, the tie asserted real at `:203`, three frames at `:205`, `'ahead'` as the positive control | **MZ1 kills 2, MZ2 kills 1, MZ3 kills 2** | ✅ **new** |
| a marker outside the loaded window is dropped without affecting the rest | `test/studyMarks.spec.ts:184` `toEqual([10,20,30])` for marks at `[10,15,20,99,30]`; positive control at `:200` `toEqual([10,15,20,99,30])` against a window that holds all five | **G2-R2 kills 3** | ✅ **new, and newly implemented** |
| entry stays below `PROVISIONAL_ENTRY_LIMIT` | `test/gates/sizeBudget.spec.ts:557` `expect(BUDGET.entry.limit).toBeLessThan(PROVISIONAL_ENTRY_LIMIT)` | measured 104853 < 104994 | ✅ |

**On the z-order case, one half is delegated and the spec says so** (`spec.md:207-212`). The base
library sorts pane views with `Array.prototype.sort`, which the language specification requires to be
stable; the test models that rather than re-implementing it. What this repository owns is asserted
and discriminates: `paneViews()` returning the same objects (MZ1) and a `zOrder()` that answers the
same layer on every call (MZ2). I judge the delegation honest and correctly disclosed — a test that
only re-ran the modelled sort would have been tautological, and MZ1/MZ2 prove it is not.

---

## 7. Previous-phase invariants — re-derived, not trusted

| Invariant | Measurement |
| --- | --- |
| `PROVISIONAL_ENTRY_LIMIT` never raised in this range | `test/gates/sizeBudget.spec.ts:48` = **104994**. `git diff b2c0082..a57dbb3 -- test/gates/sizeBudget.spec.ts` is **empty** — the file is untouched. `git log -G"PROVISIONAL_ENTRY_LIMIT" b2c0082..a57dbb3` finds two commits and both touch `.specs/` only. ✅ |
| Entry below the ceiling | `size-gate` measured **104853 / 104853**, `ratchet: down-only`, zero slack. `size-budget.json` untouched in the range. ✅ |
| No suite deleted | `git diff --diff-filter=D` over `test/ scripts/ conformance/ example/ src/` is **empty**. ✅ |
| No `.skip` / `.only` added | grep over the range's added lines finds none. ✅ |
| Test count never decreased | 1449 → **1478** (+29), 119 → **120** suites. ✅ |
| `dependencies` absent, exactly two peers | `package.json` has **no `dependencies` key**; `peerDependencies` = `lightweight-charts >=5.2.0 <6`, `react >=18.0.0 <20`, both `optional: false`. ✅ |
| Boundary gate red for the banned vendor names | **BND-1**, **BND-3** — 5 clauses each, naming the file. ✅ |
| Boundary gate red for `import(<variable>)` | **BND-2** — 4 clauses, reported as `<unreadable module reference>`; the guard fails **closed**. ✅ |
| `Overlay.anchor?` kills a test if deleted | **OPT-1** — 24 suites + `tsc` exit 2. ✅ |
| `Point.color?` kills a test if deleted | **OPT-2** — **1 test, and it is the docs-byte gate**; `tsc -p tsconfig.example.json --noEmit` exits **0**. ⚠️ Killed, weakly — carried unchanged from the first pass. |
| `SourceResolution.colors?` kills a test if deleted | **OPT-3** — 13 suites + `tsc` exit 2. ✅ |
| `src/` untouched by this phase's second pass | `git diff b2c0082..a57dbb3 -- src/` is **empty**. ✅ |

---

## 8. The 320 → 310 question — registered, not decided

The owner's question is recorded and nobody settled it in code. Verified against the artefacts:

- `example/indicators/withdrawals.json` carries an `openQuestion` field naming **all ten** rows —
  `madrid-trend-squeeze`, `linear-regression-candles`, `market-shift-levels`, `matrix-series`,
  `modified-heikin-ashi`, `super-supertrend`, `banker-fund-flow` (`plotCandles`);
  `ml-adaptive-supertrend`, `ml-rsi`, `supertrend-ai-clustering` (`tables`) — and states the two
  options: declare them with a written reason each, or wire `plotCandles` and `tables` and restore
  320.
- `withdrawals.withdrawals` is **`[]`**. None of the ten is declared. Writing them in would settle
  the question by default, which the file's own text says it exists to prevent.
- None of the ten appears in `example/indicators/manifest.json`; the catalogue is **310**.

**This is an owner decision and it is still open.** It must appear in the PR body.

---

## 9. Code quality

| Principle | Status |
| --- | --- |
| No features beyond what was asked | ✅ — 7 commits, 4 of them tests or ledgers, 2 documentation, 1 the ratchet. 0 B in `src/`. |
| No abstractions for single-use code | ✅ — `withdrawalFaults`/`withdrawalRefusal` have two callers each (generator + suite), which is why neither tests a copy |
| Only touched files required for the task | ✅ — no undeclared file outside a task's `Where` this pass |
| Didn't "improve" unrelated code | ✅ |
| Matches existing patterns | ✅ — the ledger copies `renames.json` and `value-changes.json` verbatim in doctrine, the z-order assertion copies `test/densityField.spec.ts:60`, the positive-control style is the house one throughout |
| Would a senior engineer approve? | ✅ — behaviour and evidence now agree |
| Tests map to ACs and are non-shallow | ✅ — every new case names its clause; the `marks` scene now satisfies the repo's own matrix line *"a call that was made is not a thing that was drawn"* on a hue only the marker channel writes |
| Spec-anchored outcome check | ✅ — 22/23, 0 unflagged gaps |
| Every test maps to a spec requirement | ✅ — no unclaimed tests in the diff surface |
| Documented guidelines followed | ✅ `CONTRIBUTING.md`, `jest.config.js`, the Test Coverage Matrix at `tasks.md:20-28` |

---

## 10. What is true, and what is limited

Written for the owner to read on return.

### True, and I measured every line of it myself

- **Ichimoku draws FIVE lines and a TWO-COLOURED Kumo.** Five separately coloured curves, each hue
  zero before the pick, each hue the host's palette entry for its own plot position; the shaded band
  is green above and red below, bounded by `plot3`/`plot4`, with the curves over the shading. Counted
  on a segmentation mask I rendered and looked at, not inferred from the suite.
- **The marker sensor now measures the marker channel and nothing else.** Delete the plugin and both
  hues read exactly **0**. Delete the neighbouring point-colour channel and the scene does not move.
  Both directions run.
- **`example/studyMarks.ts` has 21 cases and every rule in it discriminates alone.** The mutation
  that survived last time now kills 9.
- **The fill's z-order is pinned at the fill**, matching every sibling overlay in the repository.
- **The catalogue can no longer shrink without a signature.** A rule that withdraws an offered row
  makes the generator refuse to write — in `--check` mode too, which is the CI step — until the loss
  is signed with a real reason in an append-only ledger. A blank reason is not a signature.
- **The z-order tie and the out-of-window marker, the two edge cases with no evidence, now have
  some** — and the second one now has an *implementation*, which it did not before.
- **Nothing regressed.** 1449 → 1478 tests, no suite deleted, no skip added,
  `PROVISIONAL_ENTRY_LIMIT` untouched, entry still 104853/104853, `dependencies` still absent, exactly
  two peers, `src/` byte-identical to `b2c0082`.

### Limited, and you will meet these

**L1 — a ledger guard is not itself guarded.** Deleting the withdrawal guard's own call site
(`scripts/build-indicator-manifest.mjs:345-353`) leaves `npm test` 1478/1478, `npm run proof` 33/33
and `--check` OK. **This is not new**: I ran the same mutation on the pre-existing vanished-id
refusal and measured exactly the same three greens. Every ledger guard in this repository is a rule
that lives inside a build script, and no gate asserts that the script calls it. The mitigation is
real but partial: shrinking the catalogue takes **two** edits in the same file, both in the diff, and
before the artefact is rewritten `--check` refuses on STALE. Closing it would mean a test that runs
the generator against a fixture registry — a genuinely larger piece of work than this phase, and it
would apply to all three ledgers at once. **Ranked as a limitation, not a gap.**

**L2 — `Point.color?` is pinned only by the derived-docs byte gate.** Deleting it turns exactly one
test red and it is `test/gates/docReference.spec.ts`; `tsc -p tsconfig.example.json --noEmit` still
exits 0, because the behaviour tests build points through `as unknown as Point`. Carried unchanged
from the first pass.

**L3 — `Number.isFinite`'s removal rests on an unasserted precondition.** Membership subsumes
finiteness only for a grid whose own times are finite; `Set.has(NaN)` is `true`. Measured: against a
`NaN`-timed grid, non-finite marks pass through. Unreachable in this demo and 0 B in the package.

**L4 — FILL-05 stays PARTIAL, with 360/360 beside it.** Its refusal half has no producer anywhere in
the catalogue. Judged honest by the first pass and not re-opened here.

**L5 — the alpha correction and the per-bar fill colours remain unit-only claims.** No canvas control
exists for either; a canvas divides premultiplied alpha back out, so `getImageData` cannot see the
alpha defect at all.

**L6 — the catalogue is 310, not 320, and that is still an open owner decision.** See §8.

### Numeric verification seal — unchanged in method, moved in count

**This phase was about RENDERING. It re-derived no arithmetic.** The tier definitions are untouched;
the counts follow the catalogue, and they moved only because T15 withdrew ten rows in the *previous*
pass — this pass changed neither.

| | `0480c76` (320 rows) | `a57dbb3` (310 rows) |
| --- | --- | --- |
| **pinned** — hand-computed vectors | 6 | **6** |
| **constrained** — asserted bounds | 111 | **108** |
| **structural** — draws, deterministic, pure, aligned, on its declared scale | 203 | **196** |

Read off `example/indicators/manifest.json`'s own `verification` field, row by row, and it sums to
310. `seal.the-manifest-transcribes-it-rather-than-computing-it` re-derives all three every proof run
and compares them against the committed totals. `oracle.counter-implementation` still measures the
vendor against this repository's own implementations at maxAbs ≤ 2.84e-13 on six series — **unchanged
by this phase, and not re-verified by it.** The pinned tier is unchanged at 6.

Do not write "the seal did not change" in the PR. Write: *the tier definitions did not change; the
counts fell by the ten withdrawn rows.*

---

## 11. Requirement traceability update

| Requirement | Previous | New |
| --- | --- | --- |
| **FILL-03** | ❌ Needs Fix | ✅ **Verified** — pinned at the object, `test/bandOverlay.spec.ts:125`, G3 red |
| **MARK-01** | ❌ Needs Fix | ✅ **Verified** — canvas evidence discriminating in both directions, plus 21 unit cases |
| **MARK-02** | ✅ Verified | ✅ Verified (strengthened by `test/studyMarks.spec.ts:235-257`) |
| **LINES-03** | ⚠️ spec-precision gap | ✅ **Verified** — equality scoped to the bitmap, inequality written as clause 3a with its own control |
| **PROOF-01** | ✅ Verified | ✅ Verified (strengthened by the withdrawal ratchet) |
| FILL-05 | ⚠️ Partial | ⚠️ **Partial** — unchanged, declared, does not block |
| FILL-01, FILL-02, FILL-04, FILL-06 | ✅ Verified | ✅ Verified |
| LINES-01, LINES-02, LINES-04 | ✅ Verified | ✅ Verified |
| POINT-01, POINT-02, POINT-03 | ✅ Verified | ✅ Verified |
| BAR-01, BAR-02, REST-01 | ✅ Verified | ✅ Verified |
| PROOF-02, PROOF-03, PROOF-04 | ✅ Verified | ✅ Verified |

---

## Summary

**Overall**: ✅ **Ready.** The PR can be marked ready, with §8's open question and §10's six
limitations written into the body.

**Spec-anchored check**: 22/23 ACs match the spec-defined outcome · 0 gaps · 1 PARTIAL (declared) ·
0 unflagged spec-precision gaps
**Sensor**: 33 injected, **31 killed**, 1 equivalent, 1 survived (second-order, pre-existing in kind)
· 2 counter-direction controls confirmed
**Gate**: `npm test` 1478/1478 · `npm run e2e` 96/96 · `npm run proof` 33/33 ·
`size-gate` 104853/104853 · `verify-package-paths` OK · `build-indicator-manifest --check` OK (310
offered) — every one exit 0, all re-run on the real tree after the sensor, porcelain byte-identical to
the pre-sensor baseline, HEAD unchanged at `a57dbb3`.

**Next steps**: open the PR. Put in the body: (1) the 320 → 310 question, verbatim from
`withdrawals.json`'s `openQuestion`; (2) FILL-05 stays Partial with 360/360 beside it; (3) the seal
sentence from §10; (4) limitation L1, so the next person who tightens a generator rule knows the
guard is a rule and not a test.
