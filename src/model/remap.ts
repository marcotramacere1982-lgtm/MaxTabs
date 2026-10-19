// Moving a track's notes onto a different tuning or string count.

import type { Note, Track } from './song';
import { eventTicks } from './editing';

/**
 * 'pitch': keep how notes sound, re-fingering where needed.
 * 'fret': keep string and fret numbers (the tab looks the same; the sound follows the new tuning).
 * In both modes, notes on strings the new instrument lacks are placed by pitch.
 */
export type RemapMode = 'pitch' | 'fret';

export interface RemapReport {
  /** Notes left on the same string and fret. */
  kept: number;
  /** Notes moved to another string or fret. */
  moved: number;
  /** Notes with no playable position on the new tuning. */
  dropped: number;
  /** Ties removed because the notes they joined no longer match. */
  tiesBroken: number;
}

/** Highest fret remapping will place a note on. */
export const REMAP_MAX_FRET = 24;

function openMidi(tuning: readonly number[], string: number): number | undefined {
  return tuning[tuning.length - string];
}

/**
 * Re-place every note of a track for a new tuning. Mutates the track, including its tuning.
 * `barLengths` are the timeline's bar lengths in ticks, needed to check ties across bars.
 */
export function remapTrack(track: Track, newTuning: readonly number[], mode: RemapMode,
  barLengths: readonly number[], maxFret = REMAP_MAX_FRET): RemapReport {
  const oldTuning = track.tuning;
  const report: RemapReport = { kept: 0, moved: 0, dropped: 0, tiesBroken: 0 };

  for (const bar of track.bars) {
    for (const event of bar.events) {
      const placed = new Map<number, Note>();
      const leftovers: { note: Note; midi: number }[] = [];

      // First pass: each note's natural position on the same string.
      for (const note of event.notes) {
        const oldOpen = openMidi(oldTuning, note.string);
        if (oldOpen === undefined) throw new Error(`String ${note.string} does not exist.`);
        const midi = oldOpen + note.fret;
        const newOpen = openMidi(newTuning, note.string);
        const fret = newOpen === undefined ? null : mode === 'fret' ? note.fret : midi - newOpen;
        if (fret !== null && fret >= 0 && fret <= maxFret && !placed.has(note.string)) {
          placed.set(note.string, { ...note, fret });
          if (fret === note.fret) report.kept++;
          else report.moved++;
        } else {
          leftovers.push({ note, midi });
        }
      }

      // Second pass: other free strings that can play the same pitch, closest fret first.
      for (const { note, midi } of leftovers) {
        let best: { string: number; fret: number; cost: number } | null = null;
        for (let string = 1; string <= newTuning.length; string++) {
          const open = openMidi(newTuning, string);
          if (open === undefined || placed.has(string)) continue;
          const fret = midi - open;
          if (fret < 0 || fret > maxFret) continue;
          const cost = Math.abs(fret - note.fret) * 10 + Math.abs(string - note.string);
          if (!best || cost < best.cost) best = { string, fret, cost };
        }
        if (best) {
          placed.set(best.string, { ...note, string: best.string, fret: best.fret });
          report.moved++;
        } else {
          report.dropped++;
        }
      }

      event.notes = [...placed.values()].sort((a, b) => a.string - b.string);
    }
  }

  track.tuning = [...newTuning];
  report.tiesBroken = repairTies(track, barLengths);
  return report;
}

/** Remove tie flags that no longer continue the same string and fret from the event just before. */
export function repairTies(track: Track, barLengths: readonly number[]): number {
  let broken = 0;
  let previous: { end: number; notes: Map<number, number> } | null = null;
  let barStart = 0;
  track.bars.forEach((bar, b) => {
    let tick = barStart;
    for (const event of bar.events) {
      for (const note of event.notes) {
        if (note.tie && note.dead) {
          delete note.tie;
          broken++;
        } else if (note.tie && !(previous && previous.end === tick && previous.notes.get(note.string) === note.fret)) {
          delete note.tie;
          broken++;
        }
      }
      tick += eventTicks(event);
      previous = { end: tick, notes: new Map(event.notes.filter(n => !n.dead).map(n => [n.string, n.fret])) };
    }
    // An underfull bar leaves a gap before the next bar, which breaks ties across it.
    barStart += barLengths[b] ?? 0;
  });
  return broken;
}
