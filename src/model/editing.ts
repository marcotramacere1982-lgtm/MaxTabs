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
import { requireInstrumentType } from './instruments';
import { remapTrack, repairTies, type RemapMode, type RemapReport } from './remap';

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
 * Switch the main track to another instrument and/or tuning, re-placing its notes (see RemapMode).
 * The cursor stays put; dropped notes can leave rests behind.
 */
export function setInstrument(doc: EditorDoc, instrumentId: string, tuning: readonly number[],
  mode: RemapMode): RemapReport {
  const type = requireInstrumentType(instrumentId);
  if (tuning.length !== type.stringCount)
    throw new Error(`${type.name} needs ${type.stringCount} strings, not ${tuning.length}.`);
  const track = mainTrack(doc.song);
  const barLengths = doc.song.timeline.bars.map(bar => barLengthTicks(bar.time));
  const report = remapTrack(track, tuning, mode, barLengths);
  track.instrumentId = instrumentId;
  return report;
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

// ---------- Cursor navigation and in-place editing ----------

function barIsFull(song: Song, barIndex: number): boolean {
  const def = song.timeline.bars[barIndex];
  const bar = mainTrack(song).bars[barIndex];
  return Boolean(def && bar && barFillTicks(bar) >= barLengthTicks(def.time));
}

/** The event the cursor is on, or undefined at an append position. */
export function eventAtCursor(doc: EditorDoc): TabEvent | undefined {
  return mainTrack(doc.song).bars[doc.cursor.bar]?.events[doc.cursor.index];
}

/** Where the event just before the cursor is (possibly in an earlier bar), if any. */
export function previousEventPosition(doc: EditorDoc): { bar: number; index: number } | undefined {
  if (doc.cursor.index > 0) return { bar: doc.cursor.bar, index: doc.cursor.index - 1 };
  // At the start of a bar: the last event of the bar before, if it has one.
  const previous = doc.cursor.bar - 1;
  const count = mainTrack(doc.song).bars[previous]?.events.length ?? 0;
  return count > 0 ? { bar: previous, index: count - 1 } : undefined;
}

/** Move the cursor somewhere else; positions past the end are clamped. */
export function setCursor(doc: EditorDoc, bar: number, index: number): void {
  const { song } = doc;
  const barCount = song.timeline.bars.length;
  const target = Math.max(0, Math.min(bar, barCount));
  const events = mainTrack(song).bars[target]?.events.length ?? 0;
  doc.cursor = { bar: target, index: Math.max(0, Math.min(index, events)) };
  // The end of a full bar is the start of the next one.
  if (doc.cursor.index === events && events > 0 && barIsFull(song, target)) {
    doc.cursor = { bar: target + 1, index: 0 };
  }
}

/** Step the cursor one event forward (1) or back (-1), crossing bar lines. */
export function moveCursor(doc: EditorDoc, step: 1 | -1): void {
  const { song, cursor } = doc;
  const bars = mainTrack(song).bars;
  const barCount = song.timeline.bars.length;
  if (step === 1) {
    const events = bars[cursor.bar]?.events.length ?? 0;
    if (cursor.bar >= barCount) return;
    if (cursor.index < events) setCursor(doc, cursor.bar, cursor.index + 1);
    else if (cursor.bar + 1 < barCount || song.timeline.extendable) doc.cursor = { bar: cursor.bar + 1, index: 0 };
    return;
  }
  if (cursor.index > 0) {
    doc.cursor = { bar: cursor.bar, index: cursor.index - 1 };
    return;
  }
  if (cursor.bar === 0) return;
  const previous = cursor.bar - 1;
  const events = bars[previous]?.events.length ?? 0;
  // Land on the previous bar's free space if it has some, otherwise on its last event.
  doc.cursor = { bar: previous, index: barIsFull(song, previous) ? Math.max(0, events - 1) : events };
}

/**
 * Write notes (a rest when empty) at the cursor: replace the event the cursor is on, keeping its
 * duration, or append a new event of `duration`. The cursor then moves past it.
 */
export function writeAtCursor(doc: EditorDoc, notes: Note[], duration: Duration): void {
  const event = eventAtCursor(doc);
  if (!event) {
    insertEvent(doc, notes, duration);
    return;
  }
  const track = mainTrack(doc.song);
  for (const note of notes) {
    if (openStringMidi(track, note.string) === undefined)
      throw new Error(`String ${note.string} does not exist on this instrument.`);
  }
  event.notes = notes.map(n => ({ ...n }));
  repairTies(track, barLengths(doc.song));
  moveCursor(doc, 1);
}

/**
 * Add a note to the current event as part of a chord, replacing any note on the same string:
 * the event under the cursor, or the one just entered when the cursor is at an append position.
 */
export function addNoteToChord(doc: EditorDoc, note: Note): void {
  const track = mainTrack(doc.song);
  if (openStringMidi(track, note.string) === undefined)
    throw new Error(`String ${note.string} does not exist on this instrument.`);
  const position = eventAtCursor(doc) ? doc.cursor : previousEventPosition(doc);
  const event = position && track.bars[position.bar]?.events[position.index];
  if (!event) throw new Error('Write a note first, then Shift+click to add chord notes to it.');
  event.notes = [...event.notes.filter(n => n.string !== note.string), { ...note }]
    .sort((a, b) => a.string - b.string);
  repairTies(track, barLengths(doc.song));
}

/** Delete the event under the cursor (Delete key). Later events in the bar move up. */
export function deleteAtCursor(doc: EditorDoc): void {
  const bar = mainTrack(doc.song).bars[doc.cursor.bar];
  if (!eventAtCursor(doc) || !bar) throw new Error('Nothing to delete at the cursor.');
  bar.events.splice(doc.cursor.index, 1);
  repairTies(mainTrack(doc.song), barLengths(doc.song));
}

/** Delete the event before the cursor (Backspace) and move the cursor back. */
export function deleteBeforeCursor(doc: EditorDoc): void {
  const position = previousEventPosition(doc);
  if (!position) throw new Error('Nothing to delete before the cursor.');
  mainTrack(doc.song).bars[position.bar]?.events.splice(position.index, 1);
  doc.cursor = position;
  repairTies(mainTrack(doc.song), barLengths(doc.song));
}

/** Change the duration of the event under the cursor, if the bar has room. */
export function setDurationAtCursor(doc: EditorDoc, duration: Duration): void {
  const event = eventAtCursor(doc);
  const bar = mainTrack(doc.song).bars[doc.cursor.bar];
  const def = doc.song.timeline.bars[doc.cursor.bar];
  if (!event || !bar || !def) throw new Error('Put the cursor on a note or rest to change its duration.');
  const fill = barFillTicks(bar) - eventTicks(event) + durationTicks(duration);
  if (fill > barLengthTicks(def.time)) throw new Error('Not enough room in this bar for that duration.');
  event.duration = { ...duration };
  repairTies(mainTrack(doc.song), barLengths(doc.song));
}

function barLengths(song: Song): number[] {
  return song.timeline.bars.map(bar => barLengthTicks(bar.time));
}

/** The event being worked on: the one under the cursor, or else the one just before it. */
export function currentEvent(doc: EditorDoc): TabEvent | undefined {
  const at = eventAtCursor(doc);
  if (at) return at;
  const previous = previousEventPosition(doc);
  return previous && mainTrack(doc.song).bars[previous.bar]?.events[previous.index];
}
