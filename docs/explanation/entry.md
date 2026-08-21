# The public entry

The reasoning behind `src/index.ts`: what the entry publishes, what it deliberately does not, and the
measurements behind each absence.

> How this directory is read, and why nothing in it is deleted: [`README.md`](README.md).

## index.ts

### No registry

NOTE WHAT IS ABSENT: there is no `register(name, factory)`, and there will not be one.

Populating a registry requires importing a module for its side effect, which is incompatible with
`sideEffects: false` and kills tree-shaking for every consumer. Extension is by INSTANCE: the consumer
builds the plugin and hands it over. That is also the only model under which "the proprietary
indicators live outside this library" is true by construction rather than by promise.

### The type that had no function

`SeedTransaction` was declared here and never implemented — nothing in the package constructed one,
and the real mechanism is `openScope`, which returns a `Session` and owns the subscription too. A
published type no function accepts is a promise to consumers that cannot be kept, so it is gone and
the design document was reconciled to match.

### Published is what has a consumer

...and nothing more.

The other `pane/budget` symbols — the clamp, the default, the text reader and the two height limits —
stay exported from the MODULE and are tested there; what they do not do is enter the main entry, which
is measured in bytes and has a versioned budget.

The same rule decides two more lines of this file:

- `indicator/availability` publishes its TYPES only. The availability arithmetic is consumed by the
  resolver, and the resolver is what the entry publishes. A type costs no byte in the package; a
  function does, and a function with no consumer is weight.
- The two calibrated numbers of `catalogue/sources` arrive through `resolutionPolicy`, which is the
  only place that writes them; publishing them separately would invite a consumer to copy them over to
  its own side.

### Conformance leaves by a subpath

CONFORMANCE IS NOT HERE, and the absence is the point (LMC-27, LMC-34).

The suite is a TEST harness: whoever consumes it runs a battery against its own adapter, once, in its
own CI. Publishing it through the main entry made every consumer pay for it — almost nine kilobytes
measured inside the entry's bundle — including whoever only wants to draw a chart. It leaves by the
`./conformance` subpath, declared in the manifest's `exports`, and the size sensor now demands ZERO
bytes of `conformance/` in the entry's output file.

    import { CONFORMANCE_CASES } from 'lightweight-magic-charts/conformance';

### The chart port stays React free

Note what is still absent from the import graph: the base library appears in the chart port only as
the structural mirrors of `port/chartApi`, so nothing outside `react/` imports anything at all — which
is the boundary guard's second clause, and what keeps the arithmetic React-free.

### The drawing seam

The interface lives here; the implementation is the consumer's dependency decision. The verdict was
to keep `lightweight-charts-drawing` out of this package's publication path.

`drawing/drawingMemory` is the one module-scope cache this package keeps, and it is published with its
ceiling and its discard policy declared.

### The composed interface

Everything above `react/theme` in this file is usable without a DOM; everything below renders. They
share one entry point because they are one product, and the split that put only the first half in here
is exactly what this entry corrects. `react` is a PEER, so a consumer that imports only the
arithmetic still pulls no React — the boundary guard's second clause pins that.

### Pointer intent is published

Because the HOST also opens boxes under the cursor, and the alternative is it rewriting the same two
delays and the same two refusals — which is exactly how two implementations of the same rule begin to
disagree.

### Body is a component type

`react/chrome/ChromeContext` carries the host's own content region, embedded in the library's chrome.
`Body` is a component TYPE, not a captured tree: a captured tree forces the identity to move on every
interaction, and the context churns with it.

### The composed surface

THE COMPOSED SURFACE lives in `react/surface/` with the rest of its dissolution, and the name moved
with it: `WorkspaceSurface` was the 764-line component with twenty-eight props, and what exists now is
the composition of ten modules with nine groups. Keeping the old name pointing at a different
interface would be the worse of the two options.

### The composed component

`ChartWorkspace` is the only component this entry publishes out of `react/workspace/`. Every other
module of that layer is internal, and a second component leaving it here fails the shell suite.

Two hooks leave that layer beside it, and they are not components: `useWorkspaceSetup` and
`useWorkspaceSetupWriter`. They are the only doors a host's own section body has onto the setup of
the tab that is showing, and that body is a call site the composition already renders inside both
providers. Publishing them freezes nothing new — `WorkspaceSetup` is published above — which is what
separates them from the rail hook this entry still refuses.

The two vocabularies a host hands the composed component — `CandlePatternChoice` and
`DrawingVocabulary` — are declared by the regions that read them, and published as TYPES only: the
regions themselves stay internal. `WorkspaceTabsOptions` is published for the same reason and says
where the tab set is kept between visits; the port itself is `WorkspaceStore`, published further up.

### The two absorbed bindings

They were published only while a consumer kept a workspace composition of its own to call them from;
that file is gone, and `CanvasSurface` is now their single caller. Republishing them would put a hook
on the entry with nobody outside to call it, which is the dead weight the size budget exists to
refuse.

`carryReadings` CHANGED HOUSE, NOT NAME: carrying across a gap is domain vocabulary, and the consumer
that already imported it from here sees no difference at all. `plottedPoints`, which came along in the
same repatriation, is NOT published — no consumer asks for it, and a symbol on the entry with nobody
to consume it is dead weight in the size budget.
