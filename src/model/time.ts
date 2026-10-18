// Musical time in ticks. 960 ticks per quarter note is the standard MIDI resolution and
// divides evenly by 2, 3, 4, 5, 6 and 8, so 64ths, triplets and quintuplets are exact.

export const PPQ = 960;
export const WHOLE_NOTE_TICKS = PPQ * 4;

/** Note value as the denominator of its fraction of a whole note: 4 is a quarter, 16 a sixteenth. */
export type NoteValue = 1 | 2 | 4 | 8 | 16 | 32 | 64;
export const NOTE_VALUES: readonly NoteValue[] = [1, 2, 4, 8, 16, 32, 64];

/** Time-signature denominators the timeline accepts. */
export type Denominator = 1 | 2 | 4 | 8 | 16 | 32;
export const DENOMINATORS: readonly Denominator[] = [1, 2, 4, 8, 16, 32];

export type Dots = 0 | 1 | 2;

/** `actual` notes in the time of `normal`: a triplet is { actual: 3, normal: 2 }. */
export interface Tuplet {
  actual: number;
  normal: number;
}

export interface Duration {
  value: NoteValue;
  dots: Dots;
  tuplet?: Tuplet;
}

export const TRIPLET: Tuplet = { actual: 3, normal: 2 };

export function isNoteValue(value: unknown): value is NoteValue {
  return NOTE_VALUES.includes(value as NoteValue);
}

export function isDenominator(value: unknown): value is Denominator {
  return DENOMINATORS.includes(value as Denominator);
}

/** Length of one pulse (the denominator's note value) in ticks. */
export function pulseTicks(denominator: Denominator): number {
  return WHOLE_NOTE_TICKS / denominator;
}

/** Duration length in ticks, or null when it is not a whole number of ticks (e.g. 16th septuplets). */
export function tryDurationTicks(duration: Duration): number | null {
  const base = WHOLE_NOTE_TICKS / duration.value;
  // One dot adds half the base, two dots add half plus a quarter.
  let ticks = base * (2 - 1 / 2 ** duration.dots);
  if (duration.tuplet) ticks = ticks * duration.tuplet.normal / duration.tuplet.actual;
  return Number.isInteger(ticks) ? ticks : null;
}

export function durationTicks(duration: Duration): number {
  const ticks = tryDurationTicks(duration);
  if (ticks === null) throw new Error(`${durationName(duration)} is not representable at ${PPQ} ticks per quarter.`);
  return ticks;
}

const VALUE_NAMES: Record<NoteValue, string> = {
  1: 'whole', 2: 'half', 4: 'quarter', 8: 'eighth', 16: 'sixteenth', 32: 'thirty-second', 64: 'sixty-fourth'
};

export function durationName(duration: Duration): string {
  const dotted = ['', 'dotted ', 'double-dotted '][duration.dots];
  const tuplet = duration.tuplet
    ? duration.tuplet.actual === 3 && duration.tuplet.normal === 2
      ? ' triplet'
      : ` (${duration.tuplet.actual}:${duration.tuplet.normal})`
    : '';
  const name = `${dotted}${VALUE_NAMES[duration.value]}${tuplet}`;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Compact text form used by UI controls: "4", "8.", "16..", "8:3/2". */
export function durationCode(duration: Duration): string {
  const tuplet = duration.tuplet ? `:${duration.tuplet.actual}/${duration.tuplet.normal}` : '';
  return `${duration.value}${'.'.repeat(duration.dots)}${tuplet}`;
}

export function parseDurationCode(code: string): Duration {
  const match = /^(\d+)(\.{0,2})(?::(\d+)\/(\d+))?$/.exec(code);
  const value = match ? Number(match[1]) : NaN;
  if (!match || !isNoteValue(value)) throw new Error(`Invalid duration code: ${code}`);
  const duration: Duration = { value, dots: (match[2]?.length ?? 0) as Dots };
  if (match[3] !== undefined) duration.tuplet = { actual: Number(match[3]), normal: Number(match[4]) };
  durationTicks(duration);
  return duration;
}
