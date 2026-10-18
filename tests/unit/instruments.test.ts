import { describe, expect, it } from 'vitest';
import {
  defaultTuning,
  findTuningPreset,
  getInstrumentType,
  INSTRUMENT_TYPES,
  resolveLegacyInstrument,
  TUNING_PRESETS,
  tuningsFor
} from '../../src/model/instruments';
import { stringsOf } from '../../src/model/pitch';

describe('instrument registry', () => {
  it('has 6- and 7-string guitars and 4- and 5-string basses', () => {
    expect(INSTRUMENT_TYPES.map(t => [t.id, t.stringCount])).toEqual([
      ['guitar-6', 6], ['guitar-7', 7], ['bass-4', 4], ['bass-5', 5]
    ]);
  });

  it('gives every preset a known instrument, the right string count and a unique id', () => {
    const ids = new Set<string>();
    for (const tuning of TUNING_PRESETS) {
      const type = getInstrumentType(tuning.instrumentId);
      expect(type, tuning.id).toBeDefined();
      expect(tuning.notes, tuning.id).toHaveLength(type!.stringCount);
      expect(ids.has(tuning.id), tuning.id).toBe(false);
      ids.add(tuning.id);
    }
  });

  it('starts every instrument with its standard tuning', () => {
    for (const type of INSTRUMENT_TYPES) {
      expect(tuningsFor(type.id).length).toBeGreaterThan(0);
      expect(defaultTuning(type.id).name).toMatch(/^Standard/);
    }
    expect(stringsOf(defaultTuning('guitar-7').notes).map(s => s.label)).toEqual(['B', 'E', 'A', 'D', 'G', 'B', 'e']);
    expect(stringsOf(defaultTuning('bass-5').notes).map(s => s.noteName)).toEqual(['B0', 'E1', 'A1', 'D2', 'G2']);
  });

  it('recognises presets by their notes', () => {
    expect(findTuningPreset('guitar-6', [38, 45, 50, 55, 59, 64])?.name).toBe('Drop D');
    expect(findTuningPreset('guitar-6', [38, 45, 50, 55, 59, 63])).toBeUndefined();
    expect(findTuningPreset('bass-4', [38, 45, 50, 55, 59, 64])).toBeUndefined();
  });

  it('maps legacy ids', () => {
    expect(resolveLegacyInstrument('guitar-drop-d')).toEqual({ instrumentId: 'guitar-6', notes: [38, 45, 50, 55, 59, 64] });
    expect(resolveLegacyInstrument('bass-standard')?.instrumentId).toBe('bass-4');
    expect(resolveLegacyInstrument('guitar-6')).toBeUndefined();
  });
});
