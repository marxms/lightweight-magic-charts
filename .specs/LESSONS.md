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
- evidence: MAGNET-03 spec.md:89-90 (boundary silent) and spec.md:122-123 (tie named in price units while magnet.ts:59 measures pixels) (.specs/,thresholds)
- last seen: 2026-08-20T12:59:33Z

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
- evidence: .specs/features/drawing-gestures/spec.md:124-125 (.specs/,edge-cases)
- last seen: 2026-08-20T13:53:11Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
