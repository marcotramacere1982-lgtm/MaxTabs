import { describe, expect, it } from 'vitest';
import {
  addKeyChangeAtCursor,
  chordAtCursor,
  continueWithTie,
  insertEvent,
  keyOwnerBar,
  removeKeyChangeAtCursor,
  setChordAtCursor,
  setCursor,
  setKeyAtCursor,
  toggleTie
} from '../../src/model/editing';
import { harmonyAt, intervalLabel } from '../../src/model/harmony';
import { buildSchedule } from '../../src/model/schedule';
import { mainTrack } from '../../src/model/song';
import { TRIPLET } from '../../src/model/time';
import { defaultViewPrefs, parseProject, serializeProject } from '../../src/io/projectFormat';
import { d, newDoc, newHistory } from '../helpers';

const G = [{ string: 3, fret: 0 }];

describe('ties', () => {
  it('holds the last note across a bar line', () => {
    const history = newHistory();
    history.apply(doc => insertEvent(doc, [], d(2)));
    history.apply(doc => insertEvent(doc, G, d(2)));
    history.apply(doc => continueWithTie(doc, d(4)));
    const bars = mainTrack(history.present.song).bars;
    expect(bars[1]?.events[0]?.notes).toEqual([{ string: 3, fret: 0, tie: true }]);
    // One sound lasting a half plus a quarter.
    const notes = buildSchedule(history.present.song, { metronome: false }).sounds;
    expect(notes).toEqual([{ kind: 'note', time: 1, duration: 1.5, midi: 55, string: 3 }]);
  });

  it('refuses to tie from a bar that is not full', () => {
    const history = newHistory();
    history.apply(doc => insertEvent(doc, G, d(4)));
    history.amend(doc => setCursor(doc, 1, 0));
    expect(() => history.apply(doc => continueWithTie(doc, d(4)))).toThrow(/full bar/);
  });

  it('toggles a tie on the note under the cursor', () => {
    const history = newHistory();
    history.apply(doc => insertEvent(doc, G, d(4)));
    history.apply(doc => insertEvent(doc, G, d(4)));
    history.amend(doc => setCursor(doc, 0, 1));
    history.apply(toggleTie);
    expect(mainTrack(history.present.song).bars[0]?.events[1]?.notes[0]?.tie).toBe(true);
    history.apply(toggleTie);
    expect(mainTrack(history.present.song).bars[0]?.events[1]?.notes[0]?.tie).toBeUndefined();
  });

  it('explains when nothing matches to tie to', () => {
    const history = newHistory();
    history.apply(doc => insertEvent(doc, G, d(4)));
    history.apply(doc => insertEvent(doc, [{ string: 3, fret: 2 }], d(4)));
    expect(() => history.apply(toggleTie)).toThrow(/same string and fret/);
  });

  it('accepts triplets that fill a beat', () => {
    const history = newHistory();
    for (let i = 0; i < 3; i++) history.apply(doc => insertEvent(doc, G, { value: 8, dots: 0, tuplet: TRIPLET }));
    expect(history.present.cursor).toEqual({ bar: 0, index: 3 });
    const times = buildSchedule(history.present.song, { metronome: false }).sounds.map(s => s.time);
    expect(times.map(t => Math.round(t * 1000))).toEqual([0, 167, 333]);
  });
});

describe('key and chord at the cursor', () => {
  it('edits the song key until a key change is added, then that key change', () => {
    const history = newHistory();
    for (let i = 0; i < 4; i++) history.apply(doc => insertEvent(doc, G, d(1)));
    history.amend(doc => setCursor(doc, 2, 0));
    history.apply(doc => setKeyAtCursor(doc, { tonic: 9, scaleId: 'aeolian' }));
    expect(history.present.song.key).toEqual({ tonic: 9, scaleId: 'aeolian' });

    history.apply(doc => addKeyChangeAtCursor(doc, { tonic: 7, scaleId: 'mixolydian' }));
    expect(keyOwnerBar(history.present.song, 3)).toBe(2);
    history.amend(doc => setCursor(doc, 3, 0));
    history.apply(doc => setKeyAtCursor(doc, { tonic: 2, scaleId: 'dorian' }));
    expect(history.present.song.timeline.bars[2]?.key).toEqual({ tonic: 2, scaleId: 'dorian' });
    expect(history.present.song.key.tonic).toBe(9);

    history.amend(doc => setCursor(doc, 2, 0));
    history.apply(removeKeyChangeAtCursor);
    expect(keyOwnerBar(history.present.song, 3)).toBe(-1);
  });

  it('places chords at the cursor tick and reads them back', () => {
    const history = newHistory();
    history.apply(doc => insertEvent(doc, G, d(2)));
    history.apply(doc => setChordAtCursor(doc, { root: 7, quality: 'maj' }));
    expect(history.present.song.timeline.bars[0]?.chords).toEqual([{ tick: 1920, chord: { root: 7, quality: 'maj' } }]);
    expect(chordAtCursor(history.present)).toEqual({ root: 7, quality: 'maj' });
    history.amend(doc => setCursor(doc, 0, 0));
    expect(chordAtCursor(history.present)).toBeUndefined();
    history.amend(doc => setCursor(doc, 0, 1));
    history.apply(doc => setChordAtCursor(doc, null));
    expect(history.present.song.timeline.bars[0]?.chords).toBeUndefined();
  });

  it('adds the bar when placing a chord past the end of a free chart', () => {
    const history = newHistory();
    history.apply(doc => insertEvent(doc, G, d(1)));
    expect(history.present.cursor).toEqual({ bar: 1, index: 0 });
    history.apply(doc => setChordAtCursor(doc, { root: 9, quality: 'min' }));
    expect(history.present.song.timeline.bars).toHaveLength(2);
    expect(harmonyAt(history.present.song, 1, 0).chord).toEqual({ root: 9, quality: 'min' });
  });

  it('labels intervals', () => {
    expect([0, 3, 4, 7, 10, 11, 14].map(intervalLabel)).toEqual(['R', '♭3', '3', '5', '♭7', '7', '2']);
  });
});

describe('view preferences', () => {
  it('round-trip the overlay mode and triplet durations', () => {
    const view = { ...defaultViewPrefs(), overlayMode: 'both' as const, duration: { value: 8 as const, dots: 0 as const, tuplet: TRIPLET } };
    const loaded = parseProject(JSON.parse(JSON.stringify(serializeProject('x', newDoc(), view))));
    expect(loaded.view.overlayMode).toBe('both');
    expect(loaded.view.duration).toEqual({ value: 8, dots: 0, tuplet: TRIPLET });
  });
});
