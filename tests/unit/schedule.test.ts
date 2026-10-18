import { describe, expect, it } from 'vitest';
import { buildSchedule, eventAtTick, placeEvents, type ScheduledNote } from '../../src/model/schedule';
import { insertEvent, replaceTimeline } from '../../src/model/editing';
import { importMetronomo } from '../../src/io/metronomoComposto';
import { mainTrack, type EditorDoc } from '../../src/model/song';
import { d, metronomoFixture, newDoc } from '../helpers';

/** Scheduled notes, ordered by time then string (simultaneous notes have no meaningful order). */
const notesOf = (doc: EditorDoc) =>
  buildSchedule(doc.song, { metronome: false }).sounds
    .filter((s): s is ScheduledNote => s.kind === 'note')
    .sort((a, b) => a.time - b.time || b.string - a.string);

describe('note scheduling', () => {
  it('times notes from the tempo', () => {
    const doc = newDoc();
    insertEvent(doc, [{ string: 6, fret: 3 }], d(4));
    insertEvent(doc, [], d(4));
    insertEvent(doc, [{ string: 1, fret: 0 }, { string: 6, fret: 0 }], d(8));
    expect(notesOf(doc)).toEqual([
      { kind: 'note', time: 0, duration: 0.5, midi: 43, string: 6 },
      { kind: 'note', time: 1, duration: 0.25, midi: 40, string: 6 },
      { kind: 'note', time: 1, duration: 0.25, midi: 64, string: 1 }
    ]);
  });

  it('merges tied notes across a bar line into one sound', () => {
    const doc = newDoc();
    insertEvent(doc, [], d(2));
    insertEvent(doc, [], d(4));
    insertEvent(doc, [{ string: 3, fret: 2 }], d(4));
    insertEvent(doc, [{ string: 3, fret: 2, tie: true }], d(2));
    expect(notesOf(doc)).toEqual([{ kind: 'note', time: 1.5, duration: 1.5, midi: 57, string: 3 }]);
  });

  it('re-attacks a note that is not tied', () => {
    const doc = newDoc();
    insertEvent(doc, [{ string: 3, fret: 2 }], d(4));
    insertEvent(doc, [{ string: 3, fret: 2 }], d(4));
    expect(notesOf(doc)).toHaveLength(2);
  });

  it('finds the event sounding at a tick', () => {
    const doc = newDoc();
    insertEvent(doc, [{ string: 6, fret: 3 }], d(4, 1));
    const placed = placeEvents(doc.song);
    expect(eventAtTick(placed, 1439)?.event.notes).toEqual([{ string: 6, fret: 3 }]);
    expect(eventAtTick(placed, 1440)).toBeUndefined();
  });
});

describe('metronome', () => {
  it('clicks every pulse with its accent, including in empty charts', () => {
    const doc = newDoc();
    const chart = importMetronomo(metronomoFixture());
    replaceTimeline(doc, chart.timeline, chart.tempo);
    const { sounds, endSeconds } = buildSchedule(doc.song, { metronome: true });
    // 5 quarter pulses, 7 eighth pulses, 2 eighth pulses.
    expect(sounds).toHaveLength(14);
    expect(sounds.slice(0, 6).map(s => s.time)).toEqual([0, 0.5, 1, 1.5, 2, 2.5]);
    expect(sounds[5]).toEqual({ kind: 'click', time: 2.5, accent: 2 });
    expect(endSeconds).toBe(4.75);
    expect(mainTrack(doc.song).bars).toHaveLength(3);
  });
});
