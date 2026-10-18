// Shared types for the app state and its persisted model.
// Time is still measured in eighth-note "slots" (8 per 4/4 bar); Phase 1 moves to ticks.

/** Pulse accent level: 0 weak, 1 medium, 2 strong. */
export type Accent = 0 | 1 | 2;

/** Denominators supported by the slot grid. */
export type Denominator = 1 | 2 | 4 | 8;

/** Durations selectable in the editor, in eighth-note slots. */
export type DurationSlots = 1 | 2 | 4 | 8;

export type TempoUnit = 'quarter' | 'denom';

export interface Bar {
  numerator: number;
  denominator: number;
  startSlot: number;
  lengthSlots: number;
  pulseSlots: number;
  quarterBpm: number;
  accents: Accent[];
  // Present on bars imported from a rhythm chart.
  sourceIndex?: number;
  repetition?: number;
  tempoValue?: number;
  tempoUnit?: TempoUnit;
}

export interface TimedBar extends Bar {
  startSeconds: number;
  endSeconds: number;
  secondsPerSlot: number;
}

export interface RhythmChart {
  name: string;
  bars: Bar[];
  source?: {
    app: string;
    version: number;
    unit: TempoUnit;
    perBar: boolean;
  };
}

export interface InstrumentString {
  /** Conventional string number: 1 is the highest-pitched string. */
  number: number;
  label: string;
  noteName: string;
  midi: number;
}

export interface Instrument {
  name: string;
  /** Ordered lowest-pitched string first. */
  strings: InstrumentString[];
}

export interface TabNote {
  string: number;
  fret: number;
  midi: number;
  noteName: string;
}

/** A fretboard click: a note plus the label of the string it was played on. */
export interface FretboardNote extends TabNote {
  stringLabel: string;
}

export type EventType = 'note' | 'rest';

export interface TabEvent {
  id: number;
  type: EventType;
  startSlot: number;
  durationSlots: number;
  notes: TabNote[];
  techniques: string[];
}

export interface ScaleOverlay {
  enabled: boolean;
  tonicPitchClass: number;
  scaleId: string;
}

export interface AppState {
  instrumentId: string;
  fretCount: number;
  selectedNote: FretboardNote | null;

  beatsPerBar: number;
  slotsPerBeat: number;
  selectedDurationSlots: number;
  barsPerRow: number;
  bpm: number;
  rhythmChart: RhythmChart | null;
  metronomeEnabled: boolean;
  clickVolume: number;

  events: TabEvent[];
  nextEventId: number;
  cursorSlot: number;

  playbackSlot: number | null;
  activeNotes: TabNote[];

  scaleOverlay: ScaleOverlay;
}
