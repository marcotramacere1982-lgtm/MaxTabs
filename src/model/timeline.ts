// Bar layout: absolute tick and second positions derived from the timeline and tempo map.

import { PPQ, pulseTicks, WHOLE_NOTE_TICKS } from './time';
import { defaultAccents, type Accent, type BarDef, type Song, type TempoMark, type TimeSignature } from './song';

export interface BarLayout {
  index: number;
  numerator: number;
  denominator: TimeSignature['denominator'];
  startTick: number;
  lengthTicks: number;
  pulseTicks: number;
  accents: Accent[];
  /** Tempo in effect for this bar (its own mark, or the last one before it). */
  tempo: TempoMark;
  quarterBpm: number;
  startSeconds: number;
  endSeconds: number;
}

export function barLengthTicks(time: TimeSignature): number {
  return time.numerator * WHOLE_NOTE_TICKS / time.denominator;
}

/** A tempo mark expressed in quarter notes per minute. */
export function quarterBpm(tempo: TempoMark): number {
  return tempo.bpm * (4 / tempo.unit) * (tempo.dotted ? 1.5 : 1);
}

export function layoutBars(song: Song): BarLayout[] {
  return layoutBarDefs(song.timeline.bars, song.tempo);
}

export function layoutBarDefs(bars: readonly BarDef[], initialTempo: TempoMark): BarLayout[] {
  let tick = 0;
  let seconds = 0;
  let tempo = initialTempo;
  return bars.map((bar, index) => {
    tempo = bar.tempo ?? tempo;
    const lengthTicks = barLengthTicks(bar.time);
    const qbpm = quarterBpm(tempo);
    const layout: BarLayout = {
      index,
      numerator: bar.time.numerator,
      denominator: bar.time.denominator,
      startTick: tick,
      lengthTicks,
      pulseTicks: pulseTicks(bar.time.denominator),
      accents: bar.accents ?? defaultAccents(bar.time.numerator),
      tempo,
      quarterBpm: qbpm,
      startSeconds: seconds,
      // Multiply before dividing so whole-number tempos give exact bar lengths.
      endSeconds: seconds + lengthTicks * 60 / (qbpm * PPQ)
    };
    tick += lengthTicks;
    seconds = layout.endSeconds;
    return layout;
  });
}

export function endTick(bars: readonly BarLayout[]): number {
  const last = bars[bars.length - 1];
  return last ? last.startTick + last.lengthTicks : 0;
}

export function endSeconds(bars: readonly BarLayout[]): number {
  return bars[bars.length - 1]?.endSeconds ?? 0;
}

export function barAtTick(bars: readonly BarLayout[], tick: number): BarLayout | undefined {
  return bars.find(b => tick >= b.startTick && tick < b.startTick + b.lengthTicks);
}

export function tickToSeconds(bars: readonly BarLayout[], tick: number): number {
  const bar = barAtTick(bars, tick);
  if (bar) return bar.startSeconds + (tick - bar.startTick) * 60 / (bar.quarterBpm * PPQ);
  if (tick === endTick(bars)) return endSeconds(bars);
  throw new Error('Position outside the chart.');
}

/** Tick at a time in seconds, or null outside the chart. */
export function secondsToTick(bars: readonly BarLayout[], seconds: number): number | null {
  const bar = bars.find(b => seconds >= b.startSeconds && seconds < b.endSeconds);
  if (!bar) return null;
  return bar.startTick + Math.floor((seconds - bar.startSeconds) * bar.quarterBpm * PPQ / 60);
}

/** Label for a position inside a pulse: "&" for the half, "e"/"a" for the quarters, else "". */
export function subdivisionLabel(offset: number, pulse: number): string {
  if (offset === 0) return '';
  if (offset * 2 === pulse) return '&';
  if (offset * 4 === pulse) return 'e';
  if (offset * 4 === pulse * 3) return 'a';
  return '';
}
