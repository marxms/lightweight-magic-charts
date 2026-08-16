/**
 * The catalogue split into families — list arithmetic, no React and no DOM.
 * See docs/explanation/react.md#the-leftover-family
 */

/** An entry of the COMPLETE catalogue — all the host's registry has beyond the curated rail. */
export interface DrawingToolOption {
  readonly id: string;
  readonly name: string;
  /** THE FAMILY KEY. Absent or undeclared = the leftover family, so grouping never costs reach. */
  readonly group?: string;
  readonly shortcut?: string;
}

/** A family DECLARED BY THE HOST: the array's order is the order in the rail. */
export interface DrawingToolGroup {
  readonly id: string;
  readonly label: string;
  readonly glyph: string;
}

export interface DrawingToolBucket extends DrawingToolGroup {
  readonly options: readonly DrawingToolOption[];
}

/** The `id` of the leftover family. Reserved, hence shaped the way a host would not write it. */
export const LEFTOVER_BUCKET_ID = '__other__';

export interface DrawingBucketLabels {
  readonly allTools: string;
  readonly otherTools: string;
}

export function bucketDrawingTools(
  options: readonly DrawingToolOption[],
  groups: readonly DrawingToolGroup[],
  labels: DrawingBucketLabels,
): readonly DrawingToolBucket[] {
  const declared = new Map(groups.map((group) => [group.id, [] as DrawingToolOption[]]));
  const leftovers: DrawingToolOption[] = [];
  for (const option of options) {
    const bucket = option.group === undefined ? undefined : declared.get(option.group);
    if (bucket === undefined) leftovers.push(option);
    else bucket.push(option);
  }

  // See docs/explanation/react.md#empty-families-are-not-triggers
  const buckets = groups
    .map((group) => ({ ...group, options: declared.get(group.id) ?? [] }))
    .filter((bucket) => bucket.options.length > 0);
  if (leftovers.length === 0) return buckets;
  return [
    ...buckets,
    {
      id: LEFTOVER_BUCKET_ID,
      label: groups.length === 0 ? labels.allTools : labels.otherTools,
      glyph: '⋯',
      options: leftovers,
    },
  ];
}
