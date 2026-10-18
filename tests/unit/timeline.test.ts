import { describe, expect, it } from 'vitest';
import { importMetronomo } from '../../src/io/metronomoComposto';
import { replaceTimeline } from '../../src/model/editing';
import {
  barAtTick,
  endTick,
  layoutBars,
  quarterBpm,
  secondsToTick,
  subdivisionLabel,
  tickToSeconds
} from '../../src/model/timeline';
import { metronomoFixture, newDoc } from '../helpers';

function importedSong(file: unknown) {
  const doc = newDoc();
  const chart = importMetronomo(file);
  replaceTimeline(doc, chart.timeline, chart.tempo);
  return doc.song;
}

describe('metronomo-composto import', () => {
  it('builds a fixed timeline in ticks', () => {
    const chart = importMetronomo(metronomoFixture());
    expect(chart.timeline.extendable).toBe(false);
    expect(chart.timeline.source).toEqual({ app: 'metronomo-composto', name: 'test' });
    const layout = layoutBars(importedSong(metronomoFixture()));
    expect(layout.map(b => b.lengthTicks)).toEqual([4800, 3360, 960]);
    expect(layout.map(b => b.startTick)).toEqual([0, 4800, 8160]);
    expect(layout[1]?.accents).toEqual([2, 0, 1, 0, 1, 0, 0]);
  });

  it('expands repeats and records their source', () => {
    const file = metronomoFixture();
    file.bars[0]!.rep = 2;
    const bars = importMetronomo(file).timeline.bars;
    expect(bars).toHaveLength(4);
    expect(bars[1]?.source).toEqual({ index: 0, repetition: 1 });
  });

  it('accepts sixteenth and thirty-second denominators', () => {
    const file = metronomoFixture();
    Object.assign(file.bars[2]!, { den: 16 });
    expect(layoutBars(importedSong(file))[2]?.lengthTicks).toBe(480);
  });

  it('rejects bad denominators, accents and versions', () => {
    const unsupported = metronomoFixture();
    Object.assign(unsupported.bars[0]!, { den: 3 });
    expect(() => importMetronomo(unsupported)).toThrow(/denominators/);

    const invalid = metronomoFixture();
    invalid.bars[0]!.acc[0] = 9;
    expect(() => importMetronomo(invalid)).toThrow(/accent/);

    expect(() => importMetronomo({ ...metronomoFixture(), version: 99 })).toThrow(/version/);
  });

  it('writes tempo marks only where the tempo changes', () => {
    const file = metronomoFixture();
    file.perBar = true;
    Object.assign(file.bars[1]!, { bpm: 60 });
    const { timeline, tempo } = importMetronomo(file);
    expect(tempo).toEqual({ bpm: 120, unit: 4, dotted: false });
    expect(timeline.bars.map(b => b.tempo?.bpm)).toEqual([undefined, 60, 120]);
  });
});

describe('timing', () => {
  it('maps ticks to seconds across mixed meters', () => {
    const layout = layoutBars(importedSong(metronomoFixture()));
    expect(layout.at(-1)?.endSeconds).toBe(4.75);
    expect(tickToSeconds(layout, 4800)).toBe(2.5);
    expect(secondsToTick(layout, 2.5)).toBe(4800);
    expect(secondsToTick(layout, 4.75)).toBeNull();
    expect(tickToSeconds(layout, endTick(layout))).toBe(4.75);
    expect(() => tickToSeconds(layout, endTick(layout) + 1)).toThrow(/outside/);
    expect(barAtTick(layout, 4799)?.index).toBe(0);
  });

  it('counts the bar denominator as the beat in "denom" tempo mode', () => {
    const file = metronomoFixture();
    file.unit = 'denom';
    expect(layoutBars(importedSong(file)).at(-1)?.endSeconds).toBe(7);
  });

  it('applies per-bar tempo', () => {
    const file = metronomoFixture();
    file.perBar = true;
    Object.assign(file.bars[1]!, { bpm: 60 });
    expect(layoutBars(importedSong(file)).at(-1)?.endSeconds).toBe(6.5);
  });

  it('converts tempo marks to quarter notes per minute', () => {
    expect(quarterBpm({ bpm: 120, unit: 4, dotted: false })).toBe(120);
    expect(quarterBpm({ bpm: 120, unit: 8, dotted: false })).toBe(60);
    expect(quarterBpm({ bpm: 60, unit: 4, dotted: true })).toBe(90);
  });

  it('labels subdivisions', () => {
    expect(subdivisionLabel(480, 960)).toBe('&');
    expect(subdivisionLabel(240, 960)).toBe('e');
    expect(subdivisionLabel(720, 960)).toBe('a');
    expect(subdivisionLabel(120, 960)).toBe('');
  });
});
