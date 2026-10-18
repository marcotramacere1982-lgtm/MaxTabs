import { describe, expect, it } from 'vitest';
import fixtureJson from '../fixtures/metronomo-test.json';
import { importMetronomo } from '../../src/importers/metronomoComposto';
import {
  addNoteEvent,
  addRestEvent,
  applyRhythmChart,
  createState,
  getCursorPosition,
  undoLastEvent
} from '../../src/state';
import { chartEnd, secondsToSlot, slotToSeconds, timedBars } from '../../src/timeline';
import type { TabEvent } from '../../src/types';

const fixture = (): typeof fixtureJson => structuredClone(fixtureJson);

describe('metronomo-composto import', () => {
  it('expands the sample into slot-positioned bars', () => {
    const chart = importMetronomo(fixture());
    expect(chart.bars.map(b => b.lengthSlots)).toEqual([10, 7, 2]);
    expect(chart.bars.map(b => b.startSlot)).toEqual([0, 10, 17]);
  });

  it('expands repeats', () => {
    const repeat = fixture();
    repeat.bars[0]!.rep = 2;
    expect(importMetronomo(repeat).bars).toHaveLength(4);
  });

  it('rejects unsupported denominators, bad accents and unknown versions', () => {
    const unsupported = fixture();
    unsupported.bars[0]!.den = 16;
    expect(() => importMetronomo(unsupported)).toThrow(/denominators/);

    const invalid = fixture();
    invalid.bars[0]!.acc[0] = 9;
    expect(() => importMetronomo(invalid)).toThrow(/accent/);

    expect(() => importMetronomo({ ...fixture(), version: 99 })).toThrow(/version/);
  });
});

describe('timing', () => {
  it('maps slots to seconds across mixed meters', () => {
    const state = createState();
    applyRhythmChart(state, importMetronomo(fixture()));
    const times = timedBars(state);
    expect(times.at(-1)?.endSeconds).toBe(4.75);
    expect(slotToSeconds(times, 10)).toBe(2.5);
    expect(secondsToSlot(times, 2.5)).toBe(10);
    expect(secondsToSlot(times, 4.75)).toBeNull();
    expect(chartEnd(state)).toBe(19);
  });

  it('applies denominator-unit tempo', () => {
    const denom = fixture();
    denom.unit = 'denom';
    const state = createState();
    applyRhythmChart(state, importMetronomo(denom));
    expect(timedBars(state).at(-1)?.endSeconds).toBe(7);
  });

  it('applies per-bar tempo', () => {
    const variable = fixture();
    variable.perBar = true;
    // The JSON fixture types bpm as null; assign through Object.assign to set a number.
    Object.assign(variable.bars[1]!, { bpm: 60 });
    const state = createState();
    applyRhythmChart(state, importMetronomo(variable));
    expect(timedBars(state).at(-1)?.endSeconds).toBe(6.5);
  });

  it('uses 8-slot bars in free 4/4', () => {
    const free = createState();
    free.events = [{ startSlot: 0, durationSlots: 2 } as TabEvent];
    expect(chartEnd(free)).toBe(8);
  });
});

describe('editing within an imported chart', () => {
  const note = { string: 6, stringLabel: 'E', fret: 3, midi: 43, noteName: 'G2' };

  it('reports the cursor bar', () => {
    const state = createState();
    applyRhythmChart(state, importMetronomo(fixture()));
    state.cursorSlot = 10;
    expect(getCursorPosition(state)).toMatchObject({ ended: false, bar: 2 });
  });

  it('refuses durations that cross a bar line, without mutating', () => {
    const state = createState();
    applyRhythmChart(state, importMetronomo(fixture()));
    state.cursorSlot = 9;
    state.selectedDurationSlots = 2;
    expect(() => addRestEvent(state)).toThrow(/crosses/);
    expect(state.events).toHaveLength(0);
  });

  it('advances and undoes the cursor', () => {
    const state = createState();
    applyRhythmChart(state, importMetronomo(fixture()));
    state.cursorSlot = 9;
    addNoteEvent(state, note);
    expect(state.cursorSlot).toBe(10);
    undoLastEvent(state);
    expect(state.cursorSlot).toBe(9);
  });

  it('refuses insertion past the end of the chart', () => {
    const state = createState();
    applyRhythmChart(state, importMetronomo(fixture()));
    state.cursorSlot = 19;
    expect(() => addRestEvent(state)).toThrow(/End/);
  });
});
