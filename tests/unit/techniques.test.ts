import { describe, expect, it } from 'vitest';
import {
  addNoteToChord,
  chordNoteAtCursor,
  insertEvent,
  moveCursor,
  setMark,
  toggleTie
} from '../../src/model/editing';
import { buildSchedule, noteSpans, soundingAt, type ScheduledNote } from '../../src/model/schedule';
import { mainTrack, type Note } from '../../src/model/song';
import { validateSong } from '../../src/model/validate';
import { d, newHistory } from '../helpers';

const notesAt = (history: ReturnType<typeof newHistory>, bar: number, index: number) =>
  mainTrack(history.present.song).bars[bar]?.events[index]?.notes;

describe('chord mode', () => {
  it('builds a chord at the cursor without moving on, and moves on when asked', () => {
    const history = newHistory();
    const shape: Note[] = [{ string: 5, fret: 3 }, { string: 4, fret: 2 }, { string: 3, fret: 0 }, { string: 6, fret: 0, dead: true }];
    for (const note of shape) history.apply(doc => chordNoteAtCursor(doc, note, d(2)));
    expect(history.present.cursor).toEqual({ bar: 0, index: 0 });
    expect(notesAt(history, 0, 0)).toEqual([
      { string: 3, fret: 0 }, { string: 4, fret: 2 }, { string: 5, fret: 3 }, { string: 6, fret: 0, dead: true }
    ]);
    history.amend(doc => moveCursor(doc, 1));
    history.apply(doc => chordNoteAtCursor(doc, { string: 1, fret: 3 }, d(2)));
    expect(mainTrack(history.present.song).bars[0]?.events).toHaveLength(2);
  });

  it('removes a note when the same position is clicked again, and replaces on another fret', () => {
    const history = newHistory();
    history.apply(doc => chordNoteAtCursor(doc, { string: 2, fret: 1 }, d(4)));
    history.apply(doc => chordNoteAtCursor(doc, { string: 3, fret: 0 }, d(4)));
    history.apply(doc => chordNoteAtCursor(doc, { string: 2, fret: 1 }, d(4)));
    expect(notesAt(history, 0, 0)).toEqual([{ string: 3, fret: 0 }]);
    history.apply(doc => chordNoteAtCursor(doc, { string: 3, fret: 2 }, d(4)));
    expect(notesAt(history, 0, 0)).toEqual([{ string: 3, fret: 2 }]);
  });

  it('Shift+click toggles in the same way', () => {
    const history = newHistory();
    history.apply(doc => insertEvent(doc, [{ string: 2, fret: 1 }], d(4)));
    history.apply(doc => addNoteToChord(doc, { string: 3, fret: 0 }));
    history.apply(doc => addNoteToChord(doc, { string: 3, fret: 0 }));
    expect(notesAt(history, 0, 0)).toEqual([{ string: 2, fret: 1 }]);
  });
});

describe('let ring', () => {
  it('keeps a chord sounding while other strings play, until its string is struck again', () => {
    const history = newHistory();
    // A C-shape held with let ring, then a melody on the top string, then a new note on string 5.
    history.apply(doc => insertEvent(doc, [
      { string: 5, fret: 3, letRing: true }, { string: 4, fret: 2, letRing: true }, { string: 3, fret: 0, letRing: true }
    ], d(4)));
    history.apply(doc => insertEvent(doc, [{ string: 1, fret: 0 }], d(4)));
    history.apply(doc => insertEvent(doc, [{ string: 1, fret: 1 }], d(4)));
    history.apply(doc => insertEvent(doc, [{ string: 5, fret: 2 }], d(4)));
    const spans = noteSpans(history.present.song);
    const span = (string: number, fret: number) => spans.find(s => s.string === string && s.fret === fret);
    expect(span(5, 3)?.endTick).toBe(2880); // cut by the new note on string 5
    expect(span(4, 2)?.endTick).toBe(3840); // rings to the end of the song
    expect(span(1, 0)?.endTick).toBe(1920); // an ordinary note ends with its event
    expect(soundingAt(spans, 1500).map(s => s.string).sort()).toEqual([1, 3, 4, 5]);
  });

  it('rings through rests', () => {
    const history = newHistory();
    history.apply(doc => insertEvent(doc, [{ string: 3, fret: 2, letRing: true }], d(4)));
    history.apply(doc => insertEvent(doc, [], d(2)));
    const notes = buildSchedule(history.present.song, { metronome: false }).sounds as ScheduledNote[];
    // Rings for the quarter, the half rest and the open last beat: the whole 4/4 bar.
    expect(notes[0]?.duration).toBe(2);
  });
});

describe('muted notes', () => {
  it('play as a short hit and are marked dead', () => {
    const history = newHistory();
    history.apply(doc => insertEvent(doc, [{ string: 6, fret: 0, dead: true }], d(4)));
    const [note] = buildSchedule(history.present.song, { metronome: false }).sounds as ScheduledNote[];
    expect(note).toMatchObject({ dead: true, duration: 0.05 });
  });

  it('cannot be tied, and muting removes ties and let ring', () => {
    const history = newHistory();
    history.apply(doc => insertEvent(doc, [{ string: 3, fret: 2 }], d(4)));
    history.apply(doc => insertEvent(doc, [{ string: 3, fret: 2, letRing: true }], d(4)));
    history.apply(toggleTie);
    history.apply(doc => setMark(doc, 'dead', true));
    expect(notesAt(history, 0, 1)).toEqual([{ string: 3, fret: 2, dead: true }]);
    const song = structuredClone(history.present.song);
    mainTrack(song).bars[0]!.events[1]!.notes[0]!.tie = true;
    expect(() => validateSong(song)).toThrow(/muted note cannot be tied/);
  });

  it('switch let ring on and off for the whole current event', () => {
    const history = newHistory();
    history.apply(doc => insertEvent(doc, [{ string: 3, fret: 2 }, { string: 2, fret: 3 }], d(4)));
    history.apply(doc => setMark(doc, 'letRing', true));
    expect(notesAt(history, 0, 0)?.every(n => n.letRing)).toBe(true);
    history.apply(doc => setMark(doc, 'letRing', false));
    expect(notesAt(history, 0, 0)?.some(n => n.letRing)).toBe(false);
  });
});
