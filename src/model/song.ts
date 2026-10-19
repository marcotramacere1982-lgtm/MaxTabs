// The song document: everything that is saved and undoable.
//
// Layout: one shared timeline of bars (meter, tempo, harmony) and one or more tracks whose
// bars line up with it index for index. Each track bar holds a sequence of events that
// fill the bar from its start; positions are derived by summing durations.

import type { Denominator, Duration, NoteValue } from './time';

/** Pulse accent level: 0 weak, 1 medium, 2 strong. */
export type Accent = 0 | 1 | 2;

/** 0 = C … 11 = B. */
export type PitchClass = number;

export interface TimeSignature {
  numerator: number;
  denominator: Denominator;
}

/** `bpm` beats per minute, where a beat is `unit` (dotted if `dotted`). */
export interface TempoMark {
  bpm: number;
  unit: NoteValue;
  dotted: boolean;
}

export interface Key {
  tonic: PitchClass;
  scaleId: string;
}

export interface Chord {
  root: PitchClass;
  /** Id from CHORD_QUALITIES. */
  quality: string;
  /** Slash-chord bass note. */
  bass?: PitchClass;
}

export interface ChordChange {
  /** Offset from the start of the bar. */
  tick: number;
  chord: Chord;
}

export interface BarDef {
  time: TimeSignature;
  /** One per pulse; defaults to a strong first pulse and weak others. */
  accents?: Accent[];
  /** Tempo change at the start of this bar; applies until the next change. */
  tempo?: TempoMark;
  /** Key change at the start of this bar; applies until the next change. */
  key?: Key;
  /** Chord symbols in this bar, ascending by tick; each applies until the next one. */
  chords?: ChordChange[];
  /** Where an imported bar came from. */
  source?: { index: number; repetition: number };
}

export interface Timeline {
  /** Free charts grow as you write; imported charts are fixed. */
  extendable: boolean;
  bars: BarDef[];
  source?: { app: string; name: string };
}

export interface Note {
  /** 1 is the highest-pitched string. */
  string: number;
  fret: number;
  /** Continues the same string and fret from the immediately preceding event. */
  tie?: boolean;
  /** Muted ("dead") note: a percussive hit written as "x". The fret is kept but not sounded. */
  dead?: boolean;
  /** Keeps ringing past its own duration, until the same string is played again. */
  letRing?: boolean;
}

/** A rhythmic event; no notes means a rest. */
export interface TabEvent {
  duration: Duration;
  notes: Note[];
}

export interface TrackBar {
  events: TabEvent[];
}

export interface Track {
  name: string;
  instrumentId: string;
  /** Open-string MIDI pitches, lowest string first. */
  tuning: number[];
  bars: TrackBar[];
}

export interface Song {
  /** Tempo at the start of the song. */
  tempo: TempoMark;
  /** Key at the start of the song. */
  key: Key;
  timeline: Timeline;
  tracks: Track[];
}

/** Insertion point: before event `index` of bar `bar`. `bar` may equal the bar count (past the end). */
export interface Cursor {
  bar: number;
  index: number;
}

export interface EditorDoc {
  song: Song;
  cursor: Cursor;
}

export const FOUR_FOUR: TimeSignature = { numerator: 4, denominator: 4 };

export function defaultAccents(numerator: number): Accent[] {
  return Array.from({ length: numerator }, (_, i): Accent => (i === 0 ? 2 : 0));
}

export function createTrack(name: string, instrumentId: string, tuning: number[], barCount: number): Track {
  return {
    name,
    instrumentId,
    tuning: [...tuning],
    bars: Array.from({ length: barCount }, () => ({ events: [] }))
  };
}

export function createSong(instrumentId: string, tuning: number[]): Song {
  return {
    tempo: { bpm: 120, unit: 4, dotted: false },
    key: { tonic: 0, scaleId: 'major' },
    timeline: { extendable: true, bars: [{ time: { ...FOUR_FOUR } }] },
    tracks: [createTrack('Track 1', instrumentId, tuning, 1)]
  };
}

export function createDoc(instrumentId: string, tuning: number[]): EditorDoc {
  return { song: createSong(instrumentId, tuning), cursor: { bar: 0, index: 0 } };
}

/** The track the editor works on. Multi-track editing comes later. */
export function mainTrack(song: Song): Track {
  const track = song.tracks[0];
  if (!track) throw new Error('Song has no tracks.');
  return track;
}
