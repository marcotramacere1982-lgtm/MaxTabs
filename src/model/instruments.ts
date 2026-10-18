// Instrument types and their preset tunings. A track stores the instrument type id and its
// open-string pitches; the tuning's name is recognised by matching those pitches to a preset.

export type InstrumentKind = 'guitar' | 'bass';

export interface InstrumentType {
  id: string;
  name: string;
  kind: InstrumentKind;
  stringCount: number;
}

export interface TuningPreset {
  id: string;
  instrumentId: string;
  name: string;
  /** Open-string MIDI pitches, lowest string first. */
  notes: number[];
}

export const INSTRUMENT_TYPES: readonly InstrumentType[] = [
  { id: 'guitar-6', name: 'Guitar (6-string)', kind: 'guitar', stringCount: 6 },
  { id: 'guitar-7', name: 'Guitar (7-string)', kind: 'guitar', stringCount: 7 },
  { id: 'bass-4', name: 'Bass (4-string)', kind: 'bass', stringCount: 4 },
  { id: 'bass-5', name: 'Bass (5-string)', kind: 'bass', stringCount: 5 }
];

const preset = (instrumentId: string, id: string, name: string, notes: number[]): TuningPreset =>
  ({ id: `${instrumentId}/${id}`, instrumentId, name, notes });

export const TUNING_PRESETS: readonly TuningPreset[] = [
  preset('guitar-6', 'standard', 'Standard', [40, 45, 50, 55, 59, 64]),
  preset('guitar-6', 'drop-d', 'Drop D', [38, 45, 50, 55, 59, 64]),
  preset('guitar-6', 'eb-standard', 'E♭ standard', [39, 44, 49, 54, 58, 63]),
  preset('guitar-6', 'drop-c-sharp', 'Drop C♯', [37, 44, 49, 54, 58, 63]),
  preset('guitar-6', 'd-standard', 'D standard', [38, 43, 48, 53, 57, 62]),
  preset('guitar-6', 'drop-c', 'Drop C', [36, 43, 48, 53, 57, 62]),
  preset('guitar-6', 'c-standard', 'C standard', [36, 41, 46, 51, 55, 60]),
  preset('guitar-6', 'drop-b', 'Drop B', [35, 42, 47, 52, 56, 61]),
  preset('guitar-6', 'dadgad', 'DADGAD', [38, 45, 50, 55, 57, 62]),
  preset('guitar-6', 'open-d', 'Open D', [38, 45, 50, 54, 57, 62]),
  preset('guitar-6', 'open-e', 'Open E', [40, 47, 52, 56, 59, 64]),
  preset('guitar-6', 'open-g', 'Open G', [38, 43, 50, 55, 59, 62]),
  preset('guitar-6', 'open-c', 'Open C', [36, 43, 48, 55, 60, 64]),

  preset('guitar-7', 'standard', 'Standard', [35, 40, 45, 50, 55, 59, 64]),
  preset('guitar-7', 'drop-a', 'Drop A', [33, 40, 45, 50, 55, 59, 64]),
  preset('guitar-7', 'bb-standard', 'B♭ standard', [34, 39, 44, 49, 54, 58, 63]),
  preset('guitar-7', 'a-standard', 'A standard', [33, 38, 43, 48, 53, 57, 62]),

  preset('bass-4', 'standard', 'Standard', [28, 33, 38, 43]),
  preset('bass-4', 'drop-d', 'Drop D', [26, 33, 38, 43]),
  preset('bass-4', 'eb-standard', 'E♭ standard', [27, 32, 37, 42]),
  preset('bass-4', 'd-standard', 'D standard', [26, 31, 36, 41]),
  preset('bass-4', 'drop-c', 'Drop C', [24, 31, 36, 41]),

  preset('bass-5', 'standard', 'Standard (low B)', [23, 28, 33, 38, 43]),
  preset('bass-5', 'drop-a', 'Drop A', [21, 28, 33, 38, 43]),
  preset('bass-5', 'high-c', 'High C', [28, 33, 38, 43, 48])
];

export const DEFAULT_INSTRUMENT_ID = 'guitar-6';

/** Instrument ids used before instrument types existed (alpha and early v2 files). */
const LEGACY_INSTRUMENTS: Record<string, { instrumentId: string; notes: number[] }> = {
  'guitar-standard': { instrumentId: 'guitar-6', notes: [40, 45, 50, 55, 59, 64] },
  'guitar-drop-d': { instrumentId: 'guitar-6', notes: [38, 45, 50, 55, 59, 64] },
  'bass-standard': { instrumentId: 'bass-4', notes: [28, 33, 38, 43] }
};

export function getInstrumentType(id: string): InstrumentType | undefined {
  return INSTRUMENT_TYPES.find(type => type.id === id);
}

export function requireInstrumentType(id: string): InstrumentType {
  const type = getInstrumentType(id);
  if (!type) throw new Error(`Unknown instrument: ${id}`);
  return type;
}

export function tuningsFor(instrumentId: string): TuningPreset[] {
  return TUNING_PRESETS.filter(tuning => tuning.instrumentId === instrumentId);
}

export function getTuningPreset(id: string): TuningPreset | undefined {
  return TUNING_PRESETS.find(tuning => tuning.id === id);
}

export function requireTuningPreset(id: string): TuningPreset {
  const tuning = getTuningPreset(id);
  if (!tuning) throw new Error(`Unknown tuning: ${id}`);
  return tuning;
}

/** The instrument's first preset (its standard tuning). */
export function defaultTuning(instrumentId: string): TuningPreset {
  const tuning = tuningsFor(instrumentId)[0];
  if (!tuning) throw new Error(`No tunings for instrument: ${instrumentId}`);
  return tuning;
}

/** The preset with exactly these open-string pitches, if any. */
export function findTuningPreset(instrumentId: string, notes: readonly number[]): TuningPreset | undefined {
  return tuningsFor(instrumentId).find(tuning =>
    tuning.notes.length === notes.length && tuning.notes.every((note, i) => note === notes[i]));
}

/** Map an instrument id from an older file to the current type and tuning, if it is a legacy id. */
export function resolveLegacyInstrument(id: string): { instrumentId: string; notes: number[] } | undefined {
  const legacy = LEGACY_INSTRUMENTS[id];
  return legacy && { instrumentId: legacy.instrumentId, notes: [...legacy.notes] };
}
