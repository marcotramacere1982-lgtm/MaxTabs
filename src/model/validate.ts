// Structural validation of songs and cursors. Used to parse untrusted files and as the
// invariant check after every edit, so a bug can never commit an inconsistent document.

import { isDenominator, isNoteValue, tryDurationTicks, type Duration } from './time';
import { barLengthTicks } from './timeline';
import { getScale } from './scales';
import { getChordQuality } from './harmony';
import { getInstrumentType } from './instruments';
import type { Cursor, EditorDoc, Song } from './song';

export const LIMITS = {
  bars: 2048,
  tracks: 16,
  frets: 36,
  bpm: { min: 10, max: 1000 },
  numerator: 32,
  eventsPerBar: 256,
  name: 120
} as const;

class Invalid extends Error {}

function fail(path: string, message: string): never {
  throw new Invalid(path ? `${path}: ${message}` : message);
}

function check(condition: unknown, path: string, message: string): asserts condition {
  if (!condition) fail(path, message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInt(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
}

function isPitchClass(value: unknown): value is number {
  return isInt(value, 0, 11);
}

function checkTempo(value: unknown, path: string): void {
  check(isObject(value), path, 'tempo must be an object');
  check(typeof value.bpm === 'number' && Number.isFinite(value.bpm) &&
    value.bpm >= LIMITS.bpm.min && value.bpm <= LIMITS.bpm.max, path, 'invalid BPM');
  check(isNoteValue(value.unit), path, 'invalid tempo unit');
  check(typeof value.dotted === 'boolean', path, 'invalid tempo dotted flag');
}

function checkKey(value: unknown, path: string): void {
  check(isObject(value), path, 'key must be an object');
  check(isPitchClass(value.tonic), path, 'invalid tonic');
  check(typeof value.scaleId === 'string' && getScale(value.scaleId), path, 'unknown scale');
}

function checkChord(value: unknown, path: string): void {
  check(isObject(value), path, 'chord must be an object');
  check(isPitchClass(value.root), path, 'invalid chord root');
  check(typeof value.quality === 'string' && getChordQuality(value.quality), path, 'unknown chord quality');
  check(value.bass === undefined || isPitchClass(value.bass), path, 'invalid chord bass');
}

/** Duration length in ticks; throws if the duration is malformed. */
function checkDuration(value: unknown, path: string): number {
  check(isObject(value), path, 'duration must be an object');
  check(isNoteValue(value.value), path, 'invalid note value');
  check(value.dots === 0 || value.dots === 1 || value.dots === 2, path, 'invalid dots');
  if (value.tuplet !== undefined) {
    const tuplet = value.tuplet;
    check(isObject(tuplet) && isInt(tuplet.actual, 2, 32) && isInt(tuplet.normal, 1, 32) &&
      tuplet.actual !== tuplet.normal, path, 'invalid tuplet');
  }
  const ticks = tryDurationTicks(value as unknown as Duration);
  check(ticks !== null, path, 'duration is not a whole number of ticks');
  return ticks;
}

/** Validate an untrusted value as a Song. Returns it typed; does not copy. */
export function validateSong(input: unknown): Song {
  check(isObject(input), '', 'song must be an object');
  checkTempo(input.tempo, 'tempo');
  checkKey(input.key, 'key');

  const timeline = input.timeline;
  check(isObject(timeline), 'timeline', 'missing timeline');
  check(typeof timeline.extendable === 'boolean', 'timeline', 'invalid extendable flag');
  check(timeline.source === undefined || (isObject(timeline.source) &&
    typeof timeline.source.app === 'string' && typeof timeline.source.name === 'string' &&
    timeline.source.name.length <= LIMITS.name), 'timeline', 'invalid source');
  const bars = timeline.bars;
  check(Array.isArray(bars) && bars.length >= 1 && bars.length <= LIMITS.bars, 'timeline',
    `must have 1–${LIMITS.bars} bars`);

  const barLengths = bars.map((bar: unknown, i: number) => {
    const path = `Bar ${i + 1}`;
    check(isObject(bar), path, 'bar must be an object');
    const time = bar.time;
    check(isObject(time) && isInt(time.numerator, 1, LIMITS.numerator) && isDenominator(time.denominator),
      path, 'invalid time signature');
    const numerator = time.numerator;
    check(bar.accents === undefined || (Array.isArray(bar.accents) && bar.accents.length === numerator &&
      bar.accents.every(a => a === 0 || a === 1 || a === 2)), path, 'invalid accents');
    if (bar.tempo !== undefined) checkTempo(bar.tempo, `${path} tempo`);
    if (bar.key !== undefined) checkKey(bar.key, `${path} key`);
    const length = barLengthTicks({ numerator, denominator: time.denominator });
    if (bar.chords !== undefined) {
      check(Array.isArray(bar.chords), path, 'chords must be a list');
      let previous = -1;
      for (const change of bar.chords as unknown[]) {
        check(isObject(change) && isInt(change.tick, 0, length - 1) && change.tick > previous,
          path, 'chord positions must be inside the bar and ascending');
        previous = change.tick;
        checkChord(change.chord, `${path} chord`);
      }
    }
    check(bar.source === undefined || (isObject(bar.source) && isInt(bar.source.index, 0, 10000) &&
      isInt(bar.source.repetition, 0, 10000)), path, 'invalid source');
    return length;
  });

  const tracks = input.tracks;
  check(Array.isArray(tracks) && tracks.length >= 1 && tracks.length <= LIMITS.tracks, 'tracks',
    `must have 1–${LIMITS.tracks} tracks`);
  tracks.forEach((track: unknown, t: number) => {
    const trackPath = `Track ${t + 1}`;
    check(isObject(track), trackPath, 'track must be an object');
    check(typeof track.name === 'string' && track.name.length <= LIMITS.name, trackPath, 'invalid name');
    const instrument = typeof track.instrumentId === 'string' ? getInstrumentType(track.instrumentId) : undefined;
    check(instrument, trackPath, 'unknown instrument');
    const tuning = track.tuning;
    check(Array.isArray(tuning) && tuning.length === instrument.stringCount &&
      tuning.every(m => isInt(m, 0, 127)), trackPath, `tuning must have ${instrument.stringCount} strings`);
    check(Array.isArray(track.bars) && track.bars.length === bars.length, trackPath,
      'bar count does not match the timeline');

    // The previous event, for checking ties: its end tick and the notes it sounds.
    let previous: { end: number; notes: Map<number, number> } | null = null;
    let barStart = 0;
    track.bars.forEach((bar: unknown, b: number) => {
      const barPath = `${trackPath}, bar ${b + 1}`;
      check(isObject(bar) && Array.isArray(bar.events) && bar.events.length <= LIMITS.eventsPerBar,
        barPath, 'invalid events');
      let tick = barStart;
      bar.events.forEach((event: unknown, e: number) => {
        const path = `${barPath}, event ${e + 1}`;
        check(isObject(event), path, 'event must be an object');
        const ticks = checkDuration(event.duration, path);
        check(Array.isArray(event.notes) && event.notes.length <= tuning.length, path, 'invalid notes');
        const notes = new Map<number, number>();
        for (const note of event.notes as unknown[]) {
          check(isObject(note) && isInt(note.string, 1, tuning.length), path, 'note on a missing string');
          check(isInt(note.fret, 0, LIMITS.frets), path, 'invalid fret');
          check(!notes.has(note.string), path, 'two notes on one string');
          check(note.tie === undefined || typeof note.tie === 'boolean', path, 'invalid tie');
          if (note.tie) {
            check(previous && previous.end === tick && previous.notes.get(note.string) === note.fret, path,
              'tied note must continue the same string and fret from the event just before it');
          }
          notes.set(note.string, note.fret);
        }
        tick += ticks;
        previous = { end: tick, notes };
      });
      const length = barLengths[b] ?? 0;
      check(tick - barStart <= length, barPath, 'events overflow the bar');
      barStart += length;
    });
  });

  return input as unknown as Song;
}

export function validateCursor(song: Song, cursor: unknown): Cursor {
  check(isObject(cursor) && isInt(cursor.bar, 0, song.timeline.bars.length), 'cursor', 'invalid bar');
  const events = song.tracks[0]?.bars[cursor.bar]?.events.length ?? 0;
  check(isInt(cursor.index, 0, events), 'cursor', 'invalid position');
  return cursor as unknown as Cursor;
}

export function validateDoc(doc: EditorDoc): void {
  validateSong(doc.song);
  validateCursor(doc.song, doc.cursor);
}
