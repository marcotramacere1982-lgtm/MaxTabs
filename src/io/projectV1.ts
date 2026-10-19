// Version 1 project files (the alpha's eighth-note slot model): validation and upgrade to v2.

import { resolveLegacyInstrument } from '../model/instruments';
import { getScale } from '../model/scales';
import { createTrack, type BarDef, type Cursor, type EditorDoc, type Song, type TempoMark, type TrackBar } from '../model/song';
import type { Denominator, NoteValue } from '../model/time';
import { validateCursor, validateSong } from '../model/validate';
import type { LoadedProject } from './projectFormat';

/** v1 durations were counted in eighth-note slots. */
const SLOT_DURATIONS: Record<number, NoteValue> = { 1: 8, 2: 4, 4: 2, 8: 1 };

interface V1Bar {
  numerator: number;
  denominator: Denominator;
  startSlot: number;
  lengthSlots: number;
  accents: (0 | 1 | 2)[];
  quarterBpm: number;
  tempoValue?: number;
  tempoUnit?: 'quarter' | 'denom';
}

interface V1Event {
  type: 'note' | 'rest';
  startSlot: number;
  durationSlots: number;
  notes: { string: number; fret: number }[];
}

function require(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function integer(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
}

function number(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function oneOf<T>(values: readonly T[], value: unknown): value is T {
  return values.includes(value as T);
}

export function migrateV1(input: unknown): Omit<LoadedProject, 'migratedFrom'> {
  const doc = input as Record<string, unknown>;
  require(typeof doc.title === 'string' && doc.title.length <= 120, 'Invalid project title.');
  const p = doc.project as Record<string, unknown> | null | undefined;
  require(p && typeof p === 'object', 'Missing project data.');

  const instrument = typeof p.instrumentId === 'string' ? resolveLegacyInstrument(p.instrumentId) : undefined;
  require(instrument, 'Unknown instrument.');
  require(oneOf([12, 15, 17, 22], p.fretCount), 'Invalid fret count.');
  require(number(p.bpm, 20, 300), 'Invalid BPM.');
  require(p.beatsPerBar === 4 && p.slotsPerBeat === 2, 'Unsupported base grid.');
  require(oneOf([1, 2, 4, 8], p.selectedDurationSlots), 'Invalid selected duration.');
  require(integer(p.barsPerRow, 1, 8), 'Invalid bars-per-row setting.');
  require(integer(p.cursorSlot, 0, 10000000), 'Invalid cursor.');
  require(Array.isArray(p.events) && p.events.length <= 100000, 'Invalid event list.');
  require(typeof p.metronomeEnabled === 'boolean' && number(p.clickVolume, 0, 0.6), 'Invalid metronome settings.');
  const overlay = p.scaleOverlay as Record<string, unknown> | null | undefined;
  require(overlay && typeof overlay.enabled === 'boolean' && integer(overlay.tonicPitchClass, 0, 11) &&
    typeof overlay.scaleId === 'string' && getScale(overlay.scaleId), 'Invalid scale overlay.');

  // Bars in slots: the imported chart's, or free 4/4 bars covering every event.
  let bars: V1Bar[];
  let source: Song['timeline']['source'];
  const chart = p.rhythmChart as Record<string, unknown> | null | undefined;
  if (chart !== null) {
    require(chart && typeof chart.name === 'string' && Array.isArray(chart.bars) &&
      chart.bars.length > 0 && chart.bars.length <= 256, 'Invalid rhythm chart.');
    let expected = 0;
    for (const bar of chart.bars as Record<string, unknown>[]) {
      require(integer(bar.numerator, 1, 32) && oneOf([1, 2, 4, 8], bar.denominator), 'Invalid bar meter.');
      const lengthSlots = bar.numerator * 8 / bar.denominator;
      require(bar.startSlot === expected && bar.lengthSlots === lengthSlots && number(bar.quarterBpm, 1, 1600),
        'Invalid bar timing.');
      require(Array.isArray(bar.accents) && bar.accents.length === bar.numerator &&
        bar.accents.every(a => oneOf([0, 1, 2], a)), 'Invalid bar accents.');
      expected += lengthSlots;
    }
    bars = chart.bars as V1Bar[];
    source = { app: 'metronomo-composto', name: chart.name.slice(0, 120) };
  } else {
    const end = (p.events as V1Event[]).reduce((max, e) => Math.max(max, Number(e.startSlot) + Number(e.durationSlots)), 0);
    const count = Math.max(1, Math.ceil(end / 8));
    bars = Array.from({ length: count }, (_, i) => ({
      numerator: 4, denominator: 4, startSlot: i * 8, lengthSlots: 8, accents: [2, 0, 0, 0], quarterBpm: p.bpm as number
    }));
  }

  // Events: contiguous from slot 0, never crossing a bar line.
  const trackBars: TrackBar[] = bars.map(() => ({ events: [] }));
  let expected = 0;
  for (const event of p.events as V1Event[]) {
    require(oneOf(['note', 'rest'], event.type) && event.startSlot === expected &&
      oneOf([1, 2, 4, 8], event.durationSlots), 'Invalid event timing.');
    const barIndex = bars.findIndex(b => expected >= b.startSlot && expected < b.startSlot + b.lengthSlots);
    const bar = bars[barIndex];
    const trackBar = trackBars[barIndex];
    require(bar && trackBar && expected + event.durationSlots <= bar.startSlot + bar.lengthSlots,
      'An event crosses a bar boundary.');
    require(Array.isArray(event.notes) && event.notes.length === (event.type === 'rest' ? 0 : 1),
      'Invalid event contents.');
    trackBar.events.push({
      duration: { value: SLOT_DURATIONS[event.durationSlots] as NoteValue, dots: 0 },
      notes: event.notes.map(n => ({ string: n.string, fret: n.fret }))
    });
    expected += event.durationSlots;
  }
  require(p.cursorSlot === expected, 'Project cursor or event IDs are inconsistent.');

  // Tempo marks: v1 stored each bar's tempo as displayed (quarter or denominator beats).
  const marks = bars.map((bar): TempoMark => chart !== null && bar.tempoValue !== undefined
    ? { bpm: bar.tempoValue, unit: (bar.tempoUnit === 'denom' ? bar.denominator : 4) as NoteValue, dotted: false }
    : { bpm: chart !== null ? bar.quarterBpm : p.bpm as number, unit: 4, dotted: false });
  const first = marks[0] as TempoMark;
  let current = first;
  const barDefs = bars.map((bar, i): BarDef => {
    const def: BarDef = {
      time: { numerator: bar.numerator, denominator: bar.denominator },
      accents: [...bar.accents]
    };
    const mark = marks[i] as TempoMark;
    if (mark.bpm !== current.bpm || mark.unit !== current.unit) {
      def.tempo = mark;
      current = mark;
    }
    return def;
  });

  const track = createTrack('Track 1', instrument.instrumentId, instrument.notes, 0);
  track.bars = trackBars;
  const song: Song = {
    tempo: first,
    key: { tonic: overlay.tonicPitchClass, scaleId: overlay.scaleId },
    timeline: { extendable: chart === null, bars: barDefs, ...(source ? { source } : {}) },
    tracks: [track]
  };

  // Cursor: end of the written events.
  const cursorBar = bars.findIndex(b => expected >= b.startSlot && expected < b.startSlot + b.lengthSlots);
  const cursor: Cursor = cursorBar === -1
    ? { bar: bars.length, index: 0 }
    : { bar: cursorBar, index: trackBars[cursorBar]?.events.length ?? 0 };

  const result: EditorDoc = { song: validateSong(song), cursor };
  validateCursor(result.song, result.cursor);
  return {
    title: doc.title,
    doc: result,
    view: {
      fretCount: p.fretCount,
      barsPerRow: p.barsPerRow,
      overlayEnabled: overlay.enabled,
      overlayMode: 'scale',
      metronomeEnabled: p.metronomeEnabled,
      clickVolume: p.clickVolume,
      duration: { value: SLOT_DURATIONS[p.selectedDurationSlots] as NoteValue, dots: 0 }
    }
  };
}
