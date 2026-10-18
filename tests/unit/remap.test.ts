import { describe, expect, it } from 'vitest';
import { remapTrack, repairTies } from '../../src/model/remap';
import { createTrack, type Note, type Track } from '../../src/model/song';
import { defaultTuning, requireTuningPreset } from '../../src/model/instruments';
import { noteMidi } from '../../src/model/pitch';
import { d } from '../helpers';

const STANDARD = defaultTuning('guitar-6').notes;
const DROP_D = requireTuningPreset('guitar-6/drop-d').notes;
const BAR = 3840;

/** A track with one 4/4 bar per entry; each bar is a list of quarter-note events. */
function track(bars: Note[][][], tuning = STANDARD, instrumentId = 'guitar-6'): Track {
  const t = createTrack('T', instrumentId, tuning, 0);
  t.bars = bars.map(events => ({ events: events.map(notes => ({ duration: d(4), notes })) }));
  return t;
}

/** Sounding pitches per event, so tests can check that keeping pitches really does. */
const pitches = (t: Track) => t.bars.flatMap(b => b.events.map(e => e.notes.map(n => noteMidi(t, n)).sort()));
const notes = (t: Track, bar = 0) => t.bars[bar]?.events.map(e => e.notes);

describe('keeping pitches', () => {
  it('re-frets notes on the same string when it can still reach them', () => {
    const t = track([[[{ string: 6, fret: 3 }], [{ string: 1, fret: 0 }]]]);
    const before = pitches(t);
    const report = remapTrack(t, DROP_D, 'pitch', [BAR]);
    expect(pitches(t)).toEqual(before);
    expect(notes(t)).toEqual([[{ string: 6, fret: 5 }], [{ string: 1, fret: 0 }]]);
    expect(report).toEqual({ kept: 1, moved: 1, dropped: 0, tiesBroken: 0 });
  });

  it('moves a note to another string when its own string cannot reach it', () => {
    // Open D on string 4, then retune so string 4 is higher (Open E raises it to E3).
    const t = track([[[{ string: 4, fret: 0 }]]]);
    const report = remapTrack(t, requireTuningPreset('guitar-6/open-e').notes, 'pitch', [BAR]);
    // D3 now lives on string 5 (B2) at fret 3.
    expect(notes(t)).toEqual([[{ string: 5, fret: 3 }]]);
    expect(report.moved).toBe(1);
  });

  it('drops notes below the lowest string and reports them', () => {
    const t = track([[[{ string: 6, fret: 0 }]]]);
    const report = remapTrack(t, requireTuningPreset('guitar-6/open-e').notes.map(n => n + 2), 'pitch', [BAR]);
    expect(report.dropped).toBe(1);
    expect(notes(t)).toEqual([[]]);
  });

  it('keeps every note of a chord on its own string', () => {
    const shape: Note[] = [0, 2, 2, 0, 0, 0].map((fret, i) => ({ string: 6 - i, fret }));
    const t = track([[shape]]);
    const before = pitches(t);
    const report = remapTrack(t, defaultTuning('guitar-7').notes, 'pitch', [BAR]);
    expect(pitches(t)).toEqual(before);
    expect(report.kept).toBe(6);
  });

  it('moves guitar notes onto a bass by pitch', () => {
    const t = track([[[{ string: 6, fret: 0 }], [{ string: 1, fret: 0 }]]]);
    const report = remapTrack(t, defaultTuning('bass-4').notes, 'pitch', [BAR]);
    expect(report.dropped).toBe(0);
    // E2 goes to the position nearest its old fret (D string, fret 2), not E string fret 12.
    // E4 only fits on the G string, at fret 21.
    expect(notes(t)).toEqual([[{ string: 2, fret: 2 }], [{ string: 1, fret: 21 }]]);
  });
});

describe('keeping fret numbers', () => {
  it('keeps the tab as written on matching strings', () => {
    const t = track([[[{ string: 6, fret: 3 }]]]);
    const report = remapTrack(t, DROP_D, 'fret', [BAR]);
    expect(notes(t)).toEqual([[{ string: 6, fret: 3 }]]);
    expect(report.kept).toBe(1);
  });

  it('places notes from strings the new instrument lacks by pitch', () => {
    const seven = track([[[{ string: 7, fret: 5 }]]], defaultTuning('guitar-7').notes, 'guitar-7');
    const report = remapTrack(seven, STANDARD, 'fret', [BAR]);
    // B1 + 5 = E2: the open low E.
    expect(notes(seven)).toEqual([[{ string: 6, fret: 0 }]]);
    expect(report.moved).toBe(1);
  });
});

describe('ties', () => {
  it('keeps ties whose notes move together', () => {
    const t = track([[[{ string: 6, fret: 3 }], [{ string: 6, fret: 3, tie: true }]]]);
    expect(remapTrack(t, DROP_D, 'pitch', [BAR]).tiesBroken).toBe(0);
    expect(t.bars[0]?.events[1]?.notes[0]?.tie).toBe(true);
  });

  it('breaks ties across the gap left by an underfull bar', () => {
    const t = track([[[{ string: 3, fret: 2 }]], [[{ string: 3, fret: 2, tie: true }]]]);
    expect(repairTies(t, [BAR, BAR])).toBe(1);
    expect(t.bars[1]?.events[0]?.notes[0]?.tie).toBeUndefined();
  });
});
