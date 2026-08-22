/** A plottable source: above a series provider. See docs/explanation/catalogue.md#why-not-widen-seriesprovider */

import type { SeriesSpec } from '../domain/types';
import type { SeriesProvider } from '../extension/plugins';

export interface PlottedSeries {
  readonly spec: SeriesSpec;
  readonly provider: SeriesProvider;
}

/** Where a source ASKS to be drawn. See docs/explanation/catalogue.md#placement-is-a-request */
export type PlacementRequest = 'own-pane' | 'over-price';

/** An entry that owns drawn-spec/provider pairs and asks to be placed somewhere. */
export interface PlottableSource {
  readonly id: string;
  readonly label: string;
  readonly placement: PlacementRequest;
  readonly guide?: number;
  series(): readonly PlottedSeries[];
}

/** The only way in: one id, one answer. See docs/explanation/catalogue.md#the-catalogue-enters-as-a-lookup */
export type SourceLookup = (id: string) => PlottableSource | undefined;

/** What the resolver may assume. See docs/explanation/catalogue.md#the-policy-is-data-not-constants */
export interface ResolutionPolicy {
  readonly lanes: number;
  readonly priceNeighbourhood: number;
  readonly warmUpShare: number;
}

/** Measured against one installed catalogue. See docs/explanation/catalogue.md#the-calibrated-ratios */
export const CALIBRATED_PRICE_NEIGHBOURHOOD = 3;
export const CALIBRATED_WARM_UP_SHARE = 0.5;

export type ResolutionPolicyOptions = Pick<ResolutionPolicy, 'lanes'> &
  Partial<Omit<ResolutionPolicy, 'lanes'>>;

export function resolutionPolicy(options: ResolutionPolicyOptions): ResolutionPolicy {
  return {
    lanes: options.lanes,
    priceNeighbourhood: options.priceNeighbourhood ?? CALIBRATED_PRICE_NEIGHBOURHOOD,
    warmUpShare: options.warmUpShare ?? CALIBRATED_WARM_UP_SHARE,
  };
}
