# Project memory

## Decisions

| ID | Decision | Why |
| --- | --- | --- |
| AD-001 | Master is the default branch; work enters through a pull request | Owner's directive. Verifying `default_branch` on the API caught a CI workflow gated on `main`, which meant the branch that ships was never gated |
| AD-002 | The release is driven by the version in the manifest, on merge to master — not by a tag | Publishing on every merge would fail on npm's duplicate refusal, painting routine merges red for the one reason that is not a defect. The version bump is the release act, reviewed in the pull request |
| AD-003 | Tags and GitHub Releases are records written AFTER a successful publish, never triggers | GitHub does not start workflow runs from events raised with the default `GITHUB_TOKEN`, so a tag-triggered release would look configured and never run |
| AD-004 | The demo deploys from the published version, not from master | A page ahead of the package teaches an API `npm install` does not hand you |
| AD-005 | Actions are pinned by commit, not by tag | `release.yml` runs them in the job holding `NPM_TOKEN`; a repointed tag there is a supply-chain compromise |
| AD-006 | The example authors its own indicators rather than adopting `lightweight-charts-indicators` | An architect refuted the proposal: the page's thesis is that the host computes. The package also carries four defects catalogued in the streamer's own tests and declares `version = "0.4.0"` inside its 0.5.0 `.d.ts` |
| AD-007 | The E2E suite drives `playwright-core` directly, in its own CI job | A second test runner would force a browser download three times across the Node matrix for assertions that do not vary by Node |
| AD-017 | The magnet is a control the RAIL draws and the host NAMES — not a published hook, not a prop pair | The rail already draws three fixed controls it authors entirely — cursor, delete-selection, clear-all — each with its glyph from the library and its word from `DrawingToolbarLabels`. The magnet is that same shape, and it is where every charting product puts it. Publishing `useDrawingRail` would freeze ten members of `DrawingRailValue` as public API to hand a host one boolean, and the hook throws outside a provider the host cannot mount, so its only legal call site is `children`, below the chart — the library keeping composition and handing the host the drawing. Executing this hit `propCount`'s ceiling at 12/12 on `DrawingToolbarProps`, forcing the three edit props into one group: the gate producing a better shape rather than being edited. AD-008 is NOT the precedent for handing the control away — it ruled on how many drawing FAMILIES a rail carries, because ten overloaded a 28px strip; it never reached fixed controls |
| AD-018 | A host-supplied reader that returns `null` falls back; one that THROWS refuses | `null` is an answer the port documents — that pane has no widget yet — and refusing on it would reintroduce the very defect the axis lock exists to fix. A throw is a failure to answer, and the only known thrower is `chart.panes()` on a disposed chart; keeping the container would then reach `applyOptions` on that same disposed chart one line below and put the crash back in the page |
| AD-009 | A drawing gesture is SPLIT at the line where engine knowledge begins: the library owns the mechanism, the binding owns one predicate | The proven anchor-drag fix triggers on `hitTestAnchor`, an API of `lightweight-charts-drawing`. Owning the gesture outright would mean importing a drawing engine and breaking the zero-dependency manifest; leaving it to the host means every binding re-derives the same lock. `DrawingLayer.anchorAt?` is the whole of the engine-specific residue |
| AD-010 | The magnet's threshold is a SCREEN distance, not a price distance | A price-unit tolerance means something different at 60 000 than at 0.4, and different again after a zoom. `SeriesHandle.priceToCoordinate` is already on the port, so pixels cost no new port surface |
| AD-008 | How many drawing families a rail carries is the HOST's decision | The rail draws one button per family. Handing it all ten overloaded a 28px strip, and changing the library to absorb that was the wrong lever — it escaped the palette |

## Handoff

**drawing-gestures is DONE and verified.** Branch `feat/drawing-gestures`, PR open against master.

**Verdict:** independent Verifier PASS on iteration 3 of a loop bounded at 3 — 59 mutations, 58
killed, 1 adjudicated equivalent. 13/13 requirements. `validate_state.py` exits 0.

**Green, measured directly and not quoted:** `npm test` 103 suites / 1276 tests · `npm run e2e`
48/48 · `node scripts/size-gate.mjs` exit 0, entry 104932 · `node scripts/verify-package-paths.mjs`
exit 0. `package.json` is `0.2.0`.

**Two declared breaking changes, verified as the complete set** by diffing the public surface symbol
by symbol: 290 → 295 exports, zero removed, 7 signatures changed, of which two break —
`DrawingToolbarProps` regrouping into `edits` (forced by `propCount` at 12/12) and
`DrawingSurfaceHost.snapPrice` (breaks only a host that FABRICATES the host object in its own tests;
production code constructs it nowhere).

**The lesson of this feature, five times over:** an optional member vanishes with no type error and
nothing notices — `anchorAt` dropped by the rail wrapper, the `magnet` group never forwarded, every
magnet fixture on a 1px-per-price scale, the preview clause with no sensor, the `pricePane` wiring.
Each one passed a full green suite. The sixth was hunted deliberately in iteration 3 — 30 optional
members and host callbacks deleted or stubbed in a scratch worktree — and does not exist. **Test
through the composition a host actually mounts, not through a probe.**

**Three follow-ups. None blocks the release; all are the owner's call.**

1. **`PROVISIONAL_ENTRY_LIMIT` now behaves like a live budget.** Entry 104932, ceiling 104994, margin
   **62 B**. Nothing breaks a rule, but the docblock at `test/gates/sizeBudget.spec.ts:41-48` calls
   the number "the highest the entry limit was ever allowed to reach… so the descent is checkable"
   and `:423-428` says "the growth is over" — and this feature re-pinned the entry UP fourteen times
   and down once. The prose and the ledger now disagree. **Do not raise the ceiling**; either correct
   the prose or find real shrinkage before the next feature.
2. **`scripts/size-gate.mjs` depends silently on a fresh `dist/`.** It exits 1 against a stale build,
   discarding measurements with bundler warnings. Failed safe, and CI always builds first, but the
   message should say "run `npm run build:esm`".
3. **Three stale internal citations** (comments and test titles only): `test/drawingSeam.spec.tsx:248`,
   `test/chartSurface.spec.tsx:855`, `test/axisLock.spec.ts:284`.

**Housekeeping:** `.specs/lessons.json` carries L-009 and L-010 as near-duplicates of L-005 and
L-008 — the Verifier's own normalizer missed on a reworded call and it flagged this rather than
hand-editing a machine-owned file. `lessons.py` has no delete; `prune` drops stale candidates only.

**`release/0.1.1` is now subsumed.** Its single commit `2817b49` is an ancestor of this branch, and
the version has moved to 0.2.0. Close that branch rather than merging it twice.

**Older, still open, unrelated to this feature:**

1. The price legend labels overlay studies `Study` and shows `—` for unoccupied slots.
2. A lane series is always `shape: 'line'` (`src/catalogue/lanes.ts:38`).
3. The `ecc-tools/lightweight-magic-charts-1786905841474` branch is still on the remote; PR #3 open.
4. Five Dependabot PRs (#4-#8) open against master.
5. After publish, move to npm trusted publishing and revoke the token.
6. The gates cite AD-011, AD-012 and AD-016, but the decision table jumps from AD-010 to AD-017.
