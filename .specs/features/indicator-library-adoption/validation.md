# Indicator library adoption — Validation

**Date**: 2026-08-21
**Spec**: `.specs/features/indicator-library-adoption/spec.md`
**Diff range**: `be75dd6..b056321` (18 commits, branch `feat/indicator-library-adoption`)
**Verifier**: independent sub-agent (author ≠ verifier). Coverage re-derived from the spec and the
diff, evidence-or-zero. Nothing in the working tree was modified; all mutations ran in a temporary
`git worktree` that was removed, with `git status --porcelain` confirmed identical to the pre-sensor
baseline (empty) afterwards.

**Result**: ❌ FAIL

**Verdict**: ❌ FAIL — 36/39 requirements carry evidence whose asserted value matches the
spec-defined outcome; **1 requirement has no evidence at all (LANE-02)**, **1 is covered on only one
of its two conjuncts (IDENT-02)**, and **1 spec-precision gap is material to the owner's stated
acceptance condition (ADAPT-07/09 vs. numeric correctness)**. Every gate is green and every mutation
was killed; the failure is a coverage failure, not a defect failure.

---

## Task Completion

| Task | Status | Notes |
| --- | --- | --- |
| T1 — import guard fails closed | ✅ Done | `test/boundary.spec.ts:667` |
| T2 — comment budget / JSX density | ✅ Done | 0 B moved; `ChartWorkspace.tsx` at 348/350 |
| T3 — one `outsideProvider` sentence | ✅ Done | `src/react/chrome/labels.ts:178`; `test/outsideProvider.spec.tsx:91,101` |
| T4 — one rail-tab style factory | ✅ Done | `src/react/SeriesMenu.tsx:90`; `test/seriesMenuRailStyle.spec.tsx` |
| T5 — `studyIdentity` | ✅ Done | `src/react/SeriesMenu.tsx:45` |
| T6 — duplicate identity refused | ✅ Done | `src/react/workspace/ChartWorkspace.tsx:295-297` |
| T7 — the opaque channel | ✅ Done | `src/tabs/setup.ts:16,37,55,80,178` |
| T8 — editing redraws | ✅ Done | `src/react/workspace/ChartWorkspace.tsx:120,204-206` |
| T9 — publish the door | ✅ Done | `src/index.ts:70,334,358` |
| T10 — bundler stops inlining | ✅ Done | `scripts/boot-chunk.mjs` |
| T11 — indicator proof | ✅ Done | `scripts/indicator-proof.mjs`, 27/27 |
| T12 — manifest + fingerprints | ✅ Done | `scripts/build-indicator-manifest.mjs --check` exit 0 |
| T13 — the adapter | ✅ Done | `example/indicators.ts:144-154` |
| T14 — the host form | ✅ Done | `example/studyForm.tsx`, `test/studyForm.spec.tsx` |
| T15 — catalogue before the library | ✅ Done | `example/App.tsx:54-97`, `example/main.tsx` |
| T16 — e2e proves the edit | ✅ Done | `scripts/e2e-demo.mjs:1112,1117,1127` |
| T17 — the reversal written down | ⚠️ Partial | AD-019 recorded (`.specs/STATE.md:19`); LANE-02 closed without evidence (see gaps) |

---

## Spec-Anchored Acceptance Criteria

### P1 — The boundary gate sees a dynamic import

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| GATE-01 `await import('lightweight-charts-indicators')` under `src/` reported | that specifier listed as a violation | `test/boundary.spec.ts:561` — `expect(hits([synthetic('drawing/x.ts', "…await import('lightweight-charts-indicators')…")])).toEqual(['drawing/x.ts -> lightweight-charts-indicators'])` | ✅ PASS |
| GATE-02 dynamic import of a relative path not reported | no violation for it | `test/boundary.spec.ts:563` — `expect(hits([…"await import('./neighbour')"…])).toEqual([])` | ✅ PASS |
| GATE-03 both directions asserted synthetically | the clause discriminates rather than passing over an empty set | `test/boundary.spec.ts:561,563` and `:679,689` | ✅ PASS |
| GATE-04 dynamic bare specifier judged by the same allow-list | same verdict as a static import | `test/boundary.spec.ts:679` — `expect(measuredImpurity(…"await import('react')"…)).toBe('runtime')`; `:682` — `expect(layerViolations(…)).toEqual(['FAIL tabs/x.ts :: import outside the layer rule -> react'])` | ✅ PASS |
| GATE-05 non-literal reference is itself a violation | reported in its own right | `test/boundary.spec.ts:707` — `expect(importSpecifiers(synthetic('tabs/x.ts', evasion))).toEqual([UNREADABLE_SPECIFIER])` over template / identifier / concatenation | ✅ PASS |
| GATE-06 same terms for `require(...)` | identical treatment | `test/boundary.spec.ts:703-705` (the same loop carries `require(name)`, `require(\`${base}/…\`)`, `require('a'+'b')`); reverse control at `:719` | ✅ PASS |

### P1 — A study is identified by something that is not on screen

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| IDENT-01 entry with an id → that id persisted | the id, not the label, is the stored identity | `test/chartWorkspace.spec.tsx:1168` — `expect(screen.getByTestId('workspace-active-study.moving-average')).toBeInTheDocument()` with `id`/`label`/`provider.id` three different strings | ✅ PASS |
| IDENT-02 label changes, id does not → study stays selected **and keeps its parameter values** | both conjuncts | `test/chartWorkspace.spec.tsx:1184` — `expect(catalogueChip()).toHaveAttribute('aria-pressed','true')`; `:1185` — active study still listed. **No assertion anywhere reads `studySettings` across a label change** | ⚠️ **GAP (conjunction)** |
| IDENT-03 no id → fall back to the label | the pre-id catalogue still resolves and lights | `test/chartWorkspace.spec.tsx:1201` — `expect(screen.getByTestId('workspace-active-Alpha')).toBeInTheDocument()` | ✅ PASS |
| IDENT-04 two entries, one identity → notice, not a silent drop | notice fires, list does not grow | `test/chartWorkspace.spec.tsx:1260` — `expect(screen.getByRole('alert')).toHaveTextContent('study.moving-average')`; `:1261` — `expect(activeStudies()).toHaveLength(1)`; negative control at `:1264`; host override at `:1296` | ✅ PASS |

### P1 — A study's parameters survive the tab

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| PARAM-01 serialise → parse restores each study's values by identity | deep-equal values, real codec | `test/studySettings.spec.ts:229` — `expect(restored.tabs[0].setup.studySettings).toEqual({ma:{period:20,source:'close'},rsi:{period:14}})` | ✅ PASS |
| PARAM-02 value change leaves identity, lane, position | list and panes unchanged | `test/studySettings.spec.ts:242-245` — `expect(after.indicators).toEqual(['ma','rsi'])`, `expect(after.panes).toEqual(before.panes)` | ✅ PASS |
| PARAM-03 package never reads/validates/defaults a value | the same value handed back | `test/studySettings.spec.ts:129-132` — `expect(held.ma).toBe(object)` (identity, not equality), plus string / null / number | ✅ PASS |
| PARAM-04 no OWN property → no value, never prototype-inherited | `undefined` | `test/studySettings.spec.ts:96` — `expect(coerceWorkspaceSetup({indicators:['ma'],studySettings:Object.create({ma:{period:9}})},POLICY).studySettings).toBeUndefined()`; positive control `:108` | ✅ PASS |
| PARAM-05 host coercion rejects a value → study loads with no values, payload survives | study still listed, rest intact | `test/studySettings.spec.ts:192-194` — `expect(setup.indicators).toEqual(['ma','rsi'])`, `expect(setup.studySettings).toEqual({rsi:{period:14}})`, `expect(setup.timeframe).toBe('4h')` | ✅ PASS |
| PARAM-06 values for a departed study dropped | dropped | `test/studySettings.spec.ts:155` — `toEqual({ma:{period:20}})`; `:157` — `not.toHaveProperty('gone')` | ✅ PASS |
| PARAM-07 pre-feature payload loads, no version bump, empty values | same version, `studySettings` undefined | `test/studySettings.spec.ts:273-275` — `expect(restored.tabs[0].id).toBe('tab-1')`, `expect(...studySettings).toBeUndefined()`; wire shape at `:282,289` | ✅ PASS |
| PARAM-08 duplicated tab carries the same values | copy equals original | `test/studySettings.spec.ts:259` — `expect(duplicated.tabs[1].setup.studySettings).toEqual({ma:{period:20}})` | ✅ PASS |

### P1 — The host draws the form and the library draws the study

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| ADAPT-01 non-finite → point with no `value` | a declared gap, never a zero | `scripts/indicator-proof.mjs:781` `adapter.a-non-finite-value-becomes-a-declared-gap` — NaN / null / Infinity / string / missing row all yield a point with no value | ✅ PASS |
| ADAPT-02 plot key from `plotConfig` | never assume `plot0` | `scripts/indicator-proof.mjs:819` — an entry whose only promised plot is `alpha` draws `alpha` and never the sibling `plot0`; all 320 draw exactly the manifest's keys, 42 of them non-`plotN` | ✅ PASS |
| ADAPT-03 a throw costs one study | every other study still drawn, that one unavailable | `test/indicatorResolution.spec.ts:111` — `expect(resolution.views[0]).toMatchObject({availability:'empty',drawn:0})`, `:145` neighbour `{drawn:1}`, `:149` third `{drawn:1,availability:'ok'}`; and `scripts/indicator-proof.mjs:850` (1 attempt, not one per plot) | ✅ PASS |
| ADAPT-04 an input with no effect is omitted from the form | omitted, or in the ledger with a reason | `scripts/indicator-proof.mjs:469` (`offers-a-known-inert-input`), `:503` (`every-held-back-control-has-a-reason` — 46 inert + 2 colour + 120 channel-only); `scripts/e2e-demo.mjs:1091` — 5 controls drawn = 5 promised, same set | ✅ PASS |
| ADAPT-05 bars ascending by time | vendor sees ascending; the caller's array untouched | `scripts/indicator-proof.mjs:760` — 8 bars handed newest-first arrive oldest-first, points come back on the vendor's order; `example/indicators.ts:119-126` | ✅ PASS |
| ADAPT-06 value change redraws without unmounting | `resolve` re-called carrying the value; no remount | `test/chartWorkspace.spec.tsx:1692` — `expect(calls.length).toBeGreaterThan(afterPick)`; `:1693` — `expect(calls[calls.length-1].settings).toEqual({'study.moving-average':{period:50}})`; idle control `:1687`; store round-trip `:1705` | ✅ PASS |
| ADAPT-07 exclude no-plot / untyped-registry / self-contradicting entries | named with their measurement | `scripts/indicator-proof.mjs:633` — 6 exclusions each named (`td-macd`, `double-macd`, `transient-zones`, `bitcoin-log-curves`, `ma-shift`, `tillson-t3`); `:469` 320/320 offered draw | ✅ PASS (see spec-precision gap 3) |
| ADAPT-08 unbounded costly input bounded or not offered | no offered control exceeds one second | `scripts/indicator-proof.mjs:545` — 790 numeric controls at declared max (or 100000 where none); slowest `supertrend-ai-clustering.maxFactor` at 100 = 58 ms < 1000 ms | ✅ PASS |
| ADAPT-09 manifest carries tier + settle window per indicator | both present | `scripts/indicator-proof.mjs:560` (pinned 6 · constrained 111 · structural 203), `:569` (manifest transcribes rather than computes); manifest row e.g. `wma` → `"verification":"structural","confirmsWithinBars":0` | ✅ PASS |
| ADAPT-10 re-derivation compares VALUES | a changed number turns it red | `scripts/indicator-proof.mjs:621` — 320 digests of computed values re-derived identical, settle windows included. Mutation-confirmed (M8) | ✅ PASS |

### P2 — The example demonstrates the library, and the reversal is recorded

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| DEMO-01 curated catalogue, no-plot and fill-dependent entries excluded | the demo offers the curated set | `scripts/e2e-demo.mjs:959` — 78 third-party studies listed under "Oscillators" with nothing over 1,000,000 B on the wire; exclusions at `scripts/indicator-proof.mjs:633` | ✅ PASS |
| DEMO-02 editing an input redraws without the study leaving the list | drawn value changes, count holds | `scripts/e2e-demo.mjs:1112` — legend `31.04,44.35 → 57.98,65.05` on length 14→50; `:1117` — 1 chip before, 1 after; `:1127` reversible | ✅ PASS |
| DEMO-03 decision log supersedes AD-006's example clause | new entry naming the evidence | `.specs/STATE.md:19` (AD-019), `.specs/STATE.md:12` (AD-006 example clause SUPERSEDED, `src/` clause STANDS) | ✅ PASS |
| DEMO-04 exactly two peers, no runtime dependency | 0 dependencies, 2 peers | `scripts/e2e-demo.mjs:1213` — `zero runtime dependencies, exactly two peers (lightweight-charts, react)`; `package.json` has no `dependencies` key and `peerDependencies` = `lightweight-charts`, `react` | ✅ PASS |

### P2 — A study that did not fit says so

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| LANE-01 docs state `views.length` is the resolved count and the cut is the difference | that sentence, published | `docs/how-to/inject-catalogue.md:163-166` — "**`views.length` IS the resolved count**, and what was cut is the difference against the list you passed in"; compiled snippet `:171-175` (`docExamples` gate compiles every fence) | ✅ PASS |
| LANE-02 capacity > lane count and the list is filled → host reports the difference via the notice channel | the difference reported | **No evidence.** The example writes `resolutionPolicy({ lanes: STUDY_CAPACITY, plotsPerLane: 3 })` (`example/App.tsx:43`) so the antecedent can never hold — and that equality **predates this feature** (present at `be75dd6`). `ChartWorkspaceProps` (`src/react/workspace/ChartWorkspace.tsx:126-141`) exposes no `onNotice`; `notice.report` is private to `WorkspaceBody` (`:183`), so no host can satisfy the consequent | ❌ **NOT COVERED** |
| LANE-03 the package does not change which studies are cut | truncation unchanged | `test/indicatorResolution.spec.ts:56` — "a duplicate goes, the order stays, and the surplus is cut from the END" (unchanged by this diff); `git diff be75dd6..HEAD -- src/catalogue/` is empty | ✅ PASS |

### P2 — The wiring is documented

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| DOC-01 docs say the bytes and words are the host's, and the package stores values without interpreting them | both sentences | `docs/how-to/inject-catalogue.md:185-186` — "**The bytes and the words are yours.**"; `:194-197` — "**Values it stores and never reads.** … `StudySettings`, which is `unknown` … the compiler refuses the package a property read" | ✅ PASS |
| DOC-02 every new published symbol appears in the reference byte-for-byte | present, generated | `docs/reference/react/SeriesMenu.md:44` (`studyIdentity`), `docs/reference/tabs/setup.md:27` (`StudySettings`), `docs/reference/react/workspace/setupContext.md:17-18` (both hooks); `test/gates/docReference.spec.ts` green | ✅ PASS |

### P3 — The consuming application

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| APP-01 application declares both packages in its own manifest | its manifest | Out of repository — correctly Pending | ⏭️ N/A |
| APP-02 library loaded behind the first study, not at boot | deferred | `scripts/e2e-demo.mjs:969` — chunk arrives with the first study and not before (`chunk-*.js` 2,131,429 B); `example/indicators.ts:378` — `import('lightweight-charts-indicators')` behind `loadIndicatorLibrary()`. **This proves the EXAMPLE, not the application**; APP-02 is scoped to "the application", which is out of repository | ⚠️ Spec-precision gap (scope) |

**Status**: ❌ 1 criterion not covered (LANE-02) · ⚠️ 1 conjunction gap (IDENT-02) · ⚠️ 2 spec-precision gaps (ADAPT-07/09 vs. numeric correctness, APP-02 scope) · 35 fully covered.

---

## Discrimination Sensor

Isolation: `git worktree add <scratch> HEAD --detach`, `node_modules` symlinked (and, for the vendor
experiment, `lightweight-charts-indicators` copied in so the real install was never touched). Scratch
removed with `git worktree remove --force`; `git status --porcelain` on the real tree re-read and
byte-identical to the pre-sensor baseline (empty). `git stash` was never used.

Worktree baseline: 3 pre-existing failures caused by the absent `dist/` build artefact
(`sizeBudget` old-format probes, `conformance` subpath). Identical in every run, so they do not
affect any kill determination.

| # | Mutation | File:line | Killed? | Killed by |
| --- | --- | --- | --- | --- |
| 1 | `Object.prototype.hasOwnProperty.call(source, id)` → `id in source` | `src/tabs/setup.ts:87` | ✅ Killed | `test/studySettings.spec.ts:96` — `Received: {"ma": {"period": 9}}` (the package fabricating a value the host never wrote) |
| 2 | `setup.studySettings` deleted from the memo dependency list | `src/react/workspace/ChartWorkspace.tsx:206` | ✅ Killed | `test/chartWorkspace.spec.tsx:1692` — `expect(calls.length).toBeGreaterThan(4)` received `4` |
| 3 | third argument deleted from the `resolve` call (dependency kept) | `src/react/workspace/ChartWorkspace.tsx:205` | ✅ Killed | `test/chartWorkspace.spec.tsx:1693` — `settings` `undefined` vs `{period:50}`. **A different clause from #2**, as the design claimed |
| 4 | `studyIdentity` returns `entry.label` always | `src/react/SeriesMenu.tsx:45` | ✅ Killed | 8 tests (net of baseline): `chartWorkspace.spec.tsx:1156,1171`, `:1246,1278`, `studyForm.spec.tsx:302`, `chrome.spec.tsx` SeriesMenu |
| 5 | `SeriesMenu` pressed state compares `provider.id` again (the live 0.2.1 defect) | `src/react/SeriesMenu.tsx:330` | ✅ Killed | 4 tests: `chartWorkspace.spec.tsx:1156,1171,1188` + `:1647` |
| 6 | adapter takes `time` from the vendor point instead of `bars[index].time` | `example/indicators.ts:148-153` | ✅ Killed | `scripts/indicator-proof.mjs:727` — "the shifted-point control failed: 1023 points off their bar" |
| 7 | synthetic `await import('lightweight-charts-indicators')` added under `src/` | `src/domain/futureTail.ts` (appended) | ✅ Killed | `test/boundary.spec.ts` — 4 clauses red, including the by-name ban |
| 8 | synthetic `await import(sensorName)` (non-literal) under `src/` | `src/domain/futureTail.ts` (appended) | ✅ Killed | `test/boundary.spec.ts` — 3 clauses red: `domain/futureTail.ts -> <unreadable module reference>`. **This is what the literal-only predicate let through** |
| 9 | inert ledger: entry `bb.offset` removed | `scripts/indicator-proof/INERT_INPUTS.json:2` | ✅ Killed | `scripts/indicator-proof.mjs:503` — "1 without one: bb.offset (int) is inert and absent from the ledger" |
| 10 | inert ledger: false entry `rsi.length` added | `scripts/indicator-proof/INERT_INPUTS.json` (appended) | ✅ Killed | `scripts/indicator-proof.mjs:291` and `:469` — both directions, exact set confirmed |
| 11 | fingerprint digest for `sma` altered by one character | `example/indicators/fingerprints.json` | ✅ Killed | `scripts/indicator-proof.mjs:621` and `build-indicator-manifest.mjs --check` → `STALE` |
| 12 | optional member `SeriesCatalogueEntry.id?` deleted | `src/react/SeriesMenu.tsx:24` | ✅ Killed | 20 tests net (compile + behaviour), 10 suites |
| 13 | optional member `WorkspaceSetup.studySettings?` deleted | `src/tabs/setup.ts:37` | ✅ Killed | 21 tests net, 9 suites |
| 14 | optional member `WorkspaceSetupPolicy.coerceStudySettings?` deleted | `src/tabs/setup.ts:55-58` | ✅ Killed | 20 tests net, 8 suites |
| 15 | optional member `WorkspaceNoticeLabels.duplicateStudy?` deleted | `src/react/chrome/labels.ts:29` | ✅ Killed | 20 tests net, 35 suites |
| 16 | third parameter deleted from the `resolve` **type** | `src/react/workspace/ChartWorkspace.tsx:120` | ✅ Killed | 20 tests net, 5 suites |
| 17 | `example/App.tsx` builds its section `Body` inline per render | `example/App.tsx:117` | ✅ Killed | `scripts/e2e-demo.mjs:913` `params.no-section-churn` **and** `:1146` `params.no-churn-across-the-edit` — both red. **The clause that did not discriminate at T14 discriminates now** |
| 18 | vendor `wma` replaced with inverted weights (2.1% error), manifest + fingerprints regenerated as a vendor would ship them | `node_modules/lightweight-charts-indicators/dist/index.{cjs,mjs}` (isolated copy) | ❌ **SURVIVED** | `npm run proof` **27/27 passed**; `build-indicator-manifest.mjs --check` exit 0. Only one line of `fingerprints.json` moved |

**Sensor depth**: P0-full (18 mutations — the feature touches persistence, a public API surface and an
architectural gate).
**Result**: 17/18 killed. Mutation 18 survived by construction, not by accident — see gap 3.

### On the "five optional members" note in the design

The design's risk table lists five new optional members against "this repo's five recorded cases of
one vanishing unnoticed". The fifth is `WorkspaceNoticeLabels.duplicateStudy?`, not a member named
`studyHeld?` — no such symbol exists anywhere in the repository. All five, plus the widened `resolve`
signature, were deleted individually (mutations 12–16 and 3): **every one kills at least one test.**
The recorded failure mode does not reproduce here.

### On `PROVISIONAL_ENTRY_LIMIT`

`git log -p --all -- test/gates/sizeBudget.spec.ts` shows exactly **one** line ever adding or
changing the constant: `+const PROVISIONAL_ENTRY_LIMIT = 104994;`, introduced in `7fcbab0` ("the
library stands on its own"), which predates this feature. It has never been raised. The entry is
pinned at `limit === measured === 104992` on a down-only ratchet
(`test/gates/sizeBudget.spec.ts:474,477,479,480`), leaving 2 B. Every growth in this range is
re-pinned one measured candidate at a time in `size-budget.json`'s entry note.

### On `scripts/boot-chunk.mjs` (created at T10, altered at T15)

The T15 change (`433712b`) replaced "bytes of the entry output" with "the entry plus the transitive
closure of its **static** imports", explicitly not following `dynamic-import` edges. `BOOT_CHUNK_CEILING`
(production 772,285 · development 2,075,681) is unchanged in that diff — context lines, not edits.
Measured production moved 702,078 → 707,648 B under an unchanged ceiling. **The measurement got
strictly stronger; the ceiling did not move.**

---

## Edge Cases

- [x] Library fails to load → workspace mounts with an empty catalogue: `scripts/e2e-demo.mjs:1016`
      (`params.a-failed-catalogue-still-mounts` — chunk refused at the network, no "Oscillators" tab,
      price still reading) and `:1024` (no uncaught exception behind the browser's own report).
- [x] Parameter values declared as a non-object → treated as absent: `test/studySettings.spec.ts:142-145`
      (`'none'`, `7`, `null`, `true`, `['ma']` all → `undefined`).
- [x] Stored identity matching no catalogue entry → kept in the list, draws nothing:
      `test/indicatorResolution.spec.ts:88`.
- [ ] **A value edited while history is still loading** → recompute against whatever bars are present,
      gaps rather than an error: **no direct evidence.** The nearest is
      `test/indicatorResolution.spec.ts:159` ("with no bars, the LIST is still the list — and nothing
      is ASSERTED about it"), which asserts the empty-bars path but not the edit-during-load path.
      ⚠️ Minor coverage gap.
- [x] Entry bundle stays below `PROVISIONAL_ENTRY_LIMIT`: `node scripts/size-gate.mjs` exit 0,
      `104992 / 104992`, `test/gates/sizeBudget.spec.ts:477`.

---

## Gate Check

| Gate | Command | Result |
| --- | --- | --- |
| Quick / Build | `npm test` | **107 suites, 1320 tests, 0 failed, 0 skipped** |
| Full | `npm run e2e` | **71/71 passed**, exit 0 |
| Proof | `npm run proof` | **27/27 passed in 11.7 s**, exit 0 |
| Build | `node scripts/size-gate.mjs` | OK — 16 measurements under budget; entry `104992 / 104992` |
| Build | `node scripts/verify-package-paths.mjs` | OK — `files[]` and `exports` both resolve (7 entries) |
| Catalogue | `node scripts/build-indicator-manifest.mjs --check` | OK — committed artefacts are what the generator produces (320 offered) |

**Test Integrity Check** — measured, not assumed. `be75dd6` in a throwaway worktree:
**103 suites / 1281 tests**. `b056321`: **107 suites / 1320 tests**. Delta **+4 suites / +39 tests**.
No suite deleted, no test count decrease, no `.skip` added. Assertions were strengthened, not
weakened: `noticeWriters` 6 → 7 (`test/chartWorkspace.spec.tsx:366`), labels contract 85 → 86
(`test/workspaceLabels.spec.ts:57`), `composedExports` widened from one name to three with the
equality preserved (`test/chartWorkspace.spec.tsx:1313`).

One gate **exemption** was added: `test/gates/socketParity.spec.ts:86` declares
`WorkspaceSetupProvider.setup.*` blind, with a written reason (the setup is taken whole, never
written field by field at that call site). Justified, but it is a gate surface this feature narrowed.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ `src/` gains two things only: identity and an opaque map. 25,429 insertions, of which >23,000 are generated catalogue/manifest artefacts under `example/` and `scripts/` |
| Surgical changes | ✅ `src/` diff is 9 files, +/−~120 lines net |
| No scope creep | ✅ Band/cloud shapes, colour controls and `SourceResolution.cut` were designed, measured and refused with the measurement written down |
| Matches patterns | ✅ Every new member is optional, matching `guide?`/`hint?`/`selected?`/`anchorAt?` |
| Spec-anchored outcome check | ⚠️ 35/39 exact; LANE-02 zero, IDENT-02 partial, ADAPT-07/09 and APP-02 spec-precision |
| Per-layer Coverage Expectation | ✅ Gates carry synthetic positive controls in both directions; the package seam is 1:1 to ACs through the real codec; React composition mounted through `<ChartWorkspace>` with a real `WorkspaceStore`, never through a hook probe |
| Every test maps to a requirement | ✅ `test/outsideProvider.spec.tsx` and `test/seriesMenuRailStyle.spec.tsx` map to T3/T4, declared "enabling" in `tasks.md` |
| Documented guidelines followed | ✅ `CONTRIBUTING.md` (counts pasted), `jest.config.js`, `.github/workflows/ci.yml` (matrix + separate e2e and proof jobs) |

---

## Fix Plans

### Fix 1 — LANE-02 is closed by removing its antecedent, not by meeting it (Blocker for the claim, Major for the product)

- **Root cause**: the AC reads "WHEN the host's capacity exceeds its lane count … THEN the host SHALL
  report the difference through the notice channel." The example sets `resolutionPolicy({ lanes:
  STUDY_CAPACITY, … })` at `example/App.tsx:43`, so the antecedent is permanently false and the
  conditional is vacuously true. That equality was already in the tree at `be75dd6` — T16 added no
  behaviour for LANE-02, only an e2e assertion of a pre-existing condition. Worse, the consequent is
  **unreachable by any host**: `notice.report` is a private member of `WorkspaceBody`
  (`src/react/workspace/ChartWorkspace.tsx:183`) and `ChartWorkspaceProps` (`:126-141`) publishes no
  `onNotice`. The author records this honestly at `.specs/STATE.md:50-53`.
- **Fix task**: either (a) rewrite LANE-02 to state what was actually decided — "the host SHALL write
  its capacity and its lane count as one symbol so the difference cannot arise" — and pin it with a
  test that fails when the two are written as different numbers; or (b) publish a host-facing notice
  door (`onNotice` on `ChartWorkspaceProps`) and cover the original AC. Do not leave it marked Done
  on a vacuous truth.
- **Priority**: Major.

### Fix 2 — IDENT-02's second conjunct has no assertion (Major)

- **Root cause**: `test/chartWorkspace.spec.tsx:1171-1186` changes the label while holding the id and
  asserts the study stays selected. It never reads `studySettings`. The spec conjoins
  "keep that study selected **and keep its parameter values**". Mechanically the map is keyed by an
  identity that did not move, so the behaviour is almost certainly correct — but nothing pins it, and
  a future change to how the setup is rebuilt on a catalogue change would not turn red.
- **Fix task**: extend that test to write a value through `useWorkspaceSetupWriter` before the
  re-render, then assert `resolve` is still called with `{'study.moving-average': {period: 50}}` after
  the label changes to `'Média móvel'`.
- **Priority**: Major.

### Fix 3 — `npm run proof` does not answer the owner's "correctly calculated" condition for 314 of 320 indicators (Blocker for the acceptance claim)

- **Root cause**: measured, not argued. I planted an inverted-weight `wma` in an isolated copy of
  `lightweight-charts-indicators@0.5.0` — true WMA(9) on the proof's own fixture reads 126.33, the
  planted one reads 123.67, a 2.1% error — regenerated `manifest.json` and `fingerprints.json` the way
  a vendor release would arrive, and ran the gate. **`npm run proof` reports 27/27 passed and
  `build-indicator-manifest.mjs --check` exits 0.** The only artefact that moved was one digest line.
  The wma row carries `"verification":"structural"`, and `scripts/indicator-proof.mjs:560` reports
  **pinned 6 · constrained 111 · structural 203**: only six indicators are pinned against
  hand-computed vectors, and only six series are cross-checked against `example/studies.ts`
  (`:249` — SMA, EMA, RSI, MACD line/signal/histogram).

  This is **not a spec violation** — ADAPT-09 requires only that the tier be *recorded*, and it is,
  honestly. It is a **spec-precision gap between the spec and the owner's stated acceptance
  condition**, which `.github/workflows/ci.yml:70-73` quotes verbatim ("test every indicator … and
  that they are correctly calculated") and presents this job as answering. `npm run proof` proves
  **parameterisation** exhaustively (1021 controls, every offered one demonstrably moves the drawing
  or sits in an exact-set ledger with a reason — mutations 9 and 10 confirm both directions) and
  proves **stability against vendor drift** (mutation 11). It does **not** prove numeric correctness
  for the 203 structural-tier indicators, and the design's own risk table already said so.
- **Fix task**: (a) amend the CI comment and any owner-facing summary to claim what is measured —
  exhaustive parameterisation, drift-pinning, and numeric verification at the tier each indicator
  carries — rather than "correctly calculated"; (b) if uniform numeric verification is wanted, it is a
  separate feature: an independent oracle per family, sized against the 111 constrained + 203
  structural entries.
- **Priority**: Blocker for the acceptance claim; Minor for the code, which is correct as designed.

### Fix 4 — spec traceability bookkeeping is self-contradictory (Minor)

- **Root cause**: `spec.md:309` states "37 mapped to tasks, 2 unmapped" and "ADAPT-04 stays Pending".
  Counting the table: 39 rows, exactly **one** unmapped (`APP-01`), and the **ADAPT-04 row reads
  Done** (`spec.md:288`), contradicting the prose. Separately, `APP-02` is marked Done against T10,
  but the AC is scoped to "the application", which lives outside this repository — what T10 and the
  e2e prove is the *example*.
- **Fix task**: correct the coverage line to "38 mapped, 1 unmapped, 38 Done"; resolve ADAPT-04 to a
  single status; either re-scope APP-02 to the example or move it beside APP-01 as
  out-of-repository.
- **Priority**: Minor.

### Fix 5 — the "edited while history is loading" edge case has no direct test (Minor)

- **Root cause**: listed under Edge Cases in `spec.md`; nothing asserts it. The closest test asserts
  the empty-bars resolution path only.
- **Fix task**: in the mounted `<ChartWorkspace>` test, write a value before `settle()` resolves the
  history and assert the resolution carries gaps rather than throwing.
- **Priority**: Minor.

---

## Requirement Traceability Update

| Requirement | Previous | New |
| --- | --- | --- |
| GATE-01..06 | Done | ✅ Verified |
| IDENT-01, IDENT-03, IDENT-04 | Done | ✅ Verified |
| IDENT-02 | Done | ⚠️ Partially verified — second conjunct uncovered |
| PARAM-01..08 | Done | ✅ Verified |
| ADAPT-01..03, ADAPT-05, ADAPT-06, ADAPT-08, ADAPT-10 | Done | ✅ Verified |
| ADAPT-04 | Done / "Pending" (contradictory) | ✅ Verified — resolve the contradiction in the spec |
| ADAPT-07, ADAPT-09 | Done | ✅ Verified as written — ⚠️ does not carry the owner's correctness claim |
| LANE-01, LANE-03 | Done | ✅ Verified |
| LANE-02 | Done | ❌ Needs Fix — no evidence; antecedent removed, consequent unreachable |
| DEMO-01..04 | Done | ✅ Verified |
| DOC-01, DOC-02 | Done | ✅ Verified |
| APP-01 | Pending | ⏭️ Out of repository |
| APP-02 | Done | ⚠️ Verified for the example, not the application |

---

## Summary

**Overall**: ❌ Not ready to be declared complete — but the distance is small and precisely located.

**Spec-anchored check**: 35/39 fully matched · 1 not covered (LANE-02) · 1 conjunction gap (IDENT-02)
· 2 spec-precision gaps (ADAPT-07/09 correctness claim, APP-02 scope).
**Sensor**: 18 mutations, 17 killed, 1 survived (by design, and it is gap 3).
**Gate**: `npm test` 1320/1320 · `npm run e2e` 71/71 · `npm run proof` 27/27 · size-gate,
verify-package-paths and manifest `--check` all exit 0.

**What works, verified independently**: the boundary gate now fails closed on both `import()` and
`require()` and on any specifier it cannot read as a literal — the non-literal form, which the
literal-only version let through, is the one I confirmed red. Identity, persistence and the redraw
path are all separately discriminating: the `in`-vs-own-property mutation, the memo-dependency
deletion and the third-argument deletion each kill a *different* clause, exactly as the design
claimed. The adapter's build-by-bar-index defence is pinned by a shifted-point control that goes red
when the vendor's timestamp is trusted. The inert ledger discriminates as an exact set in both
directions. The fingerprint check catches a single changed digit. The entry ceiling was never raised —
one line in the whole history ever set it. `params.no-section-churn`, which the author reported as
non-discriminating at T14, kills an inline `Body` now.

**Issues found**: (1) LANE-02 is marked Done on a vacuously true conditional whose consequent no host
can reach; (2) IDENT-02 asserts "still selected" but never "values intact"; (3) a numerically wrong
indicator passes `npm run proof` 27/27 — measured, not inferred — so the owner's "correctly
calculated" condition is met for 6 pinned indicators, argued for 111 constrained, and unverified for
203 structural; (4) the spec's own coverage arithmetic contradicts its table; (5) one listed edge case
has no test.

**Next steps**: route Fixes 1–3 to an implementer before declaring the feature done. Fixes 4–5 are
bookkeeping and can ride along. Fix 3 is the one the owner will meet first, and it needs a wording
change more than a code change — the honest claim is exhaustive *parameterisation* plus tiered
correctness, not uniform correctness.
