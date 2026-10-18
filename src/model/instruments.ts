// Built-in instruments. Phase 2 turns this into a data-driven registry with more tunings.

export interface InstrumentDef {
  id: string;
  name: string;
  /** Open-string MIDI pitches, lowest string first. */
  tuning: number[];
}

export const INSTRUMENTS: readonly InstrumentDef[] = [
  { id: 'guitar-standard', name: 'Guitar — Standard', tuning: [40, 45, 50, 55, 59, 64] },
  { id: 'guitar-drop-d', name: 'Guitar — Drop D', tuning: [38, 45, 50, 55, 59, 64] },
  { id: 'bass-standard', name: 'Bass — Standard', tuning: [28, 33, 38, 43] }
];

export const DEFAULT_INSTRUMENT_ID = 'guitar-standard';

export function getInstrument(id: string): InstrumentDef | undefined {
  return INSTRUMENTS.find(instrument => instrument.id === id);
}

export function requireInstrument(id: string): InstrumentDef {
  const instrument = getInstrument(id);
  if (!instrument) throw new Error(`Unknown instrument: ${id}`);
  return instrument;
}
