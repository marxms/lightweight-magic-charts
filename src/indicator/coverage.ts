/**
 * What the load actually delivered, per pane — never telemetry.
 * See docs/explanation/indicator.md#coverage-is-not-telemetry
 */

import type { ReadingSeries, WorkspaceRow } from './rows';

/** A series as a report reads it: the field it draws, and the name it is missing under. */
export interface ReportedSeries {
  readonly spec: { readonly label: string };
  readonly source: { readonly field: string };
}

export interface ReportedPane {
  readonly series: readonly ReportedSeries[];
}

export interface WorkspaceReport {
  readonly candles: number;
  readonly indicators: number;
  readonly loadMs: number | null;
  /** Buckets carrying an open-interest reading, as a share of the window. */
  readonly openInterest: number;
  /** Buckets with a rate IN FORCE — every bucket from the first settlement onward. */
  readonly funding: number;
  readonly settlements: number;
  /** Catalogue series this instance draws that arrived with no reading at all. */
  readonly missing: readonly string[];
}

export function buildWorkspaceReport(
  rows: readonly WorkspaceRow[],
  indicators: ReadingSeries | null,
  drawnPanes: readonly ReportedPane[],
  loadMs: number | null,
): WorkspaceReport {
  const named = new Set<string>();
  for (const snapshot of indicators?.data ?? []) {
    for (const entry of snapshot.indicators ?? []) {
      if ((entry.values ?? []).length > 0) named.add(entry.name);
    }
  }

  const has = (field: string): boolean =>
    rows.some((row) => typeof row[field] === 'number' && Number.isFinite(row[field] as number));

  const withOi = rows.filter((row) => typeof row.openInterestBase === 'number').length;
  const settlements = rows.filter((row) => typeof row.fundingRate === 'number').length;
  const firstFunding = rows.findIndex((row) => typeof row.fundingRate === 'number');
  const withFunding = firstFunding < 0 ? 0 : rows.length - firstFunding;

  return {
    candles: rows.length,
    indicators: named.size,
    loadMs,
    openInterest: withOi,
    funding: withFunding,
    settlements,
    missing: drawnPanes.flatMap((pane) =>
      pane.series.filter((bound) => !has(bound.source.field)).map((bound) => bound.spec.label),
    ),
  };
}

export function formatWorkspaceReport(report: WorkspaceReport): string {
  const share = (count: number): string =>
    report.candles === 0 ? '—' : `${Math.round((count / report.candles) * 100)}%`;
  const parts = [
    `${report.candles} velas`,
    `${report.indicators} indicadores`,
    report.loadMs === null ? null : `carga ${Math.round(report.loadMs)} ms`,
    `cobertura OI ${share(report.openInterest)}`,
    `funding ${share(report.funding)} (${report.settlements} settlements)`,
    report.missing.length === 0 ? null : `SEM DADO: ${report.missing.join(', ')}`,
  ];
  return parts.filter((part): part is string => part !== null).join(' · ');
}
