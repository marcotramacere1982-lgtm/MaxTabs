import { describe, expect, it } from 'vitest';
import { eventWidth, layoutTab } from '../../src/ui/tabLayout';
import { layoutBarDefs } from '../../src/model/timeline';
import type { BarDef, TrackBar } from '../../src/model/song';
import { d } from '../helpers';

const fourFour = (count: number): BarDef[] => Array.from({ length: count }, () => ({ time: { numerator: 4, denominator: 4 } }));
const tempo = { bpm: 120, unit: 4 as const, dotted: false };

function layout(defs: BarDef[], trackBars: TrackBar[], width: number, maxBarsPerRow = 8) {
  return layoutTab({ bars: layoutBarDefs(defs, tempo), defs, trackBars, width, maxBarsPerRow });
}

describe('event spacing', () => {
  it('gives longer notes more room, sub-linearly', () => {
    expect(eventWidth(480)).toBeGreaterThan(eventWidth(240));
    expect(eventWidth(960) / eventWidth(480)).toBeLessThan(2);
  });
});

describe('line breaking', () => {
  it('fits as many bars per row as the width allows, and no more than the maximum', () => {
    const defs = fourFour(12);
    expect(layout(defs, [], 4000).map(s => s.bars.length)).toEqual([8, 4]);
    const narrow = layout(defs, [], 400);
    expect(narrow.every(s => s.bars.length >= 1)).toBe(true);
    expect(narrow.length).toBeGreaterThan(2);
  });

  it('justifies full rows to the width and leaves a short last row alone', () => {
    const rows = layout(fourFour(5), [], 700, 4);
    expect(rows[0]?.width).toBeCloseTo(700);
    expect(rows[1]?.width).toBeLessThan(700 * 0.7);
  });

  it('shows the time signature on the first bar and where it changes', () => {
    const defs: BarDef[] = [...fourFour(2), { time: { numerator: 7, denominator: 8 } }, { time: { numerator: 7, denominator: 8 } }];
    const shown = layout(defs, [], 4000).flatMap(s => s.bars.map(b => b.showTime));
    expect(shown).toEqual([true, false, true, false]);
  });
});

describe('bar content', () => {
  it('places events in order and leaves free space in underfull bars', () => {
    const trackBars: TrackBar[] = [{ events: [{ duration: d(4), notes: [] }, { duration: d(8), notes: [] }] }];
    const [system] = layout(fourFour(1), trackBars, 4000);
    const bar = system!.bars[0]!;
    expect(bar.events.map(e => [e.startTick, e.endTick])).toEqual([[0, 960], [960, 1440]]);
    expect(bar.events[1]!.x).toBeCloseTo(bar.events[0]!.x + bar.events[0]!.width);
    expect(bar.append?.startTick).toBe(1440);
  });

  it('has no free space in a full bar', () => {
    const trackBars: TrackBar[] = [{ events: [{ duration: d(1), notes: [] }] }];
    expect(layout(fourFour(1), trackBars, 4000)[0]!.bars[0]!.append).toBeNull();
  });
});
