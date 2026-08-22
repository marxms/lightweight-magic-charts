# Indicator library adoption — Validation (third pass)

**Date**: 2026-08-21
**Spec**: `.specs/features/indicator-library-adoption/spec.md`
**Diff range under review**: `ef18a59..7df27dc` (3 commits) — the fixes routed back from the second pass.
**Accumulated feature range**: `be75dd6..7df27dc` (29 commits, branch `feat/indicator-library-adoption`).
**Verifier**: independent sub-agent, third pass. This verifier did not write the code, the tests, or
either previous report. Coverage was re-derived from the spec and from the diff, evidence-or-zero;
nothing was carried on trust from the first or second pass. Every mutation ran in a temporary
`git worktree` at `7df27dc` with its own `node_modules` (the vendor package **copied**, not
symlinked, so the real install was never reachable). The worktree was removed with
`git worktree remove --force`; `git worktree list` shows only the real tree; the real tree's
`git status --porcelain` was captured before the sensor and is **byte-identical** after it.
`git stash` was never used.

**Result**: ✅ **PASS**

**Verdict**: both gaps that failed the second pass are closed, and I closed them from zero rather
than reading the author's claim. The deletion path is refused at three separate places and the
refusal is asserted in both of its new directions. LANE-02's first conjunct now has behavioural
evidence: the mutation that survived 1321 tests and the whole e2e last pass dies at
`test/indicatorResolution.spec.ts:90`. 37 of 39 requirements carry evidence whose asserted value
matches the spec-defined outcome; 2 are out of repository and correctly Pending. **One
spec-precision gap is flagged** — `spec.md:225` calls `ids.length - views.length` "the cut", and it
is not the cut when the list carries a duplicate; the test and the documentation both say so, the
spec sentence does not. **One mutant survives and is accepted with reasons**, below.

---

## What the range changed

`git diff ef18a59..7df27dc -- src/` is **empty** — confirmed by running it. Not one byte of `src/`
moved in this range. Five files carry code: `example/indicators/fingerprints.json` (+1),
`scripts/build-indicator-manifest.mjs` (+7/−2), `scripts/indicator-proof.mjs` (+19/−6),
`scripts/indicator-proof/value-ledger.mjs` (+42/−10), `test/indicatorResolution.spec.ts` (+44/−0).
Plus `.specs/spec.md` (+3/−3) and `.specs/tasks.md` (+85/−2).

Exactly one test file changed, and it was **modified, not replaced**: 14 pre-existing cases in
`test/indicatorResolution.spec.ts` are untouched and all 14 still pass under both lane mutations
below. Test count 1321 → **1323** (+2, the two new LANE-02 cases). Suite files 110 → 110.

---

## Fix Task Completion

| Task | Claim | Verdict |
| --- | --- | --- |
| T24 — a deleted fingerprint is a proof that vanished | closes the cheaper bypass; both directions asserted | ✅ **Closed** — refused three ways, asserted two ways, legitimate debut still passes |
| T25 — seven ids against three lanes | LANE-02's own Independent Test, written at last | ✅ **Closed** — M-R dies at `:90`; no pre-existing test moves |
| T26 — the file a forger edits carries its doctrine | `grep -c value-changes` no longer 0, generated not typed | ✅ **Closed** — and drift-proof: deleting or rewording it turns `--check` red |

---

## G1 — the deletion attack, rebuilt from scratch

I did not reuse the second pass's setup. I copied the vendor into the scratch's own `node_modules`
and planted an inverted-weight WMA directly in `calculate76` — weight 1 on the newest bar rising to
`length` on the oldest, the exact inversion of a real WMA. Verified against a hand-computed WMA(9)
over a 20-bar ramp: **pristine 116.333, planted 113.667, −2.29%**. The derived digest is
`7447bb55905ece42…`, which is the same digest the second pass recorded — independent corroboration
that the two plants are the same defect.

| # | What was done | Result | Verdict |
| --- | --- | --- | --- |
| G1-a | planted vendor, `entries.wma` **DELETED**, sanctioned regeneration (`node scripts/build-indicator-manifest.mjs`, no flag) | **exit 1**, nothing written — `wma — vanished-fingerprint: the committed manifest offers it and no digest is on file for it` | ✅ **RED** |
| G1-b | same, `--check` | **exit 1** | ✅ **RED** |
| G1-c | same, `npm run proof` | **27/29, exit 1** — `catalogue.every-fingerprint-re-derives-from-the-VALUES` (`wma is offered with no fingerprint`) and `catalogue.every-value-that-moved-carries-a-DECLARATION` (`vanished-fingerprint`) | ✅ **RED** |
| G1-d | **pristine** vendor, `wma` removed from the committed **manifest** as well as the fingerprints — a genuine debut | generator **writes**, `--check` exit 0, `wma` restored with its correct digest, no declaration demanded | ✅ **Passes by design — the legitimate case is not blocked** |
| F1-a | planted vendor, artefacts **untouched** (the original F1 attack, forge nothing, delete nothing) | generator **exit 1** (`undeclared: 5f2aee29a864… → 7447bb55905e…`), `--check` **exit 1**, proof **27/29 exit 1**, and the scratch porcelain is empty afterwards — it wrote nothing | ✅ **Still RED** |
| F1-d | planted vendor, entry deleted, and the absence **declared** in `value-changes.json` (`from` = the digest on file, `to` = the derived digest, a 130-character reason) | generator writes, `--check` exit 0, proof 29/29 — **two** committed files move, one of them a human sentence naming the indicator | ✅ **Passes by design** |
| F1-e | planted vendor, digest **hand-forged** in place, no declaration | `--check` **exit 0**, proof **29/29**, `git diff --stat` = **1 file changed, 1 insertion, 1 deletion** | ⚠️ **SURVIVES — admitted, accurately** |

**F1-e's admission is now accurate**, which is what the second pass's Fix 3 asked. The docblock at
`value-ledger.mjs:33-35` says "in a repository diff exactly ONE committed file moves" — measured, one
file, one line. And `grep -c value-changes example/indicators/fingerprints.json` → **1** (was 0), at
key `declaredIn`, which is line 3 of the file a forger would be editing.

### And the rule discriminates in both new directions

| # | Mutation on the rule | `file:line` | Result |
| --- | --- | --- | --- |
| S-a | the guard reverted — every absent digest is a debut again (`if (!offers.has(id)) continue;` → `continue;`) | `scripts/indicator-proof/value-ledger.mjs:114` | ✅ **Killed** — proof 28/29, `catalogue.the-declaration-rule-discriminates-in-six-directions` reports `deleted-entry→red false` |
| S-b | the debut exemption dropped — every absent digest faults | `:114` (line removed) | ✅ **Killed** — proof 28/29, `genuinely-new→green false` |
| S-c | the escape hatch broken shut (`restated` → `false`) | `:115` | ❌ **SURVIVES the proof (29/29)** — but **fails closed**; see the judgement below |
| S-d | the escape hatch loosened open (`restated` → any entry for the id, regardless of `to`) | `:115` | ✅ **Killed by an independent clause** — `stale-head` (`:101-103`): generator exit 1, `--check` exit 1, proof exit 1 |

---

## G2 — the M-R mutation, re-run

`resolveSources` deduplicates but never cuts at the lane count (`laneOrder(active, policy.lanes)` →
`laneOrder(active, Number.POSITIVE_INFINITY)`), with `laneOrder` itself **untouched** — the exact
mutation that survived all 1321 tests and the full e2e last pass.

**It dies now.** Two behavioural tests, both new in this range:

| Test | `file:line` + assertion | Failure |
| --- | --- | --- |
| `seven ids against three lanes resolve THREE, and the host reads a cut of four` | `test/indicatorResolution.spec.ts:90` — `expect(resolution.views).toHaveLength(3)` | `Expected length: 3 / Received length: 7` |
| `a repeated id collapses BEFORE the cut, so the difference is not the cut alone` | `:109` — `expect(resolution.views.map((view) => view.id)).toEqual(['a', 'b', 'c'])` | received `['a','b','c','d']` |

**No pre-existing test moves.** Under M-R the other 14 cases in that file pass, which is exactly why
the gap existed: `laneOrder`'s own two tests never reach `resolveSources`. Repository-wide the only
other movement is four byte-measurement probes in `sizeBudget`/`conformance`, which react to the 17
extra source bytes rather than to the behaviour — they are not the kill.

`M-Q` (`laneOrder` stops cutting at all) kills **four** behavioural tests: the two new ones plus the
two `laneOrder` cases at `:56` and `:64`. Both levels of the cut are now pinned independently.

### The duplicate assertion tells the truth

The brief asked me to check whether `ids.length - views.length` is honestly described. Measured:
`['a','a','b','c','d']` against 3 lanes resolves `['a','b','c']`, so the difference is **2** while the
number of studies **the lanes could not fit** is **1** — the other 1 is the duplicate folding.

The test does not pretend otherwise. Its name says *"a repeated id collapses BEFORE the cut, so the
difference is not the cut alone"* and its comment (`:103-105`) says reporting that number as "studies
the lanes could not fit" *"would be a second wrong count standing beside the one this story exists
for."* The documentation says it too: `docs/how-to/inject-catalogue.md:173` — *"Two ids that resolve
to one identity fold into one view, not two."*

**The one place that overclaims is the spec sentence itself** (`spec.md:225`: "the cut SHALL be
derivable by that host as `ids.length - views.length`"). The formula equals the lane cut only when
the list is already distinct. Recorded below as a spec-precision gap, not as a coverage failure: the
asserted values match the code and the published documentation, and the test refuses to call the
number "the cut". Tightening `spec.md:225` changes no code and no assertion.

---

## The two declared deviations, judged

### Deviation 1 — `declaredIn` as a sibling key rather than an extension of `why`

**Verdict: equivalent, with a small edge to the author's choice. Accepted.**

- The named measurement is met: `grep -c value-changes example/indicators/fingerprints.json` → **1**.
- It is **generated, not typed** (`scripts/build-indicator-manifest.mjs:376`), and the committed text
  is compared byte-for-byte by `--check` (`:388`). Measured: **deleting** `declaredIn` → `--check`
  exit 1; **rewording one clause** of it (`REFUSES to write` → `may refuse to write`) → `--check`
  exit 1. The sentence cannot drift from the rule it describes. An extension of `why` would have had
  the identical property, since `why` is generated too — so on drift-resistance the two are the same.
- Where they differ: `why` explains the *algorithm* ("names and shapes are not enough"); `declaredIn`
  explains the *governance*. Two claims under two names read better than one paragraph, and a
  hand-editor opening the file meets `declaredIn` at line 3, above `algorithm`, `vendor` and
  `entries`. The second pass asked for "extend the `why`" as a **means**; the end it named — the file
  a forger edits carries the doctrine that governs it — is met, and this means is not worse.
- One observation, not a gap: `example/indicators/manifest.json` carries no equivalent sentence
  (`grep -c value-changes` → 0), and the manifest is now load-bearing for the rule — it is the
  `offered` set that tells a deletion from a debut. The second escape (delete the row from the
  manifest **and** the fingerprints in one edit) is disclosed at `value-ledger.mjs:36-38`, but it is
  disclosed in the ledger, not in the file that editor is editing.

### Deviation 2 — the escape hatch measured, not asserted

The branch is `value-ledger.mjs:115-118`: if a `value-changes.json` entry already ends at the derived
digest, the `vanished-fingerprint` fault is waived — you may **declare** the absence instead of
restoring the entry. The author declares this branch is measured rather than asserted, and argues it
only fails **closed**. I tested the argument instead of taking it, four ways (S-a..S-d above, plus
F1-d):

- **Fail-open, wholesale** (`restated = true`): **killed**, proof 28/29, `deleted-entry→red false`.
- **Fail-open, subtle** (`restated` = any entry for the id, ignoring `to`): **killed by an
  independent clause** — `stale-head` at `:101-103` refuses it; generator, `--check` and proof all
  exit 1.
- **Fail-closed** (`restated = false`): survives the proof at 29/29 on a clean tree, but on the
  scenario it governs it refuses an honest declaration and turns the generator, `--check` and the
  proof all red. It cannot put a wrong number behind a green build.
- **The path working as designed** (F1-d): two committed files move, one of them a human sentence
  naming the indicator, the digest it moved from, the digest it moved to and the reason.

**I accept the argument. It is not convenience.** The asymmetry is real and I measured it: every
fail-open mutation of this branch is killed — one by the asserted six-direction clause, one by an
independent clause — and the only survivor is the fail-closed one, whose worst outcome is that an
honest release-taker gets a red build and has to restore the entry rather than declare its absence.
That is materially different from M-R, whose survival meant studies the reader chose were never drawn
while every gate stayed green.

**Said with all the letters, because the brief asks me to decide:** this is the **only** unasserted
branch in the declaration rule, and it is the branch that says *yes*. Yes-branches rot silently —
nothing ever fails when they stop working, so nobody finds out until someone hits the affordance and
works around it, at which point the rule is intact and the documented path is dead. **I do not make
it a blocking condition and PASS does not depend on it.** I record it as a named, bounded residual
with a three-line fix that should ride along the next time that file is touched: add a seventh
direction beside the six already at `scripts/indicator-proof.mjs:697-724` —
`valueLedgerFaults({ committed: {}, derived: now, ledger: { changes: [entry(A, B)] }, offered: ['wma'] })`
→ expect `[]`, using fixtures already in scope. It converts a fail-closed unknown into a fail-closed
known.

---

## Spec-Anchored Acceptance Criteria — all 39, re-derived

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| **GATE-01** `await import('lightweight-charts-indicators')` under `src/` → reported as a violation | that specifier reported | `test/boundary.spec.ts:534` (`imports no third-party indicator catalogue at module scope`), `:679-684` — `expect(measuredImpurity(synthetic(…, "await import('react')"))).toBe('runtime')`. Empirically: M11 turns **4** clauses red | ✅ PASS |
| **GATE-02** dynamic import of a relative path → no violation | no violation | `:688-693` — `expect(measuredImpurity(…'./neighbour'…)).toBeUndefined()`; `expect(layerViolations([…'../domain/types'…])).toEqual([])` | ✅ PASS |
| **GATE-03** both asserted against synthetic sources | both directions present | `:675-693` — the comment states the sources are synthetic on purpose; both directions asserted in the same case | ✅ PASS |
| **GATE-04** dynamic bare specifier judged by the same allow-list | same layer rule | `:682-684` — `toEqual(['FAIL tabs/x.ts :: import outside the layer rule -> react'])` | ✅ PASS |
| **GATE-05** non-literal reference (template / variable / concatenation) → violation in its own right | reported as unreadable | `:699-712` — `expect(importSpecifiers(…evasion…)).toEqual([UNREADABLE_SPECIFIER])` over all three forms. M10 turns 3 clauses red | ✅ PASS |
| **GATE-06** same rule for `require(...)` | same terms | `:703-705` — `require(name)`, `require(\`${base}/indicators\`)`, `require('lightweight-charts' + '-indicators')` in the same loop | ✅ PASS |
| **IDENT-01** entry carrying an id → that id persisted as identity | the id, not the label | `test/chartWorkspace.spec.tsx:1168` — `expect(screen.getByTestId('workspace-active-study.moving-average')).toBeInTheDocument()`, with the label `Moving average` and the provider id both different (`:1156`) | ✅ PASS |
| **IDENT-02** label changes, id does not → study stays selected **and keeps its values** | both conjuncts | `:1215` `expect(last.ids).toEqual([STUDY_ID])`; `:1216` `expect(last.settings).toEqual({ [STUDY_ID]: { period: 50 } })`; `:1222` `expect(written.tabs[0].setup.studySettings).toEqual({ [STUDY_ID]: { period: 50 } })`; `:1228-1229` chip still pressed, study still listed. Killed by M1 (identity clause) and, last pass, by M-J (value clause) | ✅ PASS |
| **IDENT-03** no id → fall back to the label | still resolves and lights | `:1245` — `expect(screen.getByTestId('workspace-active-Alpha')).toBeInTheDocument()` after the chip flips to `aria-pressed=true` | ✅ PASS |
| **IDENT-04** two entries resolving to one identity → reported through the notice channel | notice fires, second not dropped in silence | `:1304` — `expect(screen.getByRole('alert')).toHaveTextContent('study.moving-average')`; `:1305` `expect(activeStudies()).toHaveLength(1)`; negative control at `:1308` | ✅ PASS |
| **PARAM-01** serialise → parse restores each study's values, keyed by the IDENT-01 identity | byte-for-byte through the real codec | `test/studySettings.spec.ts:229-233` — `expect(restored.tabs[0].setup.studySettings).toEqual({ ma: { period: 20, source: 'close' }, rsi: { period: 14 } })` | ✅ PASS |
| **PARAM-02** value changes → identity, lane and position unchanged | all three unchanged | `:242-245` — `expect(after.indicators).toEqual(['ma','rsi'])`, `expect(after.panes).toEqual(before.panes)`, `expect(after.studySettings).toEqual({ ma: { period: 50 } })` | ✅ PASS |
| **PARAM-03** the package never reads/interprets/validates/defaults a value | returns what it was handed | `:118` (`returns the SAME value it was handed, whatever shape it has`), `:135` (idempotence). Proof: `adapter.a-stored-value-is-refused-rather-than-clamped` | ✅ PASS |
| **PARAM-04** no OWN property → no value, never one from the prototype chain | `undefined` | `:93-101` — `expect(coerceWorkspaceSetup({ indicators:['ma'], studySettings: Object.create({ ma:{period:9} }) }, POLICY).studySettings).toBeUndefined()`, with the control positive at `:104-113`. Killed by M2 | ✅ PASS |
| **PARAM-05** host coercion rejects a value → load that study with no values, not refuse the payload | study loads, values empty | `:169-196` | ✅ PASS |
| **PARAM-06** values for a study no longer listed → dropped | dropped, others kept | `:155` `expect(setup.studySettings).toEqual({ ma: { period: 20 } })`; `:157` `.not.toHaveProperty('gone')`; `:164` whole map dropped | ✅ PASS |
| **PARAM-07** pre-feature payload loads without error and without a version bump, values empty | same version, no throw, `undefined` | `:273-275` — `expect(restored.tabs[0].id).toBe('tab-1')`, `expect(restored.tabs[0].setup.studySettings).toBeUndefined()`; `:282` `expect(JSON.stringify(setup)).not.toContain('studySettings')` | ✅ PASS |
| **PARAM-08** duplicated tab carries the same values | same map on the copy | `:259` — `expect(duplicated.tabs[1].setup.studySettings).toEqual({ ma: { period: 20 } })` | ✅ PASS |
| **ADAPT-01** non-finite vendor value → a point with no `value` | a declared gap, never a zero | proof `adapter.a-non-finite-value-becomes-a-declared-gap` (`scripts/indicator-proof.mjs:856`) — NaN, null, Infinity, a string and a missing row all yield a point with no value at all | ✅ PASS |
| **ADAPT-02** plot key from that indicator's `plotConfig`, not `plot0` | the declared key | proof `adapter.the-plot-key-comes-from-the-plot-config` (`:894`) — an entry whose only promised plot is `alpha` draws alpha and never the `plot0` beside it; all 320 draw exactly the promised keys, 42 under a non-`plotN` key | ✅ PASS |
| **ADAPT-03** a vendor computation that throws costs one study | every other study drawn, that one `unavailable` | `test/indicatorResolution.spec.ts:155` (both catches, each needed — `:152-153`); proof `adapter.a-computation-that-throws-costs-one-study-and-one-attempt` (`:925`) | ✅ PASS |
| **ADAPT-04** an input with no effect is omitted from the form | offered controls all move the drawing | proof `manifest.every-offered-indicator-holds-up` (`:489`, "offer only controls that move the drawing") and `manifest.every-held-back-control-has-a-reason` (`:523`, 46 + 2 + 120 held back with reasons); e2e `params.the-form-offers-exactly-the-controls-the-manifest-offers` (`scripts/e2e-demo.mjs:1091`) | ✅ PASS |
| **ADAPT-05** bars reach the vendor ascending | oldest-first, caller's array untouched | proof `adapter.the-bars-reach-the-vendor-ascending` (`:835`) — 8 bars handed over newest-first arrive oldest-first and the caller's own array is left in the order it was given | ✅ PASS |
| **ADAPT-06** value change → redraw without unmounting the series | redraw, not remount | `test/chartWorkspace.spec.tsx:1740-1741` `expect(calls[calls.length-1].settings).toEqual({ [STUDY_ID]: { period: 50 } })`, `:1747-1748` study still listed and legend intact; e2e `params.edit-keeps-the-study` and `params.no-churn-across-the-edit`. Killed by M3 and M4 | ✅ PASS |
| **ADAPT-07** exclude no-plot entries, untyped-registry-only entries, and entries with a confirmed defect | excluded, each named with its measurement | proof `catalogue.the-definitional-exclusions-are-named-with-their-measurement` (`:656`) — 6 excluded, each with a ≥60-character measurement; `ledger.every-entry-has-a-written-reason` (`:325`) — 65 entries each with its own reason | ✅ PASS |
| **ADAPT-08** unbounded input whose cost grows → bound it or do not offer it | no control can cost a second | proof `cost.no-offered-control-can-cost-a-second` (`:565`) — 790 numeric controls at their declared maximum; slowest `ml-knn-strategy.lookback` at 100000 = **57 ms**, budget 1000 ms | ✅ PASS |
| **ADAPT-09** manifest carries, per indicator, the tier reached and the settle window | tier + `confirmsWithinBars` per row | proof `seal.every-offered-indicator-carries-a-tier` (`:580`) and `seal.the-manifest-transcribes-it-rather-than-computing-it` (`:589`) — `{"pinned":6,"constrained":111,"structural":203}`, counted directly out of `manifest.json` by me, not read off the prose | ✅ PASS |
| **ADAPT-10** re-derivation compares computed VALUES, so a vendor upgrade that changes a number cannot pass unseen | a changed number turns it red | `catalogue.every-fingerprint-re-derives-from-the-VALUES` (`:644`, also flags `offered with no fingerprint` at `:636`); `catalogue.every-value-that-moved-carries-a-DECLARATION` (`:682`); `catalogue.the-declaration-rule-discriminates-in-six-directions` (`:718`); `scripts/build-indicator-manifest.mjs:340-352` refuses to write. Verified end to end by F1-a and G1-a/b/c | ✅ PASS (one admitted hole: F1-e) |
| **LANE-01** documentation states `views.length` is the resolved count and the cut is the difference | said in the published docs | `docs/how-to/inject-catalogue.md:164-167` — *"`views.length` IS the resolved count, and what was cut is the difference against the list you passed in"*; the `laneCut` example at `:173-174` is compiled by `test/gates/docExamples.spec.ts` | ✅ PASS |
| **LANE-02** cut derivable as `ids.length - views.length`; the example writes capacity and lane count as ONE symbol | both conjuncts | 1st: `test/indicatorResolution.spec.ts:90` `expect(resolution.views).toHaveLength(3)` and `:91` `expect(ids.length - resolution.views.length).toBe(4)` — **M-R now dies here**. 2nd: `scripts/e2e-demo.mjs:1244` `params.the-ceiling-and-the-lane-count-are-one-number`, comments stripped first | ✅ PASS — ⚠️ see the precision gap below |
| **LANE-03** the package does not change which studies are cut | cut from the END, order preserved | `test/indicatorResolution.spec.ts:57` `expect(laneOrder(['a','b','a','c','d','e'], 4)).toEqual(['a','b','c','d'])`; `:94-95` `expect(views.map(v => v.id)).toEqual(['a','b','c'])` **and** identical to resolving those three alone; `:97-99` the ones that did not fit spend no lane and no series slot. Killed by M-Q and M-R | ✅ PASS |
| **DEMO-01** curated catalogue from the library, no-plot and fill-dependent entries excluded | a real, non-empty, curated catalogue | e2e `catalogue.not-empty` (`scripts/e2e-demo.mjs:336`), `catalogue.over-price-has-entries` (`:344`), `params.catalogue-lists-before-the-library` (`:959`), `params.library-fetched-on-demand` (`:969`); proof exclusions clause (`:656`) names `transient-zones (inverted-band)` among the six | ✅ PASS |
| **DEMO-02** visitor edits an input → chart redraws, study stays in the list | value changes, count does not | e2e `params.edit-changes-the-drawing` (`:1112`) — legend `31.04,44.35 → 57.98,65.05` at length 14 → 50; `params.edit-keeps-the-study` (`:1117`) — 1 chip before, 1 after; `params.edit-is-reversible` (`:1127`) | ✅ PASS |
| **DEMO-03** decision log carries an entry superseding AD-006's example clause, naming what evidence changed | a new AD naming the evidence | `.specs/STATE.md:19` — AD-019, and `:12` rewrites AD-006 to point at it. The evidence named: agreement to ~1e-13 across six series against `example/studies.ts`, `histogram == macd - signal` exactly zero | ✅ PASS |
| **DEMO-04** exactly two peers and no runtime dependency after the example takes the library | 0 deps, 2 peers | `test/boundary.spec.ts:935` (`has NO runtime dependencies`); e2e `params.the-package-declares-zero-dependencies-and-two-peers` (`:1213`) | ✅ PASS |
| **DOC-01** documentation states the bytes and the words are the host's, and that the package stores values without interpreting them | both sentences published | `docs/how-to/inject-catalogue.md:185-186` (*"The bytes and the words are yours"*) and `:194-195` (`StudySettings` is `unknown`, *"not laziness"*) | ✅ PASS |
| **DOC-02** every new published symbol appears in the regenerated reference byte-for-byte | reference matches the surface | `test/gates/docReference.spec.ts` — PASS in the run below; `test/gates/docExamples.spec.ts` compiles every doc code block | ✅ PASS |
| **APP-01** the application declares both packages in its own manifest | out of repository | `spec.md:316` — unmapped, **Pending**, verified by that application's own suite | ⏭️ N/A — correctly Pending |
| **APP-02** the application loads the library behind the first study request, not at boot | out of repository | `spec.md:317` — unmapped, **Pending**. `scripts/e2e-demo.mjs:969` proves it for the **example**, and DEMO-01 already carries what the example owes | ⏭️ N/A — correctly Pending |

**Status**: **37/37 mapped criteria carry evidence whose asserted value matches the spec-defined
outcome. 2 out of repository and correctly Pending. 1 spec-precision gap flagged.**

### ⚠️ Spec-precision gap (flagged, not silently passed)

`spec.md:225` — "the cut SHALL be derivable by that host as `ids.length - views.length`". The
formula counts **every list entry that draws nothing of its own**, which equals the lane cut only
when the list is already distinct. Measured: `['a','a','b','c','d']` against 3 lanes → difference 2,
lane cut 1. The test (`test/indicatorResolution.spec.ts:102-105`) and the documentation
(`docs/how-to/inject-catalogue.md:173`) both state the caveat; the spec sentence does not. Fix is
editorial: name the precondition in `spec.md:225`. No code and no assertion changes.

---

## Discrimination Sensor

**Isolation**: one temporary `git worktree --detach` at `7df27dc`, with its own `node_modules`
directory — every package symlinked from the real install **except** `lightweight-charts-indicators`,
which was **copied** so that no vendor plant could reach the real tree. Scratch baseline: **3
pre-existing failures** (`dist/`-dependent probes in `sizeBudget`/`conformance`, absent because the
scratch has no build), identical in every run, so they affect no kill determination. Net counts are
stated against 1320 passing of 1323. Worktree removed with `--force`; `git worktree list` shows only
the real tree; real-tree `git status --porcelain` is byte-identical to the pre-sensor baseline; the
real vendor install still carries the pristine `ta59.wma` line and no `__srcArr` marker.

| # | Mutation | `File:line` | Killed? |
| --- | --- | --- | --- |
| M-R | `resolveSources` dedups but never cuts; `laneOrder` untouched | `src/indicator/resolution.ts:78` | ✅ **Killed** — `test/indicatorResolution.spec.ts:90` (`Expected 3 / Received 7`) and `:109`. 14 pre-existing cases in the same file unmoved |
| M-Q | `laneOrder` stops cutting at the lane count | `src/indicator/resolution.ts:67` | ✅ Killed — 4 behavioural tests (`:56`, `:64`, `:85`, `:102`) |
| G1-a/b/c | planted `wma`, `entries.wma` deleted, sanctioned regeneration | `example/indicators/fingerprints.json` (scratch) | ✅ **Killed** — generator exit 1 writing nothing, `--check` exit 1, proof 27/29 |
| G1-d | the same deletion for an id the **committed manifest does not offer** | `example/indicators/{manifest,fingerprints}.json` (scratch) | ✅ Passes **by design** — a genuine debut is not blocked |
| F1-a | planted `wma`, artefacts untouched | vendor copy (scratch) | ✅ Killed — `undeclared`, three ways |
| F1-d | planted `wma`, entry deleted, absence **declared** | `example/indicators/value-changes.json` (scratch) | ✅ Passes **by design** — 2 files move, one a human sentence |
| F1-e | planted `wma`, digest hand-forged, no declaration | `example/indicators/fingerprints.json` (scratch) | ⚠️ **Survives — admitted** at `value-ledger.mjs:33-35`, and the admission is now numerically accurate (1 file, 1 line) |
| S-a | `offers.has` guard reverted | `scripts/indicator-proof/value-ledger.mjs:114` | ✅ Killed — proof 28/29, `deleted-entry→red false` |
| S-b | debut exemption dropped | `:114` | ✅ Killed — proof 28/29, `genuinely-new→green false` |
| S-c | escape hatch broken shut (`restated → false`) | `:115` | ❌ **Survives the proof (29/29)** — **fails closed**: refuses an honest declaration, generator/`--check`/proof all exit 1. Accepted with reasons |
| S-d | escape hatch loosened open (`to` unchecked) | `:115` | ✅ Killed by `stale-head` (`:101-103`) — defence in depth |
| D-1 | `declaredIn` deleted from the committed artefact | `example/indicators/fingerprints.json` | ✅ Killed — `--check` exit 1 (`STALE`) |
| D-2 | `declaredIn` reworded (`REFUSES` → `may refuse`) | same | ✅ Killed — `--check` exit 1 |
| M1 | `studyIdentity` returns `entry.label` always | `src/react/SeriesMenu.tsx:45` | ✅ Killed — 9 behavioural, incl. IDENT-02 at `test/chartWorkspace.spec.tsx:1215` and IDENT-04 |
| M2 | `hasOwnProperty.call(source, id)` → `id in source` | `src/tabs/setup.ts:87` | ✅ Killed — exactly one behavioural test, `PARAM-04 … yields NO value for a study whose key lives only on the prototype chain` |
| M3 | memo dependency drops `setup.studySettings` | `src/react/workspace/ChartWorkspace.tsx:205` | ✅ Killed — 5 behavioural |
| M4 | the settings third argument dropped | `:203` | ✅ Killed — 6 behavioural, a strict superset of M3's (adds the PARAM-05 clause at `test/studyForm.spec.tsx:346`) |
| M5 | `SeriesCatalogueEntry.id?` deleted | `src/react/SeriesMenu.tsx:24` | ✅ Killed — 23 failures / 10 suites |
| M6 | `WorkspaceNoticeLabels.duplicateStudy?` deleted | `src/react/chrome/labels.ts:29` | ✅ Killed — 23 / 35 suites |
| M7 | `WorkspaceSetup.studySettings?` deleted | `src/tabs/setup.ts:37` | ✅ Killed — 24 / 9 suites |
| M8 | `WorkspaceStudies.resolve?` deleted | `src/react/workspace/ChartWorkspace.tsx:120` | ✅ Killed — 23 / 5 suites |
| M9 | `SetupPolicy.coerceStudySettings?` deleted | `src/tabs/setup.ts:55` | ✅ Killed — 23 / 8 suites |
| M10 | synthetic `await import(<variable>)` under `src/` | `src/domain/futureTail.ts` (appended) | ✅ Killed — 3 boundary clauses |
| M11 | synthetic `await import('lightweight-charts-indicators')` under `src/` | same | ✅ Killed — 4 boundary clauses, incl. `imports no third-party indicator catalogue at module scope` |
| M12 | the point takes the **vendor's** timestamp instead of its own bar | `example/indicators.ts:151-152` | ✅ Killed — proof `adapter.every-point-is-timed-by-its-own-bar`, `1023 points off their bar` |

**Sensor depth**: P0-full — **25 injections**.
**Result**: **21 killed · 2 pass by design · 2 survive.** One survivor (F1-e) is admitted in the code
and accepted as a trust boundary, and its admission is now accurate. One (S-c) fails **closed** and
is accepted with the reasoning written out above.

---

## Re-checks carried forward — none taken on trust

| Check | Result |
| --- | --- |
| `PROVISIONAL_ENTRY_LIMIT` raised? | **No.** `git log -p --all -- test/gates/sizeBudget.spec.ts` shows exactly one line in the entire history touching it: `+const PROVISIONAL_ENTRY_LIMIT = 104994;`. Still 104994 (`test/gates/sizeBudget.spec.ts:48`); the entry budget is pinned at 104992 and measures 104992 |
| Any suite deleted in `ef18a59..7df27dc`? | **No.** `git diff --diff-filter=D --name-only` is empty; 110 spec files both sides, 107 suites executed both sides |
| Any `.skip` / `.only` / `xit` added? | **No.** Zero matches in the range's test diff. Repository-wide there is exactly **one** textual match and it is a template-literal fixture inside `test/gates/language.spec.ts:109`, not a real skip |
| Test count | 1321 → **1323** (+2: T25's two cases). Only `test/indicatorResolution.spec.ts` changed, and it was modified, not rewritten |
| The five optional members still each kill? | **Yes**, all five, re-measured against the 3-failure scratch baseline: `SeriesCatalogueEntry.id?` → 23/10 · `duplicateStudy?` → 23/35 · `WorkspaceSetup.studySettings?` → 24/9 · `WorkspaceStudies.resolve?` → 23/5 · `SetupPolicy.coerceStudySettings?` → 23/8 |
| Boundary gate red for `import(<variable>)` and for the vendor name? | **Yes**, both. 3 clauses and 4 clauses respectively (M10, M11) |
| The original F1 attack (plant, do not delete) still red? | **Yes.** Generator exit 1 writing nothing, `--check` exit 1, proof 27/29 exit 1 |
| Opacity (`hasOwnProperty.call` → `in`) still red? | **Yes** — M2, one behavioural test, the exact PARAM-04 clause |
| Redraw (memo dep, third argument) still red at different clauses? | **Yes** — M3 (5 tests) and M4 (6 tests); M4's set strictly contains M3's, the extra being the host-refuses-a-stored-value clause |
| Identity (`studyIdentity` → label always) still red? | **Yes** — M1, 9 behavioural tests, reporting at `test/chartWorkspace.spec.tsx:1215` |
| The point by index still red? | **Yes** — M12, proof clause red with `1023 points off their bar` |

---

## Edge Cases

- [x] Library fails to load → workspace mounts with an empty catalogue: `scripts/e2e-demo.mjs:1016` (`params.a-failed-catalogue-still-mounts`), `:1028` (`params.a-failed-catalogue-throws-nothing`)
- [x] Parameter values declared as a non-object → treated as absent: `test/studySettings.spec.ts:142-145` — `'none'`, `7`, `null`, `true`, `['ma']` all → `toBeUndefined()`
- [x] Stored identity matching no catalogue entry → kept in the list, draws nothing: `test/indicatorResolution.spec.ts:133-140` — `toMatchObject({ id: 'ghost', label: null, availability: 'empty', drawn: 0 })`
- [x] A value edited while history is still loading → recompute against the bars present, gaps rather than an error: `test/chartWorkspace.spec.tsx:1870-1871` (precondition `barCount` 0, settings intact), `:1875` (no diagnosis of its own), `:1897` `expect(study).toEqual([{ time: 2000, value: BARS[1].close }])` — a warm-up bar draws **nothing**, never a zero
- [x] Entry bundle stays below `PROVISIONAL_ENTRY_LIMIT`: `node scripts/size-gate.mjs` exit 0, entry `104992 / 104992`, limit constant 104994

---

## Gate Check — measured on `7df27dc`, not quoted

| Gate | Command | Result |
| --- | --- | --- |
| Quick / Build | `npm test` | **107 suites, 1323 tests, 0 failed, 0 skipped**, exit 0 |
| Full | `npm run e2e` | **71/71 passed**, exit 0 |
| Proof | `npm run proof` | **29/29 passed in 11.4 s**, exit 0 |
| Build | `node scripts/size-gate.mjs` | exit 0 — 16 measurements under budget, entry `104992 / 104992` |
| Build | `node scripts/verify-package-paths.mjs` | exit 0 — `files[]` and `exports` both resolve (7 entries) |
| Catalogue | `node scripts/build-indicator-manifest.mjs --check` | exit 0 — 320 offered |

All six re-run **after** the sensor and still green; the real tree's porcelain is byte-identical to
the pre-sensor baseline.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ `src/` gains nothing in this range — the diff is empty. 68 net lines in `scripts/`, 44 in one test file, 1 in an artefact |
| Surgical changes | ✅ 5 code files, one of them a test, and that test was extended rather than rewritten |
| No scope creep | ✅ No new public surface, no `onNotice`, no `cut` member. The lane cut stayed derivable rather than published, as the design measured |
| Matches patterns | ✅ `vanished-fingerprint` is the same shape as the `undeclared` / `wrong-from` / `no-reason` faults beside it; `declaredIn` mirrors the generated `why` preamble the file already carried |
| Spec-anchored outcome check | ✅ 37/37 mapped criteria; 1 spec-precision gap flagged, not passed over |
| Per-layer Coverage Expectation | ✅ Domain logic 1:1 with ACs; the ledger rule covered in six directions plus two end-to-end paths; the resolver covered at both `laneOrder` and `views` level |
| Every test maps to a requirement | ✅ Both new cases map to LANE-02 and LANE-03, named in `spec.md:308-309` |
| Documented guidelines followed | ✅ `CONTRIBUTING.md` and `.github/workflows/ci.yml` still state the tiered claim and negate the uniform one; `docs/how-to/inject-catalogue.md:173` names the duplicate caveat |

---

## Requirement Traceability Update

| Requirement | Previous | New |
| --- | --- | --- |
| GATE-01..06 | ✅ Verified | ✅ Verified — re-confirmed by M10 / M11 |
| IDENT-01..04 | ✅ Verified | ✅ Verified — IDENT-02 re-confirmed by M1 on both conjuncts |
| PARAM-01..08 | ✅ Verified | ✅ Verified — PARAM-04 re-confirmed by M2, PARAM-05 by M4 |
| ADAPT-01..09 | ✅ Verified | ✅ Verified — ADAPT-01/02/05 by the proof, ADAPT-06 by M3/M4, the adapter's timing by M12 |
| ADAPT-10 | ⚠️ Verified with a named hole | ✅ **Verified** — the deletion hole is closed and asserted; the remaining hole (a hand-forged digest) is admitted in code, accurate, and the doctrine now sits at the top of the file a forger edits |
| LANE-01, LANE-03 | ✅ Verified | ✅ Verified — LANE-03 now pinned at the `views` level as well as at `laneOrder` |
| LANE-02 | ❌ Needs Fix | ✅ **Verified** — first conjunct asserted at `test/indicatorResolution.spec.ts:90`, M-R killed. ⚠️ spec sentence imprecise (see above) |
| DEMO-01..04, DOC-01..02 | ✅ Verified | ✅ Verified |
| APP-01, APP-02 | ⏭️ Pending | ⏭️ Out of repository — correctly Pending |
| Edge cases (5) | ✅ / ✅ | ✅ All five carry evidence |

---

## Summary

**Overall**: ✅ **Ready.**

**Spec-anchored check**: 37/37 mapped criteria matched · 2 out of repository · 1 spec-precision gap flagged.
**Sensor**: 25 mutations · 21 killed · 2 pass by design · 2 survive (1 admitted trust boundary, 1 fail-closed and accepted with reasons).
**Gate**: `npm test` 1323/1323 · `npm run e2e` 71/71 · `npm run proof` 29/29 · size-gate `104992/104992` · `verify-package-paths` · manifest `--check` — all exit 0, all re-run clean after the sensor.

### What is now true

The two failures that sank the second pass are closed, and I closed them independently rather than
checking a claim. Deleting a fingerprint entry no longer launders a wrong number: the generator
refuses to write, `--check` refuses to pass, and the proof names the indicator — measured with an
inverted-weight WMA planted from scratch at −2.29%. The new rule is asserted in **both** of its
directions, so it cannot silently start refusing legitimate new indicators either. And `views.length`
is now pinned as the resolved count: the mutation that survived every gate last pass dies at a named
line with a named expected value, while the fourteen pre-existing cases in the same file stay green,
which is what tells you the new test reaches something the old ones never did.

### What is true **and limited** — read this before you sit down with the indicators

The owner's stated acceptance condition is two separate things, and the proof answers them at two
very different strengths. Do not read one as the other.

**Parameterisation is proven exhaustively, and you can lean on it.**
- All **320** offered indicators are proven to draw, to be deterministic, to be pure, to be
  bar-length aligned, to sit on the scale they declare and to break no asserted bound
  (`manifest.every-offered-indicator-holds-up`).
- All **1021** offered controls are proven to actually move the drawing; the 168 that do not are held
  back **with a written reason each** — 46 inert, 2 colour controls this host does not render, 120
  moving only a channel this package cannot draw (`manifest.every-held-back-control-has-a-reason`).
- No offered control can be given a value that costs a second: 790 numeric controls computed at their
  declared maximum, slowest 57 ms against a 1000 ms budget (`cost.no-offered-control-can-cost-a-second`).
- Every point is timed by its own bar, never by the vendor's stamp — 873,218 finite readings across
  1048 plot series over 1024 bars (`adapter.every-point-is-timed-by-its-own-bar`).
- A stored value is refused rather than clamped, and a value the host rejects costs that value, not
  the payload.

**If you find a parameterisation defect in the demo, that is a real hole in a proof that claims to be
exhaustive, and it should be reported as such.**

**Numeric correctness is NOT proven uniformly, and the proof does not claim it is.** The seal
(`example/indicators/manifest.json → sealMeaning`) is three tiers, and the split is
**`pinned 6 · constrained 111 · structural 203`**:
- **6 `pinned`** — a hand-computed golden vector or `example/studies.ts` fixes their numbers. These
  are checked against an oracle. On top of that, AD-019 records a cross-check of the vendor's
  arithmetic against this repository's own hand-written implementations across **six series**,
  agreeing to ~1e-13 with `histogram == macd - signal` exactly zero.
- **111 `constrained`** — a family invariant that holds regardless of implementation applies **and
  passes** (e.g. an oscillator staying inside its band). Wrong-but-in-range is not excluded.
- **203 `structural`** — *"it draws, is deterministic, is pure, is aligned and sits on the scale it
  declares — **nothing is claimed about the values**."* For these 203, if the vendor's arithmetic is
  wrong, this repository will not tell you. `CONTRIBUTING.md:138` says so by name: *"Read 'every
  indicator is correctly calculated' nowhere in this."*

**What the fingerprints do and do not buy you.** `fingerprints.json` digests the computed values of
all 320, so a **change** to any number is caught: a vendor upgrade that moves a digit turns the build
red and cannot be regenerated away, forged away by deleting the entry, or reported as merely stale.
That is a proof about **stability**, not about **correctness** — a number that has been wrong since
the first commit is stable, and the digest will defend it forever. Verified by measurement: a wrong
WMA planted in the vendor is caught by the digest rule, and the *same* wrong WMA baked into the
original artefacts would have been sealed in silently under a `structural` tier.

**The one move the digest rule admits it cannot catch**: typing a digest into `fingerprints.json` by
hand to agree with a vendor you patched yourself. That is one committed file, one line, and no
declaration — measured, `--check` exit 0 and proof 29/29. It is stated at
`scripts/indicator-proof/value-ledger.mjs:33-40` and the doctrine now sits at the top of that file
(`declaredIn`, line 3) where the editor would meet it.

### Residuals, named rather than left implicit

1. **`spec.md:225` overclaims by one word.** `ids.length - views.length` is the count of list entries
   that draw nothing of their own; it equals the lane cut only when the list is already distinct. The
   test and the documentation both say so. Editorial fix, no code.
2. **One unasserted branch in the declaration rule** — the *yes* branch, `value-ledger.mjs:115-118`,
   which lets you declare an absence instead of restoring the entry. Every fail-open mutation of it is
   killed (one by the asserted six-direction clause, one by an independent `stale-head` clause); only
   the fail-closed mutation survives. Three lines beside the six already at
   `scripts/indicator-proof.mjs:697-724` would close it, and should ride along the next time that file
   is touched. **PASS does not depend on it.**
3. **`manifest.json` carries no doctrine** (`grep -c value-changes` → 0), although it is now
   load-bearing for the rule — it is the `offered` set that tells a deletion from a debut. The second
   escape (delete the row from the manifest *and* the fingerprints in one edit) is disclosed in the
   ledger but not in the file that editor is editing.

**Next steps**: the feature is ready to be declared complete. When the owner's own pass over
parameterisation and calculation begins, the 203 `structural` rows are where a numeric defect can
still hide, and finding one there contradicts nothing this proof claims.
