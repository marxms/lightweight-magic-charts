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
| AD-009 | A drawing gesture is SPLIT at the line where engine knowledge begins: the library owns the mechanism, the binding owns one predicate | The proven anchor-drag fix triggers on `hitTestAnchor`, an API of `lightweight-charts-drawing`. Owning the gesture outright would mean importing a drawing engine and breaking the zero-dependency manifest; leaving it to the host means every binding re-derives the same lock. `DrawingLayer.anchorAt?` is the whole of the engine-specific residue |
| AD-010 | The magnet's threshold is a SCREEN distance, not a price distance | A price-unit tolerance means something different at 60 000 than at 0.4, and different again after a zoom. `SeriesHandle.priceToCoordinate` is already on the port, so pixels cost no new port surface |
| AD-008 | How many drawing families a rail carries is the HOST's decision | The rail draws one button per family. Handing it all ten overloaded a 28px strip, and changing the library to absorb that was the wrong lever — it escaped the palette |

## Handoff

**Branch:** `feat/standalone-library`, tree clean at `b75e0a5`. PR #1 open against master.
**Green, measured:** `npm test` 103 suites / 1255 tests · `node scripts/size-gate.mjs` exit 0 ·
`node scripts/verify-package-paths.mjs` exit 0 · `npm run e2e` 41/41 (baseline; the feature's own
e2e checks are T12, unrun).

**The 0.1.1 reseed work is COMMITTED** (`2817b49`). It had been left unstaged AND unmeasured — its
own 8 tests passed while the size gate was red, because the repair grew the bundle and neither
ledger was re-pinned. Both re-pinned with named reasons in the same commit.

**drawing-gestures: 17 of 20 tasks done.** T1-T10 and T14-T20 are committed. Phase 6 (T14-T20) came
out of an adversarial review of batch 1 that raised 16 findings and confirmed 12.

**The review's headline, and it is a method lesson:** `DrawingRailProvider`'s wrapper silently
dropped `anchorAt`, so `attachAxisLock` never attached through `ChartWorkspace` — DRAG-01, the whole
reason the feature exists, was inert with 1234 tests green and every gate passing. Fixed in
`948f055`. The suite tests these modules in isolation and almost never through the composition a
host actually mounts. **T12's browser check is load-bearing, not a formality.**

**BLOCKED: T11, and it needs the owner.** The magnet's control cannot reach a host as designed.
`example/App.tsx` would need `useDrawingRail()`, the demo imports the package BY NAME through the
`exports` map, and publishing that hook fails `test/chartWorkspace.spec.tsx:1109`
(`composedExports(indexText)` must equal `['ChartWorkspace']`). A judge panel scored four routes and
recommends the rail drawing the magnet itself, with the host supplying only the word through
`DrawingToolbarLabels` — the pattern the rail already uses for cursor, delete-selection and
clear-all. It is BREAKING for a published type, which is why it waits.

**Correct an error before reusing it:** the entry DOES publish hooks — `useHoverDismiss` and
`useHoverIntent` (`src/index.ts:277-282`), under a written principle at
`entry.md#pointer-intent-is-published`. A grep for `^export {.*use[A-Z]` misses them because the
export spans lines.

**Open, not blocking:**

1. **New defect, tested and deliberately not fixed:** the axis lock releases on `blur`, the price
   alert layer does not. A tab switch mid-gesture frees the axes with an alert drag still in flight.
   Reachable with no drawing layer at all, so it is the alert layer's defect and deserves its own
   task. Recorded in `test/priceAlertLayer.spec.tsx`.
2. `test/gates/sizeBudget.spec.ts` fails in a fresh worktree because `dist/` is absent — three
   reviewers hit it independently. A real CI trap nobody has filed.
3. The gates cite AD-011, AD-012 and AD-016, but this table stops at AD-010. The decision log and
   the gates disagree about what has been decided.
4. The price legend labels overlay studies `Study` and shows `—` for unoccupied slots.
5. A lane series is always `shape: 'line'` (`src/catalogue/lanes.ts:38`).
6. The `ecc-tools/lightweight-magic-charts-1786905841474` branch is still on the remote.
7. After publish, move to npm trusted publishing and revoke the token.
