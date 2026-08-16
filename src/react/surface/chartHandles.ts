// THE CHART HANDLES — the seven things the mount creates, published as ONE object of state.
// See docs/explanation/react-surface.md#why-seven-refs-do-not-work

import type { MutableRefObject } from 'react';

import type { ChartCreation } from '../../render/seriesFactory';

export type ChartHandles = ChartCreation;

/** The synchronous view of the handles. Never read during the render: that is the state's job. */
export type LiveHandles = MutableRefObject<ChartHandles | null>;

/** Publishes on mount, and zeroes on teardown. One writer only, so the two views never disagree. */
export type PublishHandles = (next: ChartHandles | null) => void;
