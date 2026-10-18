import { describe, expect, it } from 'vitest';
import {
  durationCode,
  durationName,
  durationTicks,
  parseDurationCode,
  PPQ,
  TRIPLET,
  tryDurationTicks
} from '../../src/model/time';
import { d } from '../helpers';

describe('durations', () => {
  it('measures plain note values in ticks', () => {
    expect(PPQ).toBe(960);
    expect([1, 2, 4, 8, 16, 32, 64].map(v => durationTicks(d(v as never)))).toEqual([3840, 1920, 960, 480, 240, 120, 60]);
  });

  it('adds dots', () => {
    expect(durationTicks(d(4, 1))).toBe(1440);
    expect(durationTicks(d(4, 2))).toBe(1680);
    expect(durationTicks(d(64, 2))).toBe(105);
  });

  it('scales tuplets', () => {
    expect(durationTicks({ value: 8, dots: 0, tuplet: TRIPLET })).toBe(320);
    expect(durationTicks({ value: 32, dots: 0, tuplet: TRIPLET })).toBe(80);
    expect(durationTicks({ value: 16, dots: 0, tuplet: { actual: 5, normal: 4 } })).toBe(192);
  });

  it('rejects durations that are not whole ticks', () => {
    const septuplet = { value: 16 as const, dots: 0 as const, tuplet: { actual: 7, normal: 4 } };
    expect(tryDurationTicks(septuplet)).toBeNull();
    expect(() => durationTicks(septuplet)).toThrow(/not representable/);
  });

  it('names durations', () => {
    expect(durationName(d(4, 1))).toBe('Dotted quarter');
    expect(durationName({ value: 8, dots: 0, tuplet: TRIPLET })).toBe('Eighth triplet');
    expect(durationName(d(32))).toBe('Thirty-second');
  });

  it('round-trips duration codes', () => {
    for (const duration of [d(1), d(4, 1), d(16, 2), { value: 8 as const, dots: 0 as const, tuplet: TRIPLET }]) {
      expect(parseDurationCode(durationCode(duration))).toEqual(duration);
    }
    expect(() => parseDurationCode('3')).toThrow();
    expect(() => parseDurationCode('4...')).toThrow();
  });
});
