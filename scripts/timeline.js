export function chartBars(state, includeCursor = false) {
  if (state.rhythmChart) return state.rhythmChart.bars;
  const end = Math.max(1, ...state.events.map(e => e.startSlot + e.durationSlots),
    includeCursor ? state.cursorSlot + 1 : 0);
  let count = Math.max(1, Math.ceil(end / 8));
  if (includeCursor) count = Math.ceil(count / state.barsPerRow) * state.barsPerRow;
  return Array.from({length: count}, (_, i) => ({
    numerator: 4, denominator: 4, startSlot: i * 8, lengthSlots: 8,
    pulseSlots: 2, quarterBpm: state.bpm, accents: [2,0,0,0]
  }));
}

export function barAt(state, slot) {
  return chartBars(state, true).find(b => slot >= b.startSlot && slot < b.startSlot + b.lengthSlots);
}

export function chartEnd(state) {
  const bars = chartBars(state);
  const b = bars[bars.length - 1];
  return b.startSlot + b.lengthSlots;
}

export function timedBars(state) {
  let time = 0;
  return chartBars(state).map(bar => {
    const secondsPerSlot = 30 / bar.quarterBpm;
    const result = {...bar, startSeconds: time, secondsPerSlot};
    time += bar.lengthSlots * secondsPerSlot;
    return {...result, endSeconds: time};
  });
}

export function slotToSeconds(bars, slot) {
  const bar = bars.find(b => slot >= b.startSlot && slot < b.startSlot + b.lengthSlots);
  if (bar) return bar.startSeconds + (slot - bar.startSlot) * bar.secondsPerSlot;
  const last = bars[bars.length - 1];
  if (slot === last.startSlot + last.lengthSlots) return last.endSeconds;
  throw new Error('Position outside the chart.');
}

export function secondsToSlot(bars, seconds) {
  const bar = bars.find(b => seconds >= b.startSeconds && seconds < b.endSeconds);
  return bar ? bar.startSlot + Math.floor((seconds - bar.startSeconds) / bar.secondsPerSlot) : null;
}
