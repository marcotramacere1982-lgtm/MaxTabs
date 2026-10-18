import type { Accent, Bar, RhythmChart, TempoUnit } from '../types';

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

export function importMetronomo(input: unknown): RhythmChart {
  const data = input as MetronomoFile | null;
  if (!data || data.app !== 'metronomo-composto' || data.version !== 1)
    throw new Error('Expected a metronomo-composto version 1 file.');
  if (!Array.isArray(data.bars) || !data.bars.length || data.bars.length > 64)
    throw new Error('The file must contain 1–64 source bars.');
  if (typeof data.perBar !== 'boolean' || (data.unit !== 'quarter' && data.unit !== 'denom'))
    throw new Error('Invalid tempo mode.');
  const unit: TempoUnit = data.unit;
  const perBar = data.perBar;
  function tempo(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 20 || value > 400)
      throw new Error('Tempo must be a number between 20 and 400.');
    return value;
  }
  const globalBpm = tempo(data.bpm);
  let startSlot = 0;
  const bars: Bar[] = [];
  (data.bars as unknown[]).forEach((raw, sourceIndex) => {
    const b = raw as MetronomoBar | null;
    if (!b || typeof b.num !== 'number' || !Number.isInteger(b.num) || b.num < 1 || b.num > 32 ||
      (b.den !== 1 && b.den !== 2 && b.den !== 4 && b.den !== 8))
      throw new Error('This first version supports denominators 1, 2, 4 and 8 only.');
    if (typeof b.rep !== 'number' || !Number.isInteger(b.rep) || b.rep < 1 || b.rep > 99)
      throw new Error('Invalid repeat count.');
    if (!Array.isArray(b.acc) || b.acc.length !== b.num || !b.acc.every(isAccent))
      throw new Error('Each pulse needs an accent value of 0, 1 or 2.');
    const accents: Accent[] = b.acc;
    const barBpm = b.bpm != null ? tempo(b.bpm) : null;
    const effective = perBar && barBpm != null ? barBpm : globalBpm;
    const quarterBpm = unit === 'quarter' ? effective : effective * 4 / b.den;
    for (let repetition = 0; repetition < b.rep; repetition++) {
      if (bars.length >= 256) throw new Error('Maximum 256 expanded bars in this version.');
      const pulseSlots = 8 / b.den;
      const lengthSlots = b.num * pulseSlots;
      bars.push({
        numerator: b.num, denominator: b.den, startSlot, lengthSlots,
        pulseSlots, quarterBpm, accents: [...accents], sourceIndex, repetition,
        tempoValue: effective, tempoUnit: unit
      });
      startSlot += lengthSlots;
    }
  });
  return {
    name: typeof data.name === 'string' ? data.name.slice(0, 120) : 'Imported rhythm',
    bars, source: { app: data.app, version: data.version, unit, perBar }
  };
}

function isAccent(value: unknown): value is Accent {
  return value === 0 || value === 1 || value === 2;
}
