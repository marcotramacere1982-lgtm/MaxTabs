// Horizontal layout of the tab: event spacing by duration, bar widths, and line breaking.
// Pure (no DOM) so it can be unit-tested; tabEditor.ts draws the result.

import { eventTicks } from '../model/editing';
import type { BarDef, TabEvent, TrackBar } from '../model/song';
import type { BarLayout } from '../model/timeline';
import { PPQ } from '../model/time';

export interface EventBox {
  index: number;
  startTick: number;
  endTick: number;
  x: number;
  width: number;
  event: TabEvent;
}

export interface BarBox {
  index: number;
  x: number;
  width: number;
  bar: BarLayout;
  def: BarDef;
  /** Draw the time signature at the start of this bar. */
  showTime: boolean;
  /** Left edge of the first event (after bar padding and any time signature). */
  contentX: number;
  events: EventBox[];
  /** Free space after the last event, where new notes are appended. Null when the bar is full. */
  append: { x: number; width: number; startTick: number } | null;
}

export interface SystemBox {
  bars: BarBox[];
  width: number;
}

export interface TabLayoutInput {
  bars: BarLayout[];
  defs: BarDef[];
  trackBars: TrackBar[];
  /** Width available for bars, excluding the left label column. */
  width: number;
  maxBarsPerRow: number;
}

export const TIME_SIGNATURE_WIDTH = 26;
const BAR_LEAD = 12;
const BAR_TAIL = 8;
const MIN_APPEND = 34;

/** Space an event takes: grows with its length, but sub-linearly so short notes stay readable. */
export function eventWidth(ticks: number): number {
  return 16 + 22 * Math.sqrt(ticks / (PPQ / 2));
}

/** A bar's events and free space laid out at natural width, starting at x = 0. */
function naturalBar(bar: BarLayout, def: BarDef, trackBar: TrackBar | undefined, showTime: boolean): BarBox {
  let x = BAR_LEAD + (showTime ? TIME_SIGNATURE_WIDTH : 0);
  const contentX = x;
  let tick = bar.startTick;
  const events = (trackBar?.events ?? []).map((event, index): EventBox => {
    const ticks = eventTicks(event);
    const box = { index, startTick: tick, endTick: tick + ticks, x, width: eventWidth(ticks), event };
    x += box.width;
    tick += ticks;
    return box;
  });
  const remaining = bar.startTick + bar.lengthTicks - tick;
  let append: BarBox['append'] = null;
  if (remaining > 0) {
    append = { x, width: Math.max(MIN_APPEND, eventWidth(remaining)), startTick: tick };
    x += append.width;
  }
  return { index: bar.index, x: 0, width: x + BAR_TAIL, bar, def, showTime, contentX, events, append };
}

/** Stretch a bar to `width`, giving the extra space to its events and free space in proportion. */
function stretchBar(box: BarBox, width: number): void {
  const fixed = box.contentX + BAR_TAIL;
  const flexible = box.width - fixed;
  const scale = flexible > 0 ? (width - fixed) / flexible : 1;
  let x = box.contentX;
  for (const event of box.events) {
    event.x = x;
    event.width *= scale;
    x += event.width;
  }
  if (box.append) {
    box.append.x = x;
    box.append.width *= scale;
  }
  box.width = width;
}

function sameTime(a: BarDef | undefined, b: BarDef | undefined): boolean {
  return Boolean(a && b && a.time.numerator === b.time.numerator && a.time.denominator === b.time.denominator);
}

/** Break bars into systems that fit `width`, then justify every full system to that width. */
export function layoutTab({ bars, defs, trackBars, width, maxBarsPerRow }: TabLayoutInput): SystemBox[] {
  const boxes = bars.map((bar, i) => {
    const def = defs[i] ?? { time: { numerator: bar.numerator, denominator: bar.denominator } };
    return naturalBar(bar, def, trackBars[i], i === 0 || !sameTime(defs[i - 1], def));
  });

  const systems: SystemBox[] = [];
  let current: BarBox[] = [];
  let used = 0;
  for (const box of boxes) {
    if (current.length && (used + box.width > width || current.length >= maxBarsPerRow)) {
      systems.push({ bars: current, width: used });
      current = [];
      used = 0;
    }
    current.push(box);
    used += box.width;
  }
  if (current.length) systems.push({ bars: current, width: used });

  systems.forEach((system, s) => {
    const isLast = s === systems.length - 1;
    // Justify full rows; a short last row keeps its natural spacing.
    const target = !isLast || system.width > width * 0.7 ? Math.max(width, system.width) : system.width;
    const extra = target - system.width;
    let x = 0;
    for (const box of system.bars) {
      const share = system.width > 0 ? extra * (box.width / system.width) : 0;
      stretchBar(box, box.width + share);
      box.x = x;
      x += box.width;
    }
    system.width = x;
  });
  return systems;
}
