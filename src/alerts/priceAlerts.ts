/**
 * A level the user put on the chart, with a label on the axis and an alert on the crossing.
 *
 * The rule this file exists to get right: an alert fires on the TRANSITION, not on the side.
 * See docs/explanation/alerts.md#firing-on-the-transition-not-on-the-side
 */

import type { PriceLineHandle, SeriesHandle } from '../port/chartApi';

export type AlertSide = 'above' | 'below';

export interface PriceAlert {
  readonly id: string;
  readonly price: number;
  /** Which side the last observed price was on. `null` = nothing observed since it was armed. */
  readonly side: AlertSide | null;
  /** Fired since the last arming. Cleared by moving the line. */
  readonly triggered: boolean;
}

export interface AlertObservation {
  readonly alerts: readonly PriceAlert[];
  /** The ones that JUST crossed. Empty on every bar that did not change a side. */
  readonly crossed: readonly PriceAlert[];
}

/**
 * Which side of the level a price sits on. Exactly ON the level counts as `above`.
 * See docs/explanation/alerts.md#ties-on-the-level
 */
export function sideOf(price: number, level: number): AlertSide {
  return price >= level ? 'above' : 'below';
}

/** A level that has just been placed or moved: no side observed, nothing fired. */
export function armAlert(alert: PriceAlert, price: number): PriceAlert {
  return { ...alert, price, side: null, triggered: false };
}

export function observePrice(
  alerts: readonly PriceAlert[],
  price: number,
): AlertObservation {
  // A non-finite reading is not an observation. See docs/explanation/alerts.md#non-finite-prices-are-not-observations
  if (!Number.isFinite(price)) return { alerts, crossed: [] };

  const crossed: PriceAlert[] = [];
  const next = alerts.map((alert) => {
    const side = sideOf(price, alert.price);
    const fires = alert.side !== null && side !== alert.side && !alert.triggered;
    const updated: PriceAlert = { ...alert, side, triggered: alert.triggered || fires };
    if (fires) crossed.push(updated);
    return updated;
  });
  return { alerts: next, crossed };
}

export interface PriceAlertStyle {
  readonly idleColor: string;
  readonly draggingColor: string;
  readonly firedColor: string;
  readonly lineWidth: 1 | 2 | 3 | 4;
  readonly draggingLineWidth: 1 | 2 | 3 | 4;
  /** The axis label. Takes the alert so a host can say "fired" in its own language. */
  readonly label: (alert: PriceAlert) => string;
}

export const DEFAULT_PRICE_ALERT_STYLE: PriceAlertStyle = {
  idleColor: '#2962FF',
  draggingColor: '#FFC107',
  firedColor: '#ef5350',
  lineWidth: 2,
  draggingLineWidth: 3,
  // NEVER `alert.id`: it is the bookkeeping key of this class, and it was reaching the price axis
  // as `alert alert-1`.  See docs/explanation/alerts.md#the-axis-label-is-text-never-the-id
  label: (alert) => (alert.triggered ? 'Alert ✓' : 'Alert'),
};

/** How close the pointer has to be, in pixels, to grab a line rather than pan the chart. */
export const ALERT_GRAB_PX = 6;

/** The base library's `LineStyle.Dashed`. An ordinal, because the enum is a value we cannot import. */
const DASHED = 2;

/**
 * The drawn half: one price line per alert, plus the drag.
 * See docs/explanation/alerts.md#the-testable-half-is-not-the-drawn-half
 */
export class PriceAlertLines {
  private readonly handles = new Map<string, PriceLineHandle>();
  private alerts: PriceAlert[] = [];
  private dragging: string | null = null;
  private nextId = 1;

  constructor(
    private readonly series: SeriesHandle,
    private readonly style: PriceAlertStyle = DEFAULT_PRICE_ALERT_STYLE,
  ) {}

  add(price: number): PriceAlert {
    const alert: PriceAlert = {
      id: `alert-${this.nextId++}`,
      price,
      side: null,
      triggered: false,
    };
    this.alerts.push(alert);
    this.handles.set(
      alert.id,
      this.series.createPriceLine({
        price,
        color: this.style.idleColor,
        lineWidth: this.style.lineWidth,
        lineStyle: DASHED,
        axisLabelVisible: true,
        title: this.style.label(alert),
      }),
    );
    return alert;
  }

  remove(id: string): void {
    const handle = this.handles.get(id);
    if (handle !== undefined) this.series.removePriceLine(handle);
    this.handles.delete(id);
    this.alerts = this.alerts.filter((alert) => alert.id !== id);
    if (this.dragging === id) this.dragging = null;
  }

  clear(): void {
    for (const id of [...this.handles.keys()]) this.remove(id);
  }

  /** Highest first, so a list of them reads the way the axis does. */
  all(): readonly PriceAlert[] {
    return [...this.alerts].sort((a, b) => b.price - a.price);
  }

  isDragging(): boolean {
    return this.dragging !== null;
  }

  /** The alert under a vertical pixel, or none. Nearest wins when two lines overlap. */
  hitTest(y: number): PriceAlert | null {
    let best: { alert: PriceAlert; distance: number } | null = null;
    for (const alert of this.alerts) {
      const coordinate = this.series.priceToCoordinate(alert.price);
      if (coordinate === null) continue;
      const distance = Math.abs(coordinate - y);
      if (distance > ALERT_GRAB_PX) continue;
      if (best === null || distance < best.distance) best = { alert, distance };
    }
    return best === null ? null : best.alert;
  }

  beginDrag(y: number): boolean {
    const alert = this.hitTest(y);
    if (alert === null) return false;
    this.dragging = alert.id;
    this.handles.get(alert.id)?.applyOptions({
      color: this.style.draggingColor,
      lineWidth: this.style.draggingLineWidth,
    });
    return true;
  }

  /**
   * Moves the dragged line and RE-ARMS it: a level moved somewhere new has not been crossed yet.
   * `discarding` paints it in the fired colour so the gesture below is visible before it commits.
   */
  dragTo(y: number, discarding = false): number | null {
    if (this.dragging === null) return null;
    const price = this.series.coordinateToPrice(y);
    if (price === null || !Number.isFinite(price)) return null;
    const id = this.dragging;
    this.alerts = this.alerts.map((alert) =>
      alert.id === id ? armAlert(alert, price) : alert,
    );
    const color = discarding ? this.style.firedColor : this.style.draggingColor;
    this.handles.get(id)?.applyOptions({ price, color });
    return price;
  }

  /**
   * `discard` REMOVES the dragged level rather than settling it.
   * See docs/explanation/alerts.md#dragging-a-level-off-the-pane-removes-it
   */
  endDrag(discard = false): void {
    const id = this.dragging;
    this.dragging = null;
    if (id === null) return;
    if (discard) {
      this.remove(id);
      return;
    }
    this.restyle(id);
  }

  /** Feed the last traded price; get back only the alerts that CROSSED on this reading. */
  observe(lastPrice: number): readonly PriceAlert[] {
    const observation = observePrice(this.alerts, lastPrice);
    this.alerts = [...observation.alerts];
    for (const alert of observation.crossed) this.restyle(alert.id);
    return observation.crossed;
  }

  private restyle(id: string): void {
    const alert = this.alerts.find((candidate) => candidate.id === id);
    const handle = this.handles.get(id);
    if (alert === undefined || handle === undefined) return;
    handle.applyOptions({
      color: alert.triggered ? this.style.firedColor : this.style.idleColor,
      lineWidth: this.style.lineWidth,
      title: this.style.label(alert),
    });
  }
}
