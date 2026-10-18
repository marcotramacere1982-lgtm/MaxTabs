// Editing commands. Each mutates the EditorDoc it is given; run them through History.apply
// so failures leave the document unchanged and every edit can be undone.

import { durationTicks, pulseTicks, type Duration } from './time';
import { barLengthTicks, layoutBars, quarterBpm } from './timeline';
import { openStringMidi } from './pitch';
import {
  mainTrack,
  type BarDef,
  type Chord,
  type EditorDoc,
  type Key,
  type Note,
  type Song,
  type TabEvent,
  type TempoMark,
  type Timeline,
  type TrackBar
} from './song';
import type { InstrumentDef } from './instruments';

export function eventTicks(event: TabEvent): number {
  return durationTicks(event.duration);
}

/** Ticks used by the first `count` events of a bar (all of them by default). */
export function barFillTicks(bar: TrackBar, count = bar.events.length): number {
  let ticks = 0;
  for (let i = 0; i < count; i++) {
    const event = bar.events[i];
    if (event) ticks += eventTicks(event);
  }
  return ticks;
}

export type CursorPosition =
  | { ended: true }
  | {
    ended: false;
    /** 0-based bar index; may be one past the last bar of an extendable timeline. */
    bar: number;
    tickInBar: number;
    /** Absolute tick from the start of the song. */
    tick: number;
    /** 0-based pulse within the bar. */
    pulse: number;
    offsetInPulse: number;
    pulseTicks: number;
  };

export function cursorPosition(doc: EditorDoc): CursorPosition {
  const { song, cursor } = doc;
  const layout = layoutBars(song);
  const bar = layout[cursor.bar];
  let tickInBar: number;
  let startTick: number;
  let pulse: number;
  if (bar) {
    tickInBar = barFillTicks(requireTrackBar(song, cursor.bar), cursor.index);
    startTick = bar.startTick;
    pulse = bar.pulseTicks;
  } else {
    const last = song.timeline.bars[song.timeline.bars.length - 1];
    const lastLayout = layout[layout.length - 1];
    if (!song.timeline.extendable || !last || !lastLayout) return { ended: true };
    tickInBar = 0;
    startTick = lastLayout.startTick + lastLayout.lengthTicks;
    pulse = pulseTicks(last.time.denominator);
  }
  return {
    ended: false,
    bar: cursor.bar,
    tickInBar,
    tick: startTick + tickInBar,
    pulse: Math.floor(tickInBar / pulse),
    offsetInPulse: tickInBar % pulse,
    pulseTicks: pulse
  };
}

function requireTrackBar(song: Song, barIndex: number): TrackBar {
  const bar = mainTrack(song).bars[barIndex];
  if (!bar) throw new Error(`Bar ${barIndex + 1} does not exist.`);
  return bar;
}

function requireBarDef(song: Song, barIndex: number): BarDef {
  const bar = song.timeline.bars[barIndex];
  if (!bar) throw new Error(`Bar ${barIndex + 1} does not exist.`);
  return bar;
}

/** Add an empty bar at the end, copying the last bar's time signature. */
export function appendBar(song: Song): void {
  const last = song.timeline.bars[song.timeline.bars.length - 1];
  if (!last) throw new Error('Timeline has no bars.');
  song.timeline.bars.push({ time: { ...last.time } });
  for (const track of song.tracks) track.bars.push({ events: [] });
}

/** Insert a note or rest at the cursor and advance past it. */
export function insertEvent(doc: EditorDoc, notes: Note[], duration: Duration): void {
  const { song, cursor } = doc;
  const track = mainTrack(song);
  if (cursor.bar === song.timeline.bars.length) {
    if (!song.timeline.extendable) throw new Error('End of the chart. Undo or clear notes to continue.');
    appendBar(song);
  }
  for (const note of notes) {
    if (openStringMidi(track, note.string) === undefined)
      throw new Error(`String ${note.string} does not exist on this instrument.`);
  }
  const barDef = requireBarDef(song, cursor.bar);
  const bar = requireTrackBar(song, cursor.bar);
  const length = barLengthTicks(barDef.time);
  const fill = barFillTicks(bar);
  if (fill + durationTicks(duration) > length) {
    throw new Error(cursor.index === bar.events.length
      ? 'This duration crosses a bar line. Choose a shorter duration.'
      : 'Not enough room in this bar for that duration.');
  }
  bar.events.splice(cursor.index, 0, { duration: { ...duration }, notes: notes.map(n => ({ ...n })) });
  cursor.index += 1;
  if (cursor.index === bar.events.length && barFillTicks(bar) === length) {
    cursor.bar += 1;
    cursor.index = 0;
  }
}

/** Is a bar free of anything worth keeping when trimming a free timeline? */
function isPlainBar(bar: BarDef): boolean {
  return !bar.tempo && !bar.key && !bar.chords?.length;
}

/** Remove all notes and rests, keeping the timeline. Free timelines shrink back to their last meaningful bar. */
export function clearNotes(doc: EditorDoc): void {
  const { song } = doc;
  for (const track of song.tracks) for (const bar of track.bars) bar.events = [];
  if (song.timeline.extendable) {
    let count = song.timeline.bars.length;
    while (count > 1 && isPlainBar(requireBarDef(song, count - 1))) count--;
    song.timeline.bars.length = count;
    for (const track of song.tracks) track.bars.length = count;
  }
  doc.cursor = { bar: 0, index: 0 };
}

/**
 * Switch the main track's instrument. Notes keep their string and fret when the string count
 * matches; otherwise they are cleared. Returns true when notes were cleared.
 */
export function setInstrument(doc: EditorDoc, instrument: InstrumentDef): boolean {
  const track = mainTrack(doc.song);
  const cleared = track.tuning.length !== instrument.tuning.length;
  if (cleared) clearNotes(doc);
  track.instrumentId = instrument.id;
  track.tuning = [...instrument.tuning];
  return cleared;
}

export function hasTempoChanges(song: Song): boolean {
  return song.timeline.bars.some(bar => bar.tempo);
}

export function setTempoBpm(doc: EditorDoc, bpm: number): void {
  doc.song.tempo.bpm = bpm;
}

export function setSongKey(doc: EditorDoc, key: Key): void {
  doc.song.key = { ...key };
}

/** Set or remove (null) a key change at the start of a bar. */
export function setBarKey(doc: EditorDoc, barIndex: number, key: Key | null): void {
  const bar = requireBarDef(doc.song, barIndex);
  if (key) bar.key = { ...key };
  else delete bar.key;
}

/** Set, replace or remove (null) the chord symbol at a position in a bar. */
export function setChord(doc: EditorDoc, barIndex: number, tick: number, chord: Chord | null): void {
  const bar = requireBarDef(doc.song, barIndex);
  if (!Number.isInteger(tick) || tick < 0 || tick >= barLengthTicks(bar.time))
    throw new Error('Chord position is outside the bar.');
  const chords = (bar.chords ?? []).filter(change => change.tick !== tick);
  if (chord) chords.push({ tick, chord: { ...chord } });
  chords.sort((a, b) => a.tick - b.tick);
  if (chords.length) bar.chords = chords;
  else delete bar.chords;
}

/** Replace the timeline (e.g. an imported rhythm chart). Notes are removed. */
export function replaceTimeline(doc: EditorDoc, timeline: Timeline, tempo: TempoMark): void {
  const { song } = doc;
  song.timeline = structuredClone(timeline);
  song.tempo = { ...tempo };
  for (const track of song.tracks) {
    track.bars = song.timeline.bars.map(() => ({ events: [] }));
  }
  doc.cursor = { bar: 0, index: 0 };
}

/** Return to a free, growing 4/4 timeline at the song's opening tempo (in quarter notes). Notes are removed. */
export function resetToFreeTimeline(doc: EditorDoc): void {
  const opening = layoutBars(doc.song)[0]?.tempo ?? doc.song.tempo;
  const bpm = Math.min(300, Math.max(20, Math.round(quarterBpm(opening))));
  replaceTimeline(doc, { extendable: true, bars: [{ time: { numerator: 4, denominator: 4 } }] },
    { bpm, unit: 4, dotted: false });
}
