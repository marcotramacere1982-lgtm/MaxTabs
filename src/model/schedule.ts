// How the song sounds: note spans (ties merged, let-ring extended, muted notes kept short)
// and the timed sounds for playback, including metronome clicks.

import { endTick, layoutBars, tickToSeconds, type BarLayout } from './timeline';
import { eventTicks } from './editing';
import { noteMidi } from './pitch';
import type { Accent, Song, TabEvent } from './song';

export interface ScheduledNote {
  kind: 'note';
  /** Seconds from the start of the song. */
  time: number;
  duration: number;
  midi: number;
  string: number;
  /** A muted, percussive note. */
  dead?: boolean;
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

/** One sounded note, from attack to release, in ticks. */
export interface NoteSpan {
  string: number;
  fret: number;
  midi: number;
  startTick: number;
  endTick: number;
  dead: boolean;
  letRing: boolean;
}

/**
 * When each string sounds. A tie extends the note before it; a let-ring note keeps sounding
 * (through rests too) until its string is played again or the song ends; a muted note is a
 * short hit. Playing a string always stops what was ringing on it.
 */
export function noteSpans(song: Song, layout: BarLayout[] = layoutBars(song)): NoteSpan[] {
  const track = song.tracks[0];
  if (!track) return [];
  const spans: NoteSpan[] = [];
  const open = new Map<number, NoteSpan>();
  const close = (string: number, at?: number): void => {
    const span = open.get(string);
    if (!span) return;
    // A let-ring note sounds until something replaces it.
    if (span.letRing && at !== undefined) span.endTick = Math.max(span.endTick, at);
    spans.push(span);
    open.delete(string);
  };

  for (const placed of placeEvents(song, layout)) {
    const struck = new Set<number>();
    for (const note of placed.event.notes) {
      struck.add(note.string);
      const ringing = open.get(note.string);
      if (note.tie && ringing && !ringing.dead && ringing.fret === note.fret && ringing.endTick >= placed.startTick) {
        ringing.endTick = Math.max(ringing.endTick, placed.endTick);
        ringing.letRing = ringing.letRing || Boolean(note.letRing);
        continue;
      }
      close(note.string, placed.startTick);
      open.set(note.string, {
        string: note.string,
        fret: note.fret,
        midi: noteMidi(track, note),
        startTick: placed.startTick,
        endTick: placed.endTick,
        dead: Boolean(note.dead),
        letRing: Boolean(note.letRing) && !note.dead
      });
    }
    // Strings not played now: ordinary notes have ended; let-ring notes carry on.
    for (const [string, span] of [...open]) {
      if (!struck.has(string) && !span.letRing) close(string);
    }
  }
  const songEnd = endTick(layout);
  for (const string of [...open.keys()]) close(string, songEnd);
  return spans.sort((a, b) => a.startTick - b.startTick || b.string - a.string);
}

/** Notes sounding at a tick (attacked earlier and not yet released). */
export function soundingAt(spans: readonly NoteSpan[], tick: number): NoteSpan[] {
  return spans.filter(s => tick >= s.startTick && tick < s.endTick);
}

export interface Schedule {
  layout: BarLayout[];
  spans: NoteSpan[];
  sounds: ScheduledSound[];
  /** Length of the song in seconds. */
  endSeconds: number;
}

/** Muted notes are a short percussive hit regardless of their written length. */
const DEAD_NOTE_SECONDS = 0.05;

export function buildSchedule(song: Song, options: { metronome: boolean }): Schedule {
  const layout = layoutBars(song);
  const spans = noteSpans(song, layout);
  const sounds: ScheduledSound[] = spans.map(span => {
    const time = tickToSeconds(layout, span.startTick);
    const duration = tickToSeconds(layout, span.endTick) - time;
    const note: ScheduledNote = {
      kind: 'note', time, duration: span.dead ? Math.min(duration, DEAD_NOTE_SECONDS) : duration,
      midi: span.midi, string: span.string
    };
    if (span.dead) note.dead = true;
    return note;
  });

  if (options.metronome) {
    for (const bar of layout) {
      const secondsPerPulse = (bar.endSeconds - bar.startSeconds) / bar.numerator;
      for (let pulse = 0; pulse < bar.numerator; pulse++) {
        sounds.push({ kind: 'click', time: bar.startSeconds + pulse * secondsPerPulse, accent: bar.accents[pulse] ?? 0 });
      }
    }
  }

  sounds.sort((a, b) => a.time - b.time);
  return { layout, spans, sounds, endSeconds: layout[layout.length - 1]?.endSeconds ?? 0 };
}
