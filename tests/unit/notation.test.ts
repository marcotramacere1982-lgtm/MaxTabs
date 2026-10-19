import { describe, expect, it } from 'vitest';
import {
  deleteAtCursor,
  insertEvent,
  markState,
  setBend,
  setCursor,
  setStroke,
  toggleMark
} from '../../src/model/editing';
import { buildSchedule, noteSpans, STROKE_STEP_SECONDS, type ScheduledNote } from '../../src/model/schedule';
import { mainTrack, type Note } from '../../src/model/song';
import { validateSong } from '../../src/model/validate';
import { d, newHistory } from '../helpers';

const one = (string: number, fret: number, extra: Partial<Note> = {}): Note[] => [{ string, fret, ...extra }];
const noteAt = (history: ReturnType<typeof newHistory>, index: number, string?: number) =>
  mainTrack(history.present.song).bars[0]?.events[index]?.notes.find(n => string === undefined || n.string === string);
const notes = (history: ReturnType<typeof newHistory>) =>
  (buildSchedule(history.present.song, { metronome: false }).sounds as ScheduledNote[])
    .sort((a, b) => a.time - b.time || b.string - a.string);

/** 5 → 7 on the G string, then 7 again: room for slurs, slides and ties. */
function legatoLine() {
  const history = newHistory();
  history.apply(doc => insertEvent(doc, one(3, 5), d(4)));
  history.apply(doc => insertEvent(doc, one(3, 7), d(4)));
  history.apply(doc => insertEvent(doc, one(3, 7), d(4)));
  return history;
}

describe('hammer-ons, pull-offs and slides', () => {
  it('are offered only where the previous note on the string is a different fret', () => {
    const history = legatoLine();
    history.amend(doc => setCursor(doc, 0, 1));
    expect(markState(history.present).available).toMatchObject({ slur: true, slide: true, tie: false });
    history.amend(doc => setCursor(doc, 0, 2));
    expect(markState(history.present).available).toMatchObject({ slur: false, slide: false, tie: true });
    history.amend(doc => setCursor(doc, 0, 0));
    expect(() => history.apply(doc => toggleMark(doc, 'slur'))).toThrow(/different fret/);
  });

  it('play without a new pick attack; a slide glides into the next note', () => {
    const history = legatoLine();
    history.amend(doc => setCursor(doc, 0, 1));
    history.apply(doc => toggleMark(doc, 'slide'));
    const [first, second] = notes(history);
    expect(first?.slideTo).toBe(2);
    expect(second?.legato).toBe(true);
    history.apply(doc => toggleMark(doc, 'slur'));
    expect(noteAt(history, 1)).toEqual({ string: 3, fret: 7, slur: true });
    expect(notes(history)[0]?.slideTo).toBeUndefined();
  });

  it('are removed when an edit breaks the connection', () => {
    const history = legatoLine();
    history.amend(doc => setCursor(doc, 0, 1));
    history.apply(doc => toggleMark(doc, 'slur'));
    history.amend(doc => setCursor(doc, 0, 0));
    history.apply(deleteAtCursor);
    expect(noteAt(history, 0)).toEqual({ string: 3, fret: 7 });
  });

  it('are validated', () => {
    const song = structuredClone(legatoLine().present.song);
    mainTrack(song).bars[0]!.events[2]!.notes[0]!.slur = true;
    expect(() => validateSong(song)).toThrow(/different fret/);
    mainTrack(song).bars[0]!.events[2]!.notes[0] = { string: 3, fret: 7, tie: true, slide: true };
    expect(() => validateSong(song)).toThrow(/not several/);
  });
});

describe('bends and vibrato', () => {
  it('apply to the selected note of a chord only', () => {
    const history = newHistory();
    history.apply(doc => insertEvent(doc, [{ string: 2, fret: 8 }, { string: 3, fret: 7 }], d(2)));
    history.amend(doc => setCursor(doc, 0, 0));
    history.apply(doc => setBend(doc, { semitones: 1, release: true }, 3));
    history.apply(doc => toggleMark(doc, 'vibrato', 2));
    expect(noteAt(history, 0, 3)).toEqual({ string: 3, fret: 7, bend: { semitones: 1, release: true } });
    expect(noteAt(history, 0, 2)).toEqual({ string: 2, fret: 8, vibrato: true });
    expect(markState(history.present, 3)).toMatchObject({ singleNote: true, bend: { semitones: 1, release: true } });
    const [g, b] = notes(history);
    expect(g).toMatchObject({ bend: { semitones: 1, release: true } });
    expect(b).toMatchObject({ vibrato: true });
  });

  it('are not allowed on muted notes', () => {
    const history = newHistory();
    history.apply(doc => insertEvent(doc, one(3, 7, { bend: { semitones: 1 }, vibrato: true }), d(4)));
    history.amend(doc => setCursor(doc, 0, 0));
    history.apply(doc => toggleMark(doc, 'dead'));
    expect(noteAt(history, 0)).toEqual({ string: 3, fret: 7, dead: true });
    const song = structuredClone(history.present.song);
    mainTrack(song).bars[0]!.events[0]!.notes[0]!.bend = { semitones: 1 };
    expect(() => validateSong(song)).toThrow(/cannot be bent/);
    mainTrack(song).bars[0]!.events[0]!.notes[0] = { string: 3, fret: 7, bend: { semitones: 0.3 } };
    expect(() => validateSong(song)).toThrow(/invalid bend/);
  });
});

describe('strokes', () => {
  it('stagger a chord low to high for down, high to low for up', () => {
    const history = newHistory();
    const chord: Note[] = [{ string: 1, fret: 0 }, { string: 2, fret: 1 }, { string: 3, fret: 0 }];
    history.apply(doc => insertEvent(doc, chord, d(4)));
    history.amend(doc => setCursor(doc, 0, 0));
    history.apply(doc => setStroke(doc, 'down'));
    const order = (h: typeof history) => notes(h).sort((a, b) => a.time - b.time).map(n => n.string);
    expect(order(history)).toEqual([3, 2, 1]);
    expect(notes(history)[2]?.time).toBeCloseTo(2 * STROKE_STEP_SECONDS);
    history.apply(doc => setStroke(doc, 'up'));
    expect(order(history)).toEqual([1, 2, 3]);
    history.apply(doc => setStroke(doc, null));
    expect(noteSpans(history.present.song).every(s => s.strokeOrder === 0)).toBe(true);
  });

  it('need a chord or note under the cursor', () => {
    const history = newHistory();
    expect(() => history.apply(doc => setStroke(doc, 'down'))).toThrow(/chord/);
  });
});
