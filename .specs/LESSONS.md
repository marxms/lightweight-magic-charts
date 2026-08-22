# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 - A requirement whose only implementation lives in example/ or another build-only path is unproven until a browser check reads its OUTCOME; a task that declares 'Tests: none' must not close a requirement in the traceability table.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `example/,e2e` · harmful: 0
- features: drawing-gestures
- evidence: MAGNET-07 / example/drawing.ts:266 (mutant M22 survived npm test + npm run e2e) (example/,e2e)
- last seen: 2026-08-20T12:59:33Z

### L-002 - An ordering probe that fires the very event it is measuring makes both orderings produce the same reading; assert the SEQUENCE of recorded markers, never a count derived after the event has been serviced.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `test/,ordering-probes` · harmful: 0
- features: drawing-gestures
- evidence: M20 / test/drawingSeam.spec.tsx:324-342 vs src/react/surface/useDrawingSeam.ts:90-91 (test/,ordering-probes)
- last seen: 2026-08-20T12:59:33Z

### L-003 - Every edge case listed in the spec needs its own task and assertion or an explicit deletion; an edge case that appears in no test file and no task is a claim, not a behaviour.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `.specs/,edge-cases` · harmful: 0
- features: drawing-gestures
- evidence: spec.md:124-125 (non-price-pane edge case); grep finds the string only in spec.md (.specs/,edge-cases)
- last seen: 2026-08-20T12:59:33Z

### L-004 - When every fixture passes a lookup key that matches, the not-found branch is untested; give at least one case a key that resolves to nothing in a NON-empty collection, because the empty-collection case exercises a different guard.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `test/,fixtures` · harmful: 0
- features: drawing-gestures
- evidence: M21 / src/drawing/magnet.ts:45 - unmatched bar time falls back to bars[0], suite stays green (test/,fixtures)
- last seen: 2026-08-20T12:59:33Z

### L-005 - A threshold criterion must name its UNIT and whether the boundary is inclusive; 'within X' leaves the equality case to the implementation and lets a unit mismatch pass review.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `.specs/,thresholds` · harmful: 0
- features: drawing-gestures
- evidence: MAGNET-03 spec.md:89-90 (boundary silent) and spec.md:122-123 (tie named in price units while magnet.ts:59 measures pixels) (.specs/,thresholds) (+1 more)
- last seen: 2026-08-20T14:47:02Z

### L-006 - An OPTIONAL member wired at one call site is unsensed unless a composition test supplies a non-default value for it; when every test double answers the inert default, deleting the wiring typechecks and every gate stays green.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `src/react/,composition-wiring` · harmful: 0
- features: drawing-gestures
- evidence: src/react/surface/useDrawingSeam.ts:82 (mutant U5) (src/react/,composition-wiring)
- last seen: 2026-08-20T13:53:11Z

### L-007 - When a module decides that one host-supplied callback may throw and guards it, every later callback added to the same host type inherits that obligation; an unguarded sibling throws out of a browser-dispatched event.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `src/drawing/,published-callbacks` · harmful: 0
- features: drawing-gestures
- evidence: src/drawing/axisLock.ts:56 (measured: a throwing pricePane escapes the mousedown handler) (src/drawing/,published-callbacks)
- last seen: 2026-08-20T13:53:11Z

### L-008 - An edge case must state the OUTCOME, not the mechanism it should copy; naming an implementation the layer cannot reach ('matching the pane-index guard') makes the criterion unverifiable against the code that has to satisfy it.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `.specs/,edge-cases` · harmful: 0
- features: drawing-gestures
- evidence: .specs/features/drawing-gestures/spec.md:124-125 (.specs/,edge-cases) (+1 more)
- last seen: 2026-08-20T14:47:03Z

### L-009 - A threshold criterion must name its UNIT and whether the boundary is inclusive; 'within X' leaves the equality case to the implementation and lets a unit swap pass review.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec/acceptance-criteria` · harmful: 0
- features: drawing-gestures
- evidence: spec.md:89 vs src/drawing/magnet.ts:60 (spec/acceptance-criteria)
- last seen: 2026-08-20T14:46:29Z

### L-010 - An edge case must state the OUTCOME, not the mechanism it should copy; naming an implementation the layer cannot reach makes the sentence unverifiable even when the behaviour is right.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec/edge-cases` · harmful: 0
- features: drawing-gestures
- evidence: spec.md:124-125 vs src/drawing/axisLock.ts:57-58 (spec/edge-cases)
- last seen: 2026-08-20T14:46:29Z

### L-011 - A tie-breaking rule must be written in the same unit the code compares in; a rule stated in domain units but measured in screen units agrees only on a linear scale and parts silently on a logarithmic one.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec/edge-cases` · harmful: 0
- features: drawing-gestures
- evidence: spec.md:121-122 vs src/drawing/magnet.ts:59-61 (spec/edge-cases)
- last seen: 2026-08-20T14:46:29Z

### L-012 - Do not mark a conditional requirement Done when the implementation makes its antecedent unreachable; restate it as the invariant actually enforced.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `spec` · harmful: 0
- features: indicator-library-adoption
- evidence: LANE-02 / example/App.tsx:43 (spec)
- last seen: 2026-08-21T05:25:57Z

### L-013 - When an acceptance criterion conjoins two outcomes, assert both by value; covering only the first conjunct leaves the second uncovered.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `tests` · harmful: 0
- features: indicator-library-adoption
- evidence: IDENT-02 / test/chartWorkspace.spec.tsx:1184 (tests)
- last seen: 2026-08-21T05:26:04Z

### L-014 - A fingerprint regenerated from the dependency it checks detects drift, never a defect already present in the pinned version; pair it with an independent oracle before claiming correctness.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `vendor` · harmful: 0
- features: indicator-library-adoption
- evidence: sensor mutation 18 / scripts/indicator-proof.mjs:560 (vendor)
- last seen: 2026-08-21T05:26:04Z

### L-015 - Scope every acceptance criterion to a subject this repository can gate; a criterion about an out-of-repository consumer cannot be closed by an in-repository proxy.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec` · harmful: 0
- features: indicator-library-adoption
- evidence: APP-02 / .specs/features/indicator-library-adoption/spec.md (spec)
- last seen: 2026-08-21T05:26:04Z

### L-016 - A guard that refuses an undeclared CHANGE must also refuse a DELETED baseline entry, or removing the reference is a cheaper bypass than forging it.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `gates` · harmful: 0
- features: indicator-library-adoption
- evidence: validation.md Fix 1 / scripts/indicator-proof/value-ledger.mjs:90 (gates)
- last seen: 2026-08-21T06:27:10Z

### L-017 - When an acceptance criterion is rewritten, write its new Independent Test in the same task; a restated criterion with no new assertion has relocated the gap, not closed it.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `spec` · harmful: 0
- features: indicator-library-adoption
- evidence: validation.md Fix 2 / LANE-02 / .specs/features/indicator-library-adoption/spec.md:228 (spec)
- last seen: 2026-08-21T06:27:18Z

### L-018 - Assert the invariant on the value the consumer actually reads, not only on the helper that computes it; a unit test on the helper does not pin the caller still using it.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `tests` · harmful: 0
- features: indicator-library-adoption
- evidence: validation.md mutation M-R / src/indicator/resolution.ts:78 (tests)
- last seen: 2026-08-21T06:27:18Z

### L-019 - State a defence's residual hole by the effort it actually costs an attacker; an admission that overstates the cost reads as closed to the next reader.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `docs` · harmful: 0
- features: indicator-library-adoption
- evidence: validation.md Fix 3 / scripts/indicator-proof/value-ledger.mjs:24-25 (docs)
- last seen: 2026-08-21T06:27:25Z

### L-020 - A criterion that publishes a formula must name the precondition under which it holds, or the test can only assert the code's number while the sentence claims a different meaning.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec-writing` · harmful: 0
- features: indicator-library-adoption
- evidence: .specs/features/indicator-library-adoption/spec.md:225 (spec-writing)
- last seen: 2026-08-21T07:18:58Z

### L-021 - Assert the accepting branch of a refusal rule, not only its rejecting branches: an escape hatch that stops working fails closed and so no test ever reports that the documented path died.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `scripts/` · harmful: 0
- features: indicator-library-adoption
- evidence: scripts/indicator-proof/value-ledger.mjs:115 (scripts/)
- last seen: 2026-08-21T07:18:58Z

### L-022 - When a pixel check counts a hue, prove the hue is exclusive to the channel under test: two channels of the same study can write the same colour, turning an existence test into a permanent pass.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `e2e/pixel-assertions` · harmful: 0
- features: indicator-render-fidelity
- evidence: M5 :: scripts/e2e-demo.mjs:1419 (e2e/pixel-assertions)
- last seen: 2026-08-22T04:55:32Z

### L-023 - Re-run every earlier deletion control at the end of the phase, not only when it is written: a later task in the same phase can silently disarm an earlier task's sensor.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `process/deletion-controls` · harmful: 0
- features: indicator-render-fidelity
- evidence: M5 :: 37b1190 disarmed 39d5083 (process/deletion-controls)
- last seen: 2026-08-22T04:55:32Z

### L-024 - A host module that narrows vendor data needs its own suite; the end-to-end pixel check downstream of it cannot see the narrowing being deleted.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `host/adapters` · harmful: 0
- features: indicator-render-fidelity
- evidence: M20 :: example/studyMarks.ts (host/adapters)
- last seen: 2026-08-22T04:55:32Z

### L-025 - Assert a declared constant on the production object, not only on a synthetic probe through the seam: testing the mapping proves the seam, never the value the real object declares.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `overlays` · harmful: 0
- features: indicator-render-fidelity
- evidence: M16 :: example/bandOverlay.ts:159 (overlays)
- last seen: 2026-08-22T04:55:32Z

### L-026 - When a generator gains a rule that withdraws rows, pin the row count or require a written ledger entry per withdrawal - exempting self-refused ids from the vanished-id guard removes the only ratchet on catalogue size.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `generators/refusal` · harmful: 0
- features: indicator-render-fidelity
- evidence: M19b :: scripts/build-indicator-manifest.mjs:329 (generators/refusal)
- last seen: 2026-08-22T04:55:32Z

### L-027 - An AC about a specific object must be traced to that object; a test of the mechanism it travels through is evidence for the mechanism only.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `spec/acs` · harmful: 0
- features: indicator-render-fidelity
- evidence: FILL-03 :: spec.md:74 (spec/acs)
- last seen: 2026-08-22T04:55:43Z

### L-028 - Do not word an AC as an equality the catalogue-wide check can only verify as an inequality; either narrow the wording or add the case that measures the equality.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec/wording` · harmful: 0
- features: indicator-render-fidelity
- evidence: LINES-03 :: spec.md:95 (spec/wording)
- last seen: 2026-08-22T04:55:43Z

### L-029 - Never shrink a deliverable on the authority of an assumption row marked unconfirmed while a confirmed row points the other way: surface the conflict to the owner instead of resolving it in code.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `spec/assumptions` · harmful: 0
- features: indicator-render-fidelity
- evidence: spec.md:47 (Confirmed=n) vs spec.md:39 (Confirmed=y) (spec/assumptions)
- last seen: 2026-08-22T04:55:43Z

### L-030 - Re-measure a defect narrative against the vendor result before writing it into the spec: the Ichimoku Kumo is bicoloured by two fills, not by the per-bar colors[] the spec blames.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec/measurements` · harmful: 0
- features: indicator-render-fidelity
- evidence: spec.md:40 vs measured vendor result for ichimoku (spec/measurements)
- last seen: 2026-08-22T04:55:43Z

### L-031 - A refusal rule that lives inside a build script is unguarded unless a test runs the script: unit-testing the pure predicate proves the rule works, never that the script still calls it.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `scripts/,build-time ledgers` · harmful: 0
- features: indicator-render-fidelity
- evidence: scripts/build-indicator-manifest.mjs:345 (mutant G4f: guard call site deleted, npm test 1478/1478, proof 33/33, --check OK) (scripts/,build-time ledgers)
- last seen: 2026-08-22T06:23:18Z

### L-032 - Before deleting a guard as subsumed, state the caller precondition the survivor now depends on and test it: Set.has uses SameValueZero, so membership subsumes a finiteness check only while the set itself is finite.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `example/,narrowing` · harmful: 0
- features: indicator-render-fidelity
- evidence: example/studyMarks.ts:60 (Number.isFinite removed as subsumed by Set membership) (example/,narrowing)
- last seen: 2026-08-22T06:23:18Z

### L-033 - A guard keyed on 'the committed artefact still declares it' is defeated by any sanctioned path that removes the declaration; when a second ledger can retire that evidence, the guard must read that ledger too.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `ledger,integrity-gates` · harmful: 0
- features: indicator-render-fidelity
- evidence: scripts/indicator-proof/value-ledger.mjs:316 (ledger,integrity-gates)
- last seen: 2026-08-22T19:30:42Z

### L-034 - When a merge concatenates two independently-owned collections, assert the ORDER as well as the membership: each side's own suite dies on its own half and neither notices a swap.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `react,composition` · harmful: 0
- features: indicator-render-fidelity
- evidence: src/react/workspace/CanvasSurface.tsx:74 (react,composition)
- last seen: 2026-08-22T19:30:42Z

### L-035 - A spec that pins ordering STABILITY across redraws still leaves the ordering ITSELF undefined; name which producer draws over which, or say the order is deliberately unspecified.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `overlays,z-order` · harmful: 0
- features: indicator-render-fidelity
- evidence: spec.md:194 (overlays,z-order)
- last seen: 2026-08-22T19:30:42Z

### L-036 - Two features that meet in one expression need a test that switches BOTH on; suites deliberately scoped to one side leave the conjunction covered only by whatever shape the demo happens to have.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `testing,conjunction` · harmful: 0
- features: indicator-render-fidelity
- evidence: test/workspaceOverlays.spec.tsx:60 (testing,conjunction)
- last seen: 2026-08-22T19:30:42Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
