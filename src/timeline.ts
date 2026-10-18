import type { AppState, Bar, TimedBar } from './types';

export function chartBars(state: AppState, includeCursor = false): Bar[] {
  if (state.rhythmChart) return state.rhythmChart.bars;
  const end = Math.max(1, ...state.events.map(e => e.startSlot + e.durationSlots),
    includeCursor ? state.cursorSlot + 1 : 0);
  let count = Math.max(1, Math.ceil(end / 8));
  if (includeCursor) count = Math.ceil(count / state.barsPerRow) * state.barsPerRow;
  return Array.from({ length: count }, (_, i): Bar => ({
    numerator: 4, denominator: 4, startSlot: i * 8, lengthSlots: 8,
    pulseSlots: 2, quarterBpm: state.bpm, accents: [2, 0, 0, 0]
  }));
}

export function barAt(state: AppState, slot: number): Bar | undefined {
  return chartBars(state, true).find(b => slot >= b.startSlot && slot < b.startSlot + b.lengthSlots);
}

export function chartEnd(state: AppState): number {
  const b = lastOf(chartBars(state));
  return b.startSlot + b.lengthSlots;
}

export function timedBars(state: AppState): TimedBar[] {
  let time = 0;
  return chartBars(state).map(bar => {
    const secondsPerSlot = 30 / bar.quarterBpm;
    const startSeconds = time;
    time += bar.lengthSlots * secondsPerSlot;
    return { ...bar, startSeconds, secondsPerSlot, endSeconds: time };
  });
}

export function slotToSeconds(bars: TimedBar[], slot: number): number {
  const bar = bars.find(b => slot >= b.startSlot && slot < b.startSlot + b.lengthSlots);
  if (bar) return bar.startSeconds + (slot - bar.startSlot) * bar.secondsPerSlot;
  const last = lastOf(bars);
  if (slot === last.startSlot + last.lengthSlots) return last.endSeconds;
  throw new Error('Position outside the chart.');
}

export function secondsToSlot(bars: TimedBar[], seconds: number): number | null {
  const bar = bars.find(b => seconds >= b.startSeconds && seconds < b.endSeconds);
  return bar ? bar.startSlot + Math.floor((seconds - bar.startSeconds) / bar.secondsPerSlot) : null;
}

/** Last element of a list that is known to be non-empty (charts always have at least one bar). */
export function lastOf<T>(items: readonly T[]): T {
  const item = items[items.length - 1];
  if (item === undefined) throw new Error('Expected a non-empty list.');
  return item;
}
