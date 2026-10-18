// Import of metronomo-composto (companion app) version 1 rhythm charts.

import { isDenominator, type NoteValue } from '../model/time';
import type { Accent, BarDef, TempoMark, Timeline } from '../model/song';

export interface ImportedChart {
  timeline: Timeline;
  /** Tempo at the start of the chart. */
  tempo: TempoMark;
}

/** Raw shape of a metronomo-composto v1 export; validated at runtime, so every field is unknown. */
interface MetronomoFile {
  app?: unknown;
  version?: unknown;
  name?: unknown;
  bpm?: unknown;
  perBar?: unknown;
  unit?: unknown;
  bars?: unknown;
}

interface MetronomoBar {
  num?: unknown;
  den?: unknown;
  bpm?: unknown;
  acc?: unknown;
  rep?: unknown;
}

export const MAX_SOURCE_BARS = 64;
export const MAX_EXPANDED_BARS = 256;

export function importMetronomo(input: unknown): ImportedChart {
  const data = input as MetronomoFile | null;
  if (!data || data.app !== 'metronomo-composto' || data.version !== 1)
    throw new Error('Expected a metronomo-composto version 1 file.');
  if (!Array.isArray(data.bars) || !data.bars.length || data.bars.length > MAX_SOURCE_BARS)
    throw new Error(`The file must contain 1–${MAX_SOURCE_BARS} source bars.`);
  if (typeof data.perBar !== 'boolean' || (data.unit !== 'quarter' && data.unit !== 'denom'))
    throw new Error('Invalid tempo mode.');
  const unit = data.unit;
  const perBar = data.perBar;
  function tempo(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 20 || value > 400)
      throw new Error('Tempo must be a number between 20 and 400.');
    return value;
  }
  const globalBpm = tempo(data.bpm);

  // Each bar's effective tempo mark, before collapsing repeats of the same mark.
  const expanded: { bar: BarDef; tempo: TempoMark }[] = [];
  (data.bars as unknown[]).forEach((raw, index) => {
    const b = raw as MetronomoBar | null;
    if (!b || typeof b.num !== 'number' || !Number.isInteger(b.num) || b.num < 1 || b.num > 32 || !isDenominator(b.den))
      throw new Error('Supported denominators are 1, 2, 4, 8, 16 and 32.');
    if (typeof b.rep !== 'number' || !Number.isInteger(b.rep) || b.rep < 1 || b.rep > 99)
      throw new Error('Invalid repeat count.');
    if (!Array.isArray(b.acc) || b.acc.length !== b.num || !b.acc.every(isAccent))
      throw new Error('Each pulse needs an accent value of 0, 1 or 2.');
    const accents: Accent[] = b.acc;
    const barBpm = b.bpm != null ? tempo(b.bpm) : null;
    const bpm = perBar && barBpm != null ? barBpm : globalBpm;
    // "denom" tempos count the bar's own denominator as the beat.
    const mark: TempoMark = { bpm, unit: unit === 'quarter' ? 4 : b.den as NoteValue, dotted: false };
    for (let repetition = 0; repetition < b.rep; repetition++) {
      if (expanded.length >= MAX_EXPANDED_BARS) throw new Error(`Maximum ${MAX_EXPANDED_BARS} expanded bars.`);
      expanded.push({
        bar: { time: { numerator: b.num, denominator: b.den }, accents: [...accents], source: { index, repetition } },
        tempo: mark
      });
    }
  });

  const first = expanded[0];
  if (!first) throw new Error('The file must contain at least one bar.');
  // Tempo marks are sticky, so only write one where the tempo changes.
  let current = first.tempo;
  const bars = expanded.map(({ bar, tempo: mark }) => {
    if (!sameTempo(mark, current)) {
      bar.tempo = mark;
      current = mark;
    }
    return bar;
  });

  return {
    tempo: first.tempo,
    timeline: {
      extendable: false,
      bars,
      source: {
        app: 'metronomo-composto',
        name: typeof data.name === 'string' ? data.name.slice(0, 120) : 'Imported rhythm'
      }
    }
  };
}

function sameTempo(a: TempoMark, b: TempoMark): boolean {
  return a.bpm === b.bpm && a.unit === b.unit && a.dotted === b.dotted;
}

function isAccent(value: unknown): value is Accent {
  return value === 0 || value === 1 || value === 2;
}
