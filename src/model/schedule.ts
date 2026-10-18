// Turns a song into timed sound events: notes (with ties merged) and metronome clicks.

import { layoutBars, tickToSeconds, type BarLayout } from './timeline';
import { eventTicks } from './editing';
import { noteMidi } from './pitch';
import type { Accent, Note, Song, TabEvent } from './song';

export interface ScheduledNote {
  kind: 'note';
  /** Seconds from the start of the song. */
  time: number;
  duration: number;
  midi: number;
  string: number;
}

export interface ScheduledClick {
  kind: 'click';
  time: number;
  accent: Accent;
}

export type ScheduledSound = ScheduledNote | ScheduledClick;

export interface PlacedEvent {
  barIndex: number;
  index: number;
  startTick: number;
  endTick: number;
  event: TabEvent;
}

/** Every event of a track with its absolute tick range, in time order. */
export function placeEvents(song: Song, layout: BarLayout[] = layoutBars(song), trackIndex = 0): PlacedEvent[] {
  const track = song.tracks[trackIndex];
  if (!track) return [];
  const placed: PlacedEvent[] = [];
  track.bars.forEach((bar, barIndex) => {
    let tick = layout[barIndex]?.startTick ?? 0;
    bar.events.forEach((event, index) => {
      const endTick = tick + eventTicks(event);
      placed.push({ barIndex, index, startTick: tick, endTick, event });
      tick = endTick;
    });
  });
  return placed;
}

/** The event sounding at a tick, if any. */
export function eventAtTick(placed: readonly PlacedEvent[], tick: number): PlacedEvent | undefined {
  return placed.find(p => tick >= p.startTick && tick < p.endTick);
}

export interface Schedule {
  layout: BarLayout[];
  sounds: ScheduledSound[];
  /** Length of the song in seconds. */
  endSeconds: number;
}

export function buildSchedule(song: Song, options: { metronome: boolean }): Schedule {
  const layout = layoutBars(song);
  const sounds: ScheduledSound[] = [];
  const track = song.tracks[0];

  if (track) {
    // Notes still ringing, by string: a tie extends one instead of starting a new note.
    const open = new Map<number, { note: Note; start: number; end: number }>();
    const close = (string: number): void => {
      const ringing = open.get(string);
      if (!ringing) return;
      const time = tickToSeconds(layout, ringing.start);
      sounds.push({
        kind: 'note', time, duration: tickToSeconds(layout, ringing.end) - time,
        midi: noteMidi(track, ringing.note), string
      });
      open.delete(string);
    };

    for (const placed of placeEvents(song, layout)) {
      const sounding = new Set<number>();
      for (const note of placed.event.notes) {
        sounding.add(note.string);
        const ringing = open.get(note.string);
        if (note.tie && ringing && ringing.note.fret === note.fret && ringing.end === placed.startTick) {
          ringing.end = placed.endTick;
          continue;
        }
        close(note.string);
        open.set(note.string, { note, start: placed.startTick, end: placed.endTick });
      }
      for (const string of [...open.keys()]) if (!sounding.has(string)) close(string);
    }
    for (const string of [...open.keys()]) close(string);
  }

  if (options.metronome) {
    for (const bar of layout) {
      const secondsPerPulse = (bar.endSeconds - bar.startSeconds) / bar.numerator;
      for (let pulse = 0; pulse < bar.numerator; pulse++) {
        sounds.push({ kind: 'click', time: bar.startSeconds + pulse * secondsPerPulse, accent: bar.accents[pulse] ?? 0 });
      }
    }
  }

  sounds.sort((a, b) => a.time - b.time);
  return { layout, sounds, endSeconds: layout[layout.length - 1]?.endSeconds ?? 0 };
}
