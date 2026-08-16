# Keep tabs between visits

**The question:** the reader arranges four tabs, reloads, and they are gone. Where do I turn storage
on?

`tabs.store`. Without one, tabs live for the session and die on unmount — including on a fullscreen
dialog that unmounts on exit, which is where this is usually first noticed. The library touches no
platform on purpose; the argument is in [`../explanation/tabs.md`](../explanation/tabs.md).

## Step 1 — give it somewhere to write

A `WorkspaceStore` is two functions over a string. The package never parses what it wrote back to
you — `read` returning `null` means "nothing saved", and anything else is handed to the codec.

```ts
import type { WorkspaceStore } from 'lightweight-magic-charts';

const KEY = 'my-product.chart-tabs';

export const store: WorkspaceStore = {
  read: () => {
    try {
      return window.localStorage.getItem(KEY);
    } catch {
      // Private mode, a quota, a blocked third-party context: unreadable storage is a legitimate
      // state, and `null` means the workspace opens on the defaults instead of failing to mount.
      return null;
    }
  },
  write: (payload: string) => {
    try {
      window.localStorage.setItem(KEY, payload);
    } catch {
      // Nothing to do here but keep the session alive. A throw would take the workspace with it.
    }
  },
};
```

Storage is not restricted to the browser: a `read`/`write` pair over your own API, a file, or a
per-account record works the same way. It has to be synchronous, because the tab reducer is.

## Step 2 — stamp a version, and migrate what an older build wrote

`version` is written into the payload. When a stored record carries a different one, `migrate` is
asked to make sense of it and answering `null` is the honest option: the workspace opens on the
defaults and says so through the `unreadableTabs` notice, rather than restoring half a layout.

```ts
import type { TabsState, WorkspaceSetup } from 'lightweight-magic-charts';

export const migrate = (record: Record<string, unknown>): TabsState<WorkspaceSetup> | null => {
  const tabs = record.tabs;
  if (!Array.isArray(tabs)) return null;
  // Version 1 stored one setup and no tab list. Wrap it, name it, keep the rest of the defaults.
  const first = tabs[0] as { readonly setup?: WorkspaceSetup } | undefined;
  if (first?.setup === undefined) return null;
  return { tabs: [{ id: 'restored', name: 'Restored', setup: first.setup }], active: 0 };
};
```

Raise `version` whenever the *shape* of a setup changes. Leaving it still and changing the shape is
how a reader ends up with a layout that half-loads: the record parses, the codec fills what it
recognises, and the missing half is silently a default.

## Step 3 — let a tab set leave the machine

The tab bar offers export and import. Import reads a file the reader chose and is handled for you;
export needs somewhere to send the bytes, and writing a file is a platform act, so it is yours. Wire
`tabs.onExport` and do the download in your own shell.

```ts
import type { WorkspaceExporter } from 'lightweight-magic-charts';

export const exporter: WorkspaceExporter = {
  download: (filename: string, payload: string) => {
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  },
};
```

## Step 4 — mount it

```ts
import type { ChartWorkspaceProps, TabsState, WorkspaceSetup, WorkspaceStore } from 'lightweight-magic-charts';

declare const store: WorkspaceStore;
declare const migrate: (record: Record<string, unknown>) => TabsState<WorkspaceSetup> | null;

/** HOISTED. A new object per render is a new store identity, and the tabs reload under the reader. */
export const TABS: ChartWorkspaceProps['tabs'] = {
  store,
  version: 2,
  migrate,
  onExport: () => undefined,
};
```

Then `<ChartWorkspace … tabs={TABS} />`.

## What you get for it

- Tabs survive a reload, a remount and a fullscreen round trip.
- A payload written by an older build either migrates or is refused loudly — the workspace says the
  saved layout could not be read instead of opening a half-restored one.
- The reader can carry a layout to another machine as a file.

And what you do not get: the library still never reaches for storage on its own, so a build that
ships without `store` behaves exactly as before rather than quietly starting to write. For the
signature of everything named here, see [`../reference/_index.md`](../reference/_index.md).
