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

**Branch:** `feat/standalone-library`. PR #1 open against master. **Tree is NOT clean** — see below.

**Uncommitted, and not mine:** a complete, green `0.1.1` reseed fix is sitting unstaged —
`src/port/seedTransaction.ts`, `src/port/scopeMachine.ts`, `src/react/CompactCell.tsx`,
`src/react/useCandleLane.ts`, `test/reseed.spec.ts` (untracked), plus CHANGELOG, two docs and the
version bump. `npx jest test/reseed.spec.ts` is 8/8. It belongs to a session that ended before
committing. **It must be committed or stashed before drawing-gestures executes** — the Verifier's
discrimination sensor needs a porcelain baseline it can restore to.

**drawing-gestures is through DESIGN and TASKS.** `spec.md` amended (MAGNET-02/03/04 now say
"resolve the anchor's price to", because the library owns the rule and the binding owns the
placement — the old wording asked for something the architecture forbids). `design.md` written,
`tasks.md` written: 13 tasks / 5 phases, `validate_spec` exit 0, `validate_tasks` exit 0.

**Next step:** owner approval of `tasks.md`, then Execute in 2 batches (T1-T7, T8-T13), then the
Verifier. Skills declared per task: `ecc:react-patterns` (T5, T6, T8, T9), `ecc:e2e-testing` (T12).

**Two gates constrain every task and are easy to trip:** `commentBudget.spec.ts` fails any
`docs/<file>.md#<anchor>` written in `src/` that does not resolve to a real heading — which is why
T1 writes the prose first — and `fileSize.spec.ts` caps a `src/` file at 350 code lines.

**Open, not blocking, and belonging to the library rather than the example:**

1. The price legend labels overlay studies `Study` and shows `—` for unoccupied slots.
   `resolveSources` fills a labels map that `laneViews` applies through `relabelled`; the price pane
   gets no such pass.
2. A lane series is always `shape: 'line'` (`src/catalogue/lanes.ts:38`), so a source's declared
   shape and colour never reach a lane.
3. The `ecc-tools/lightweight-magic-charts-1786905841474` branch is still on the remote. PR #2 is
   closed; the branch deletion was refused by the tool classifier and needs the owner.
4. After `0.1.0` publishes, move to npm trusted publishing and revoke the token — it can only be
   configured once the package exists.
