// Harmony track: song key, key changes and chord symbols on bars.
// Keys and chords are "sticky": each applies until the next change.

import { pitchClassName, pitchClassOf } from './pitch';
import type { Chord, Key, PitchClass, Song } from './song';

export interface ChordQuality {
  id: string;
  /** Suffix written after the root, e.g. "m7". */
  symbol: string;
  name: string;
  /** Semitones above the root. */
  intervals: number[];
}

export const CHORD_QUALITIES: readonly ChordQuality[] = [
  { id: 'maj', symbol: '', name: 'Major', intervals: [0, 4, 7] },
  { id: 'min', symbol: 'm', name: 'Minor', intervals: [0, 3, 7] },
  { id: 'dim', symbol: 'dim', name: 'Diminished', intervals: [0, 3, 6] },
  { id: 'aug', symbol: 'aug', name: 'Augmented', intervals: [0, 4, 8] },
  { id: 'sus2', symbol: 'sus2', name: 'Suspended 2nd', intervals: [0, 2, 7] },
  { id: 'sus4', symbol: 'sus4', name: 'Suspended 4th', intervals: [0, 5, 7] },
  { id: '5', symbol: '5', name: 'Power chord', intervals: [0, 7] },
  { id: '6', symbol: '6', name: 'Major 6th', intervals: [0, 4, 7, 9] },
  { id: 'm6', symbol: 'm6', name: 'Minor 6th', intervals: [0, 3, 7, 9] },
  { id: '7', symbol: '7', name: 'Dominant 7th', intervals: [0, 4, 7, 10] },
  { id: 'maj7', symbol: 'maj7', name: 'Major 7th', intervals: [0, 4, 7, 11] },
  { id: 'm7', symbol: 'm7', name: 'Minor 7th', intervals: [0, 3, 7, 10] },
  { id: 'mMaj7', symbol: 'm(maj7)', name: 'Minor-major 7th', intervals: [0, 3, 7, 11] },
  { id: 'm7b5', symbol: 'm7♭5', name: 'Half-diminished', intervals: [0, 3, 6, 10] },
  { id: 'dim7', symbol: 'dim7', name: 'Diminished 7th', intervals: [0, 3, 6, 9] },
  { id: '7sus4', symbol: '7sus4', name: 'Dominant 7th sus4', intervals: [0, 5, 7, 10] },
  { id: 'add9', symbol: 'add9', name: 'Added 9th', intervals: [0, 2, 4, 7] },
  { id: '9', symbol: '9', name: 'Dominant 9th', intervals: [0, 2, 4, 7, 10] },
  { id: 'maj9', symbol: 'maj9', name: 'Major 9th', intervals: [0, 2, 4, 7, 11] },
  { id: 'm9', symbol: 'm9', name: 'Minor 9th', intervals: [0, 2, 3, 7, 10] }
];

export function getChordQuality(id: string): ChordQuality | undefined {
  return CHORD_QUALITIES.find(quality => quality.id === id);
}

export function chordPitchClasses(chord: Chord): PitchClass[] {
  const quality = getChordQuality(chord.quality);
  if (!quality) throw new Error(`Unknown chord quality: ${chord.quality}`);
  return quality.intervals.map(interval => pitchClassOf(chord.root + interval));
}

export function chordSymbol(chord: Chord, preferFlats = false): string {
  const quality = getChordQuality(chord.quality);
  const bass = chord.bass === undefined ? '' : `/${pitchClassName(chord.bass, preferFlats)}`;
  return `${pitchClassName(chord.root, preferFlats)}${quality?.symbol ?? '?'}${bass}`;
}

export interface Harmony {
  key: Key;
  chord: Chord | null;
}

/** Key and chord in effect at a position. Positions past the last bar use the last bar's harmony. */
export function harmonyAt(song: Song, barIndex: number, tickInBar: number): Harmony {
  const bars = song.timeline.bars;
  let key = song.key;
  let chord: Chord | null = null;
  const lastBar = Math.min(barIndex, bars.length - 1);
  for (let i = 0; i <= lastBar; i++) {
    const bar = bars[i];
    if (!bar) break;
    if (bar.key) key = bar.key;
    for (const change of bar.chords ?? []) {
      if (i === barIndex && change.tick > tickInBar) break;
      chord = change.chord;
    }
  }
  return { key, chord };
}

export function transposePitchClass(pc: PitchClass, semitones: number): PitchClass {
  return pitchClassOf(pc + semitones);
}

/** Shift the song key, key changes and chord symbols. Notes are not changed. Mutates the song. */
export function transposeHarmony(song: Song, semitones: number): void {
  const key = (k: Key): Key => ({ ...k, tonic: transposePitchClass(k.tonic, semitones) });
  song.key = key(song.key);
  for (const bar of song.timeline.bars) {
    if (bar.key) bar.key = key(bar.key);
    for (const change of bar.chords ?? []) {
      change.chord.root = transposePitchClass(change.chord.root, semitones);
      if (change.chord.bass !== undefined) change.chord.bass = transposePitchClass(change.chord.bass, semitones);
    }
  }
}
