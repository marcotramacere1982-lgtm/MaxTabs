import { describe, expect, it } from 'vitest';
import { importMetronomo } from '../../src/io/metronomoComposto';
import {
  clearNotes,
  cursorPosition,
  insertEvent,
  replaceTimeline,
  resetToFreeTimeline,
  setBarKey,
  setChord,
  setInstrument
} from '../../src/model/editing';
import { mainTrack } from '../../src/model/song';
import { BASS, d, DROP_D, metronomoFixture, newHistory } from '../helpers';

const E3 = [{ string: 6, fret: 3 }];

function importedHistory() {
  const history = newHistory();
  const chart = importMetronomo(metronomoFixture());
  history.apply(doc => replaceTimeline(doc, chart.timeline, chart.tempo));
  return history;
}

describe('inserting at the cursor', () => {
  it('advances within a bar and into the next one', () => {
    const history = newHistory();
    history.apply(doc => insertEvent(doc, E3, d(2)));
    expect(history.present.cursor).toEqual({ bar: 0, index: 1 });
    expect(cursorPosition(history.present)).toMatchObject({ ended: false, bar: 0, tick: 1920, pulse: 2, offsetInPulse: 0 });

    history.apply(doc => insertEvent(doc, [], d(2)));
    // Bar full: the cursor moves to the next (not yet existing) bar of the free timeline.
    expect(history.present.cursor).toEqual({ bar: 1, index: 0 });
    expect(history.present.song.timeline.bars).toHaveLength(1);
    expect(cursorPosition(history.present)).toMatchObject({ ended: false, bar: 1, tick: 3840 });

    history.apply(doc => insertEvent(doc, E3, d(16)));
    expect(history.present.song.timeline.bars).toHaveLength(2);
    expect(mainTrack(history.present.song).bars).toHaveLength(2);
    expect(cursorPosition(history.present)).toMatchObject({ bar: 1, tick: 4080, offsetInPulse: 240 });
  });

  it('refuses a duration that crosses the bar line, leaving the document unchanged', () => {
    const history = newHistory();
    history.apply(doc => insertEvent(doc, E3, d(2, 1)));
    const before = history.present;
    expect(() => history.apply(doc => insertEvent(doc, E3, d(2)))).toThrow(/crosses a bar line/);
    expect(history.present).toBe(before);
  });

  it('refuses strings the instrument does not have', () => {
    const history = newHistory();
    expect(() => history.apply(doc => insertEvent(doc, [{ string: 7, fret: 0 }], d(4)))).toThrow(/String 7/);
  });

  it('stops at the end of an imported chart', () => {
    const history = importedHistory();
    // 5/4 + 7/8 + 2/8 = 19 eighths.
    for (let i = 0; i < 19; i++) history.apply(doc => insertEvent(doc, [], d(8)));
    expect(history.present.cursor).toEqual({ bar: 3, index: 0 });
    expect(cursorPosition(history.present)).toEqual({ ended: true });
    expect(() => history.apply(doc => insertEvent(doc, [], d(8)))).toThrow(/End of the chart/);
  });

  it('refuses a quarter at the last eighth of a 7/8 bar', () => {
    const history = importedHistory();
    for (let i = 0; i < 10 + 6; i++) history.apply(doc => insertEvent(doc, [], d(8)));
    expect(history.present.cursor).toEqual({ bar: 1, index: 6 });
    expect(() => history.apply(doc => insertEvent(doc, [], d(4)))).toThrow(/crosses/);
  });
});

describe('undo and redo', () => {
  it('restores the document and cursor', () => {
    const history = newHistory();
    history.apply(doc => insertEvent(doc, E3, d(4)));
    history.apply(doc => insertEvent(doc, E3, d(4)));
    expect(history.undo()).toBe(true);
    expect(mainTrack(history.present.song).bars[0]?.events).toHaveLength(1);
    expect(history.present.cursor).toEqual({ bar: 0, index: 1 });
    expect(history.redo()).toBe(true);
    expect(mainTrack(history.present.song).bars[0]?.events).toHaveLength(2);
    expect(history.redo()).toBe(false);
  });

  it('drops the redo branch after a new edit', () => {
    const history = newHistory();
    history.apply(doc => insertEvent(doc, E3, d(4)));
    history.undo();
    history.apply(doc => insertEvent(doc, [], d(4)));
    expect(history.canRedo).toBe(false);
  });

  it('never shares state between snapshots', () => {
    const history = newHistory();
    history.apply(doc => insertEvent(doc, E3, d(4)));
    const snapshot = history.present;
    history.apply(doc => insertEvent(doc, E3, d(4)));
    expect(mainTrack(snapshot.song).bars[0]?.events).toHaveLength(1);
  });
});

describe('document commands', () => {
  it('clears notes and shrinks a free timeline', () => {
    const history = newHistory();
    for (let i = 0; i < 9; i++) history.apply(doc => insertEvent(doc, E3, d(4)));
    expect(history.present.song.timeline.bars).toHaveLength(3);
    history.apply(clearNotes);
    expect(history.present.song.timeline.bars).toHaveLength(1);
    expect(history.present.cursor).toEqual({ bar: 0, index: 0 });
  });

  it('keeps bars with harmony when clearing a free timeline', () => {
    const history = newHistory();
    for (let i = 0; i < 9; i++) history.apply(doc => insertEvent(doc, E3, d(4)));
    history.apply(doc => setBarKey(doc, 1, { tonic: 7, scaleId: 'major' }));
    history.apply(clearNotes);
    expect(history.present.song.timeline.bars).toHaveLength(2);
  });

  it('changes instrument and tuning, re-placing notes', () => {
    const history = newHistory();
    history.apply(doc => insertEvent(doc, E3, d(4)));
    const report = history.apply(doc => setInstrument(doc, 'guitar-6', DROP_D, 'pitch'));
    expect(report).toMatchObject({ moved: 1, dropped: 0 });
    // G2 on a drop-D low string is fret 5.
    expect(mainTrack(history.present.song).bars[0]?.events[0]?.notes).toEqual([{ string: 6, fret: 5 }]);
    history.apply(doc => setInstrument(doc, BASS.id, BASS.tuning, 'pitch'));
    expect(mainTrack(history.present.song).instrumentId).toBe('bass-4');
    expect(mainTrack(history.present.song).tuning).toEqual(BASS.tuning);
    expect(history.present.cursor).toEqual({ bar: 0, index: 1 });
  });

  it('refuses a tuning with the wrong number of strings', () => {
    const history = newHistory();
    expect(() => history.apply(doc => setInstrument(doc, 'guitar-7', DROP_D, 'pitch'))).toThrow(/7 strings/);
  });

  it('resets an imported chart to free 4/4 at its opening tempo', () => {
    const history = importedHistory();
    history.apply(resetToFreeTimeline);
    const { song } = history.present;
    expect(song.timeline).toEqual({ extendable: true, bars: [{ time: { numerator: 4, denominator: 4 } }] });
    expect(song.tempo).toEqual({ bpm: 120, unit: 4, dotted: false });
  });

  it('keeps chord changes sorted and unique per position', () => {
    const history = newHistory();
    const am = { root: 9, quality: 'min' };
    const g = { root: 7, quality: 'maj' };
    history.apply(doc => setChord(doc, 0, 1920, g));
    history.apply(doc => setChord(doc, 0, 0, am));
    history.apply(doc => setChord(doc, 0, 1920, am));
    expect(history.present.song.timeline.bars[0]?.chords).toEqual([{ tick: 0, chord: am }, { tick: 1920, chord: am }]);
    history.apply(doc => { setChord(doc, 0, 0, null); setChord(doc, 0, 1920, null); });
    expect(history.present.song.timeline.bars[0]?.chords).toBeUndefined();
    expect(() => history.apply(doc => setChord(doc, 0, 3840, am))).toThrow(/outside/);
  });
});
