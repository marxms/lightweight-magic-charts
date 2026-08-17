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
| AD-008 | How many drawing families a rail carries is the HOST's decision | The rail draws one button per family. Handing it all ten overloaded a 28px strip, and changing the library to absorb that was the wrong lever — it escaped the palette |

## Handoff

**Branch:** `feat/standalone-library`, pushed, tree clean at `32fa49e`. PR #1 open against master.

**Green:** `npm test` 100 suites / 1200 tests · `npm run e2e` 41/41 · `node scripts/size-gate.mjs` exit 0 · `node scripts/verify-package-paths.mjs` exit 0.

**Next step:** DESIGN for `.specs/features/drawing-gestures/spec.md` (approved). Its one open
question is already closed by measurement — the time axis is quantised to bars, so the magnet is a
PRICE feature. Design has to decide: where the mode lives on the drawing seam, how the snap
threshold is expressed, and how the axis lock reaches `realChartOf` from inside the binding.

**The anchor-drag fix already exists**, proven, at
`~/dev/cripto_bot_mcp/shooting-for-the-moon-streamer/apps/web/src/config/chartDrawings.ts:233-274`.
Port it rather than re-derive it; its docblock explains why the trigger has to be the anchor
hit-test.

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
