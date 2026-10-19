import { describe, expect, it } from 'vitest';
import {
  addNoteToChord,
  currentEvent,
  deleteAtCursor,
  deleteBeforeCursor,
  eventAtCursor,
  insertEvent,
  moveCursor,
  setCursor,
  setDurationAtCursor,
  writeAtCursor
} from '../../src/model/editing';
import { mainTrack, type EditorDoc } from '../../src/model/song';
import { d, newHistory } from '../helpers';

const n = (string: number, fret: number) => [{ string, fret }];
const frets = (doc: EditorDoc, bar = 0) =>
  mainTrack(doc.song).bars[bar]?.events.map(e => e.notes.map(x => x.fret).join('+') || 'r');

/** Bar 1: four quarters (frets 1–4); bar 2: one eighth (fret 5), cursor after it. */
function written() {
  const history = newHistory();
  for (const fret of [1, 2, 3, 4]) history.apply(doc => insertEvent(doc, n(1, fret), d(4)));
  history.apply(doc => insertEvent(doc, n(1, 5), d(8)));
  return history;
}

describe('moving the cursor', () => {
  it('steps through events and across bar lines', () => {
    const history = written();
    expect(history.present.cursor).toEqual({ bar: 1, index: 1 });
    const steps: string[] = [];
    for (let i = 0; i < 7; i++) {
      history.amend(doc => moveCursor(doc, -1));
      steps.push(`${history.present.cursor.bar}:${history.present.cursor.index}`);
    }
    // Bar 1 is full, so stepping back from bar 2 lands on its last event.
    expect(steps).toEqual(['1:0', '0:3', '0:2', '0:1', '0:0', '0:0', '0:0']);
    for (let i = 0; i < 5; i++) history.amend(doc => moveCursor(doc, 1));
    expect(history.present.cursor).toEqual({ bar: 1, index: 1 });
    // Past the end of a free timeline: onto the next (empty) bar.
    history.amend(doc => moveCursor(doc, 1));
    expect(history.present.cursor).toEqual({ bar: 2, index: 0 });
  });

  it('does not record cursor moves as undo steps', () => {
    const history = written();
    history.amend(doc => moveCursor(doc, -1));
    history.undo();
    // Undo removes the last note (and the bar it created), not the cursor move.
    expect(history.present.song.timeline.bars).toHaveLength(1);
    expect(frets(history.present)).toEqual(['1', '2', '3', '4']);
  });

  it('places the cursor from a click, normalising the end of a full bar', () => {
    const history = written();
    history.amend(doc => setCursor(doc, 0, 4));
    expect(history.present.cursor).toEqual({ bar: 1, index: 0 });
    history.amend(doc => setCursor(doc, 9, 9));
    expect(history.present.cursor).toEqual({ bar: 2, index: 0 });
  });
});

describe('editing in place', () => {
  it('replaces the event under the cursor, keeping its duration, and moves on', () => {
    const history = written();
    history.amend(doc => setCursor(doc, 0, 1));
    history.apply(doc => writeAtCursor(doc, n(2, 9), d(16)));
    expect(frets(history.present)).toEqual(['1', '9', '3', '4']);
    expect(mainTrack(history.present.song).bars[0]?.events[1]?.duration).toEqual(d(4));
    expect(history.present.cursor).toEqual({ bar: 0, index: 2 });
  });

  it('turns an event into a rest', () => {
    const history = written();
    history.amend(doc => setCursor(doc, 0, 0));
    history.apply(doc => writeAtCursor(doc, [], d(4)));
    expect(frets(history.present)).toEqual(['r', '2', '3', '4']);
  });

  it('builds chords with Shift+click, on the cursor event or the one just entered', () => {
    const history = written();
    history.apply(doc => addNoteToChord(doc, { string: 2, fret: 7 }));
    expect(frets(history.present, 1)).toEqual(['5+7']);
    history.apply(doc => addNoteToChord(doc, { string: 1, fret: 8 }));
    // Same string replaces the note.
    expect(currentEvent(history.present)?.notes).toEqual([{ string: 1, fret: 8 }, { string: 2, fret: 7 }]);
  });

  it('deletes at and before the cursor', () => {
    const history = written();
    history.amend(doc => setCursor(doc, 0, 1));
    history.apply(deleteAtCursor);
    expect(frets(history.present)).toEqual(['1', '3', '4']);
    expect(eventAtCursor(history.present)?.notes[0]?.fret).toBe(3);
    history.apply(deleteBeforeCursor);
    expect(frets(history.present)).toEqual(['3', '4']);
    expect(history.present.cursor).toEqual({ bar: 0, index: 0 });
    expect(() => history.apply(deleteBeforeCursor)).toThrow(/Nothing to delete/);
  });

  it('changes durations only when the bar has room', () => {
    const history = written();
    history.amend(doc => setCursor(doc, 0, 0));
    history.apply(doc => setDurationAtCursor(doc, d(8)));
    expect(mainTrack(history.present.song).bars[0]?.events[0]?.duration).toEqual(d(8));
    expect(() => history.apply(doc => setDurationAtCursor(doc, d(2)))).toThrow(/Not enough room/);
  });

  it('inserts a rest before the event under the cursor', () => {
    const history = newHistory();
    history.apply(doc => insertEvent(doc, n(1, 1), d(4)));
    history.amend(doc => setCursor(doc, 0, 0));
    history.apply(doc => insertEvent(doc, [], d(8)));
    expect(frets(history.present)).toEqual(['r', '1']);
    expect(history.present.cursor).toEqual({ bar: 0, index: 1 });
  });

  it('removes ties that a deletion breaks', () => {
    const history = newHistory();
    history.apply(doc => insertEvent(doc, n(3, 2), d(4)));
    history.apply(doc => insertEvent(doc, [{ string: 3, fret: 2, tie: true }], d(4)));
    history.amend(doc => setCursor(doc, 0, 0));
    history.apply(deleteAtCursor);
    expect(mainTrack(history.present.song).bars[0]?.events[0]?.notes[0]?.tie).toBeUndefined();
  });
});
