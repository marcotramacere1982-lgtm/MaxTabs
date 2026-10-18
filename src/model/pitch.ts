import type { Note, PitchClass, Track } from './song';

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export function pitchClassOf(midi: number): PitchClass {
  return ((midi % 12) + 12) % 12;
}

export function pitchClassName(pc: PitchClass, preferFlats = false): string {
  const name = (preferFlats ? FLAT_NAMES : SHARP_NAMES)[pitchClassOf(pc)];
  if (name === undefined) throw new Error(`Invalid pitch class: ${pc}`);
  return name;
}

/** Scientific pitch name: 60 → "C4". */
export function midiToNoteName(midi: number): string {
  return `${pitchClassName(pitchClassOf(midi))}${Math.floor(midi / 12) - 1}`;
}

export interface StringInfo {
  /** 1 is the highest-pitched string. */
  number: number;
  /** Short label for tab rows; the top string of a guitar-style tuning is lower-case. */
  label: string;
  /** Open-string pitch name, e.g. "E2". */
  noteName: string;
  midi: number;
}

/** Strings of a tuning, lowest first. */
export function stringsOf(tuning: readonly number[]): StringInfo[] {
  return tuning.map((midi, i) => {
    const isTop = i === tuning.length - 1;
    const letter = pitchClassName(pitchClassOf(midi));
    // Tab convention: the top string is lower-case when it is an E, so it differs from the low E.
    const label = isTop && letter === 'E' ? 'e' : letter;
    return { number: tuning.length - i, label, noteName: midiToNoteName(midi), midi };
  });
}

/** Open-string pitch of a string number, or undefined if the track has no such string. */
export function openStringMidi(track: Pick<Track, 'tuning'>, stringNumber: number): number | undefined {
  return track.tuning[track.tuning.length - stringNumber];
}

export function noteMidi(track: Pick<Track, 'tuning'>, note: Pick<Note, 'string' | 'fret'>): number {
  const open = openStringMidi(track, note.string);
  if (open === undefined) throw new Error(`String ${note.string} does not exist on this instrument.`);
  return open + note.fret;
}
