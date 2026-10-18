import { describe, expect, it } from 'vitest';
import { validateCursor, validateSong } from '../../src/model/validate';
import { insertEvent } from '../../src/model/editing';
import { mainTrack, type Song } from '../../src/model/song';
import { d, newDoc } from '../helpers';

function songWithNotes(): Song {
  const doc = newDoc();
  insertEvent(doc, [{ string: 3, fret: 2 }], d(2));
  insertEvent(doc, [{ string: 3, fret: 2, tie: true }], d(2));
  return doc.song;
}

function expectInvalid(mutate: (song: Song) => void, message: RegExp): void {
  const song = structuredClone(songWithNotes());
  mutate(song);
  expect(() => validateSong(song)).toThrow(message);
}

describe('validateSong', () => {
  it('accepts a valid song, including JSON round trips', () => {
    const song = songWithNotes();
    expect(validateSong(song)).toBe(song);
    expect(() => validateSong(JSON.parse(JSON.stringify(song)))).not.toThrow();
  });

  it('rejects overfull bars', () => {
    expectInvalid(s => { mainTrack(s).bars[0]!.events.push({ duration: d(8), notes: [] }); }, /overflow/);
  });

  it('rejects ties that do not continue the previous note', () => {
    expectInvalid(s => { mainTrack(s).bars[0]!.events[1]!.notes[0]!.fret = 3; }, /tied note/);
    expectInvalid(s => { mainTrack(s).bars[0]!.events[0]!.notes[0]!.tie = true; }, /tied note/);
  });

  it('rejects notes on missing strings and duplicate strings', () => {
    expectInvalid(s => { mainTrack(s).bars[0]!.events[0]!.notes[0]!.string = 7; }, /missing string/);
    expectInvalid(s => {
      mainTrack(s).bars[0]!.events[0]!.notes.push({ string: 3, fret: 5 });
    }, /two notes on one string/);
  });

  it('rejects mismatched bar counts and bad meters', () => {
    expectInvalid(s => { mainTrack(s).bars.push({ events: [] }); }, /bar count/);
    expectInvalid(s => { s.timeline.bars[0]!.time.denominator = 3 as never; }, /time signature/);
    expectInvalid(s => { s.timeline.bars[0]!.accents = [2, 0]; }, /accents/);
  });

  it('rejects unknown scales, chord qualities and bad durations', () => {
    expectInvalid(s => { s.key.scaleId = 'nope'; }, /scale/);
    expectInvalid(s => { s.timeline.bars[0]!.chords = [{ tick: 0, chord: { root: 0, quality: 'nope' } }]; }, /chord quality/);
    expectInvalid(s => {
      mainTrack(s).bars[0]!.events[0]!.duration = { value: 16, dots: 0, tuplet: { actual: 7, normal: 4 } };
    }, /whole number of ticks/);
  });

  it('names the location of the problem', () => {
    expectInvalid(s => { mainTrack(s).bars[0]!.events[1]!.notes[0]!.fret = 99; }, /Track 1, bar 1, event 2/);
  });
});

describe('validateCursor', () => {
  it('allows one past the last bar and the end of a bar, nothing further', () => {
    const song = songWithNotes();
    expect(validateCursor(song, { bar: 0, index: 2 })).toEqual({ bar: 0, index: 2 });
    expect(validateCursor(song, { bar: 1, index: 0 })).toEqual({ bar: 1, index: 0 });
    expect(() => validateCursor(song, { bar: 0, index: 3 })).toThrow();
    expect(() => validateCursor(song, { bar: 2, index: 0 })).toThrow();
  });
});
