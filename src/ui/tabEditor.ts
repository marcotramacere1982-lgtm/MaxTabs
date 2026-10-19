// SVG tab view: tab staff with fret numbers, rhythm stems and beams below, bar lines, time
// signatures, chord symbols, ties, the edit cursor and the playhead. Clicking places the cursor.

import { mainTrack, type BarDef, type Bend, type Note, type TabEvent, type Track } from '../model/song';
import { pitchClassName, stringsOf } from '../model/pitch';
import { getScale } from '../model/scales';
import { layoutBarDefs, type BarLayout } from '../model/timeline';
import { cursorPosition } from '../model/editing';
import { chordSymbol } from '../model/harmony';
import { noteSpans, type NoteSpan } from '../model/schedule';
import { layoutTab, TIME_SIGNATURE_WIDTH, type BarBox, type EventBox, type SystemBox } from './tabLayout';
import type { UiState } from './uiState';
import { releaseControlFocus } from './dom';

const SVG_NS = 'http://www.w3.org/2000/svg';
const LABEL_W = 50;
const TOP = 44;
const STRING_GAP = 13;
const STEM_GAP = 9;
const STEM = 22;
const SYSTEM_GAP = 22;
const NOTE_OFFSET = 10;
const BEAM_GAP = 4;

type Attrs = Record<string, string | number>;

function svg<K extends keyof SVGElementTagNameMap>(name: K, attrs: Attrs = {}, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  parent?.append(node);
  return node;
}

function text(parent: Element, x: number, y: number, content: string, className: string): SVGTextElement {
  const node = svg('text', { x, y, class: className }, parent);
  node.textContent = content;
  return node;
}

interface PlacedSystem {
  box: SystemBox;
  top: number;
  staffTop: number;
  staffBottom: number;
  bottom: number;
}

export interface TabViewCallbacks {
  /** The user clicked a position in the tab; `string` is the string line nearest the click. */
  onCursor: (bar: number, index: number, string: number | null) => void;
  /** Right-click or long-press on a position: open the technique menu there. */
  onContextMenu: (bar: number, index: number, string: number | null, x: number, y: number) => void;
}

const LONG_PRESS_MS = 550;

export class TabView {
  private readonly root: SVGSVGElement;
  private systems: PlacedSystem[] = [];
  private playhead: SVGRectElement | null = null;
  private last: UiState | null = null;
  private lastWidth = 0;
  private stringCount = 6;
  /** Fret of the note before each note on the same string, for h/p labels and slide direction. */
  private previousFret = new Map<Note, number>();
  private pressTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly container: HTMLElement, private readonly callbacks: TabViewCallbacks) {
    this.root = svg('svg', { class: 'tab-svg', role: 'presentation' });
    container.replaceChildren(this.root);
    this.root.addEventListener('pointerdown', event => this.handlePointer(event));
    this.root.addEventListener('contextmenu', event => {
      const hit = this.hitTest(event.clientX, event.clientY);
      if (!hit) return;
      event.preventDefault();
      this.callbacks.onContextMenu(hit.bar, hit.index, hit.string, event.clientX, event.clientY);
    });
    const cancelPress = (): void => {
      if (this.pressTimer !== null) clearTimeout(this.pressTimer);
      this.pressTimer = null;
    };
    this.root.addEventListener('pointerup', cancelPress);
    this.root.addEventListener('pointercancel', cancelPress);
    this.root.addEventListener('pointermove', cancelPress);
    new ResizeObserver(() => {
      const width = this.availableWidth();
      if (this.last && Math.abs(width - this.lastWidth) > 1) this.render(this.last);
    }).observe(container);
  }

  private availableWidth(): number {
    const style = getComputedStyle(this.container);
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    return Math.max(320, this.container.clientWidth - padding);
  }

  render(ui: UiState): void {
    this.last = ui;
    const { song } = ui.doc;
    const track = mainTrack(song);
    const strings = stringsOf(track.tuning);
    this.stringCount = strings.length;
    this.previousFret = previousFrets(track);
    const width = this.availableWidth();
    this.lastWidth = width;

    // A free timeline shows one empty bar past the end to write into.
    const defs: BarDef[] = [...song.timeline.bars];
    const lastDef = defs[defs.length - 1];
    if (song.timeline.extendable && lastDef) defs.push({ time: { ...lastDef.time } });
    const bars = layoutBarDefs(defs, song.tempo);
    const systems = layoutTab({
      bars, defs, trackBars: track.bars, width: width - LABEL_W - 2, maxBarsPerRow: ui.view.barsPerRow
    });

    const root = this.root;
    root.replaceChildren();
    const staffHeight = STRING_GAP * (strings.length - 1);
    let y = 0;
    this.systems = systems.map(box => {
      const placed = {
        box, top: y, staffTop: y + TOP, staffBottom: y + TOP + staffHeight,
        bottom: y + TOP + staffHeight + STEM_GAP + STEM + 14
      };
      y = placed.bottom + SYSTEM_GAP;
      return placed;
    });
    const height = Math.max(0, y - SYSTEM_GAP);
    root.setAttribute('width', String(width));
    root.setAttribute('height', String(height));
    root.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const position = cursorPosition(ui.doc);
    const cursorLayer = svg('g', {}, root);
    const finalBar = song.timeline.extendable ? -1 : song.timeline.bars.length - 1;

    this.systems.forEach((system, s) => {
      const g = svg('g', {}, root);
      const right = LABEL_W + system.box.width;
      strings.forEach((string, i) => {
        const lineY = system.staffBottom - i * STRING_GAP;
        svg('line', { class: 'tab-line', x1: LABEL_W, x2: right, y1: lineY, y2: lineY }, g);
        text(g, LABEL_W - 12, lineY, string.label, 'tab-label');
      });
      if (s === 0) {
        const mid = (system.staffTop + system.staffBottom) / 2;
        ['T', 'A', 'B'].forEach((letter, i) => text(g, 12, mid + (i - 1) * 11, letter, 'tab-clef'));
      }
      svg('line', { class: 'tab-barline', x1: LABEL_W, x2: LABEL_W, y1: system.staffTop, y2: system.staffBottom }, g);

      for (const bar of system.box.bars) {
        const x0 = LABEL_W + bar.x;
        const x1 = x0 + bar.width;
        const isFinal = bar.index === finalBar;
        svg('line', {
          class: isFinal ? 'tab-barline is-final' : 'tab-barline', x1, x2: x1, y1: system.staffTop, y2: system.staffBottom
        }, g);
        const isVirtual = bar.index >= song.timeline.bars.length;
        text(g, x0 + 4, system.top + 10, String(bar.index + 1), isVirtual ? 'tab-barnum is-virtual' : 'tab-barnum');
        if (bar.def.key) {
          const scale = getScale(bar.def.key.scaleId);
          text(g, x0 + 20, system.top + 10, `Key: ${pitchClassName(bar.def.key.tonic)} ${scale?.name ?? ''}`, 'tab-key');
        }
        if (bar.showTime) this.drawTimeSignature(g, x0 + bar.contentX - TIME_SIGNATURE_WIDTH + 8, system, bar.bar);
        for (const change of bar.def.chords ?? []) {
          text(g, x0 + tickX(bar, bar.bar.startTick + change.tick) + 2, system.top + 22, chordSymbol(change.chord), 'tab-chord');
        }
        this.drawBarEvents(g, system, bar, x0, strings.length);
      }

      if (!position.ended) {
        for (const bar of system.box.bars) {
          if (bar.index !== position.bar) continue;
          const event = bar.events[ui.doc.cursor.index];
          const x0 = LABEL_W + bar.x;
          const [cx, cw] = event
            ? [x0 + event.x, event.width]
            : [x0 + (bar.append?.x ?? bar.contentX), Math.min(22, bar.append?.width ?? 22)];
          svg('rect', {
            class: event ? 'tab-cursor' : 'tab-cursor is-append',
            x: cx, y: system.staffTop - 9, width: cw, height: system.staffBottom - system.staffTop + 18, rx: 6
          }, cursorLayer);
        }
      }
    });

    this.drawLetRing(noteSpans(song).filter(span => span.letRing), strings.length);
    this.drawSelection(ui, strings.length);
    this.playhead = svg('rect', { class: 'tab-playhead', x: -100, y: 0, width: 0, height: 0, rx: 6 }, root);
    this.updatePlayback(ui);
  }

  /** Outline the selected note of the chord at the cursor. */
  private drawSelection(ui: UiState, stringCount: number): void {
    if (ui.selectedString === null || ui.playbackTick !== null) return;
    const { cursor } = ui.doc;
    for (const system of this.systems) {
      const bar = system.box.bars.find(b => b.index === cursor.bar);
      const box = bar?.events[cursor.index];
      if (!bar || !box || !box.event.notes.some(n => n.string === ui.selectedString)) continue;
      const x = LABEL_W + bar.x + box.x + NOTE_OFFSET;
      const y = system.staffBottom - (stringCount - ui.selectedString) * STRING_GAP;
      svg('rect', { class: 'tab-note-selected', x: x - 10, y: y - 9, width: 20, height: 18, rx: 5 }, this.root);
    }
  }

  /** Dashed lines along the string for as long as each let-ring note keeps sounding. */
  private drawLetRing(spans: NoteSpan[], stringCount: number): void {
    const layer = svg('g', {}, this.root);
    for (const span of spans) {
      for (const system of this.systems) {
        const first = system.box.bars[0];
        const last = system.box.bars[system.box.bars.length - 1];
        if (!first || !last) continue;
        const systemStart = first.bar.startTick;
        const systemEnd = last.bar.startTick + last.bar.lengthTicks;
        if (span.endTick <= systemStart || span.startTick >= systemEnd) continue;
        const startsHere = span.startTick >= systemStart;
        const x1 = startsHere ? systemX(system.box, span.startTick) + NOTE_OFFSET + 8 : LABEL_W + first.x;
        const x2 = span.endTick <= systemEnd ? systemX(system.box, span.endTick) + 2 : LABEL_W + last.x + last.width;
        if (x2 - x1 < 3) continue;
        const y = system.staffBottom - (stringCount - span.string) * STRING_GAP;
        svg('line', { class: 'tab-ring', x1, x2, y1: y, y2: y }, layer);
      }
    }
  }

  private drawTimeSignature(g: SVGGElement, x: number, system: PlacedSystem, bar: BarLayout): void {
    const mid = (system.staffTop + system.staffBottom) / 2;
    svg('rect', { class: 'tab-knockout', x: x - 9, y: system.staffTop + 1, width: 18, height: system.staffBottom - system.staffTop - 2 }, g);
    text(g, x, mid - 9, String(bar.numerator), 'tab-timesig');
    text(g, x, mid + 10, String(bar.denominator), 'tab-timesig');
  }

  private drawBarEvents(g: SVGGElement, system: PlacedSystem, bar: BarBox, x0: number, stringCount: number): void {
    const stemTop = system.staffBottom + STEM_GAP;
    const stemEnd = stemTop + STEM;
    const lineY = (stringNumber: number) => system.staffBottom - (stringCount - stringNumber) * STRING_GAP;

    bar.events.forEach((box, i) => {
      const x = x0 + box.x + NOTE_OFFSET;
      const { event } = box;
      if (event.notes.length === 0) {
        drawRest(g, x, (system.staffTop + system.staffBottom) / 2, event.duration.value);
      }
      const previous = bar.events[i - 1];
      // Notes continuing from the previous bar connect from the bar line.
      const px = previous ? x0 + previous.x + NOTE_OFFSET : x0 - 4;
      for (const note of event.notes) {
        const y = lineY(note.string);
        const label = note.dead ? 'x' : note.tie ? `(${note.fret})` : String(note.fret);
        const w = label.length * 7.6 + 4;
        svg('rect', { class: 'tab-knockout', x: x - w / 2, y: y - 7, width: w, height: 14 }, g);
        text(g, x, y + 0.5, label, note.tie ? 'tab-fret is-tied' : note.dead ? 'tab-fret is-dead' : 'tab-fret');
        const before = this.previousFret.get(note);
        if (note.tie || note.slur) {
          svg('path', { class: 'tab-tie', d: `M ${px + 5} ${y - 8} Q ${(px + x) / 2} ${y - 17} ${x - 8} ${y - 8}` }, g);
          if (note.slur && before !== undefined) {
            text(g, (px + x) / 2, y - 16, note.fret > before ? 'h' : 'p', 'tab-slur');
          }
        }
        if (note.slide && before !== undefined) {
          const rise = note.fret > before ? 3.5 : -3.5;
          svg('line', { class: 'tab-slide', x1: px + 8, y1: y + rise, x2: x - 8, y2: y - rise }, g);
        }
        if (note.bend) drawBend(g, x, y, system.staffTop, note.bend);
      }
      if (event.notes.some(n => n.vibrato)) {
        // After a bend arrow, the wave starts past it.
        const start = x + (event.notes.some(n => n.bend) ? 22 : 3);
        drawVibrato(g, start, Math.max(start + 15, x0 + box.x + box.width - 4), system.staffTop - 5);
      }
      if (event.stroke && event.notes.length) drawStroke(g, x, system.staffTop - 9, event.stroke);
      // Rhythm: stems for notes (none for whole notes), shorter for halves.
      if (event.notes.length && event.duration.value > 1) {
        const top = event.duration.value === 2 ? stemEnd - 11 : stemTop;
        svg('line', { class: 'tab-stem', x1: x, x2: x, y1: top, y2: stemEnd }, g);
      }
      // Dots sit beside the stem end for notes, beside the rest mark for rests.
      const dotY = event.notes.length ? stemEnd - 3 : (system.staffTop + system.staffBottom) / 2 - 3;
      for (let d = 0; d < event.duration.dots; d++) {
        svg('circle', { class: 'tab-dot', cx: x + 7 + d * 4, cy: dotY, r: 1.6 }, g);
      }
    });
    drawBeams(g, bar, x0, stemEnd);
  }

  /** Move the playhead without re-rendering. */
  updatePlayback(ui: UiState): void {
    const playhead = this.playhead;
    if (!playhead) return;
    const tick = ui.playbackTick;
    if (tick === null) {
      playhead.setAttribute('width', '0');
      return;
    }
    for (const system of this.systems) {
      const bar = system.box.bars.find(b => tick >= b.bar.startTick && tick < b.bar.startTick + b.bar.lengthTicks);
      if (!bar) continue;
      const event = bar.events.find(e => tick >= e.startTick && tick < e.endTick);
      const x0 = LABEL_W + bar.x;
      const [x, w] = event ? [x0 + event.x, event.width] : [x0 + tickX(bar, tick), 4];
      playhead.setAttribute('x', String(x));
      playhead.setAttribute('width', String(w));
      playhead.setAttribute('y', String(system.staffTop - 9));
      playhead.setAttribute('height', String(system.staffBottom - system.staffTop + 18));
      return;
    }
    playhead.setAttribute('width', '0');
  }

  /** The bar, event index and nearest string line under a point on screen. */
  private hitTest(clientX: number, clientY: number): { bar: number; index: number; string: number | null } | null {
    const rect = this.root.getBoundingClientRect();
    const x = clientX - rect.left - LABEL_W;
    const y = clientY - rect.top;
    const system = this.systems.find(s => y >= s.top && y < s.bottom + SYSTEM_GAP / 2);
    const bar = system?.box.bars.find(b => x >= b.x && x < b.x + b.width);
    if (!system || !bar) return null;
    const local = x - bar.x;
    let index = bar.events.findIndex(e => local < e.x + e.width);
    if (index === -1) index = bar.events.length;
    const fromBottom = Math.round((system.staffBottom - y) / STRING_GAP);
    const string = this.stringCount - fromBottom;
    const onStaff = y > system.staffTop - STRING_GAP / 2 && y < system.staffBottom + STRING_GAP / 2;
    return { bar: bar.index, index, string: onStaff && string >= 1 && string <= this.stringCount ? string : null };
  }

  private handlePointer(event: PointerEvent): void {
    if (event.button > 0) return;
    const hit = this.hitTest(event.clientX, event.clientY);
    if (!hit) return;
    event.preventDefault();
    releaseControlFocus();
    this.callbacks.onCursor(hit.bar, hit.index, hit.string);
    // Long-press on touch screens opens the technique menu.
    if (event.pointerType === 'touch') {
      const { clientX, clientY } = event;
      this.pressTimer = setTimeout(() => {
        this.pressTimer = null;
        this.callbacks.onContextMenu(hit.bar, hit.index, hit.string, clientX, clientY);
      }, LONG_PRESS_MS);
    }
  }
}

/** Absolute x of a tick within a system (bar ends map to the bar's right edge). */
function systemX(system: SystemBox, tick: number): number {
  for (const bar of system.bars) {
    const end = bar.bar.startTick + bar.bar.lengthTicks;
    if (tick >= bar.bar.startTick && tick < end) return LABEL_W + bar.x + tickX(bar, tick);
    if (tick === end) return LABEL_W + bar.x + bar.width;
  }
  const last = system.bars[system.bars.length - 1];
  return last ? LABEL_W + last.x + last.width : LABEL_W;
}

/** X (relative to the bar) of a tick: inside an event's column, or within the free space. */
function tickX(bar: BarBox, tick: number): number {
  const event = bar.events.find(e => tick >= e.startTick && tick < e.endTick);
  if (event) return event.x + (event.width * (tick - event.startTick)) / (event.endTick - event.startTick);
  if (bar.append) {
    const end = bar.bar.startTick + bar.bar.lengthTicks;
    const span = end - bar.append.startTick;
    return bar.append.x + (span > 0 ? bar.append.width * (tick - bar.append.startTick) / span : 0);
  }
  return bar.contentX;
}

/** For each note, the fret of the sounding note on its string in the event just before. */
function previousFrets(track: Track): Map<Note, number> {
  const frets = new Map<Note, number>();
  let previous: TabEvent | undefined;
  for (const bar of track.bars) {
    for (const event of bar.events) {
      for (const note of event.notes) {
        const before = previous?.notes.find(n => n.string === note.string && !n.dead);
        if (before) frets.set(note, before.fret);
      }
      previous = event;
    }
  }
  return frets;
}

function bendLabel(semitones: number): string {
  if (semitones === 1) return 'full';
  const whole = Math.floor(semitones);
  const part = semitones - whole;
  const fraction = part === 0.5 ? '½' : part === 0.25 ? '¼' : part === 0.75 ? '¾' : '';
  return `${whole || ''}${fraction}` || String(semitones);
}

/** A curved arrow up from the note to above the staff, labelled with the bend amount. */
function drawBend(g: SVGGElement, x: number, y: number, staffTop: number, bend: Bend): void {
  const tipX = x + 13;
  const tipY = staffTop - 7;
  svg('path', { class: 'tab-bend', d: `M ${x + 6} ${y - 1} Q ${tipX} ${y - 2} ${tipX} ${tipY + 4}` }, g);
  svg('path', { class: 'tab-bend-head', d: `M ${tipX - 3} ${tipY + 5} L ${tipX} ${tipY} L ${tipX + 3} ${tipY + 5} Z` }, g);
  text(g, tipX, tipY - 4, bendLabel(bend.semitones), 'tab-bend-label');
  if (bend.release) {
    svg('path', { class: 'tab-bend is-release', d: `M ${tipX + 2} ${tipY + 2} Q ${tipX + 10} ${tipY + 2} ${tipX + 10} ${y - 6}` }, g);
  }
}

/** A wavy line above the staff over the note's length. */
function drawVibrato(g: SVGGElement, x1: number, x2: number, y: number): void {
  let d = `M ${x1} ${y}`;
  for (let x = x1, up = true; x + 4 <= x2; x += 4, up = !up) d += ` q 2 ${up ? -3 : 3} 4 0`;
  svg('path', { class: 'tab-vibrato', d }, g);
}

/** Pick-direction signs above the beat: ⊓ for a down stroke, V for an up stroke. */
function drawStroke(g: SVGGElement, x: number, y: number, stroke: 'down' | 'up'): void {
  const d = stroke === 'down'
    ? `M ${x - 4} ${y + 4} V ${y - 3} H ${x + 4} V ${y + 4}`
    : `M ${x - 4} ${y - 4} L ${x} ${y + 4} L ${x + 4} ${y - 4}`;
  svg('path', { class: stroke === 'down' ? 'tab-stroke is-down' : 'tab-stroke', d }, g);
}

/** Number of beams (or flags) for a note value: 1 for eighths, 2 for sixteenths… */
function beamCount(event: TabEvent): number {
  return Math.max(0, Math.log2(event.duration.value) - 2);
}

/** Beam eighths and shorter within each beat; single short notes get flags. */
function drawBeams(g: SVGGElement, bar: BarBox, x0: number, stemEnd: number): void {
  const groups: EventBox[][] = [];
  let group: EventBox[] = [];
  let groupPulse = -1;
  const flush = (): void => {
    if (group.length) groups.push(group);
    group = [];
  };
  for (const box of bar.events) {
    const pulse = Math.floor((box.startTick - bar.bar.startTick) / bar.bar.pulseTicks);
    const beamable = box.event.notes.length > 0 && beamCount(box.event) > 0;
    if (!beamable || pulse !== groupPulse) flush();
    groupPulse = pulse;
    if (beamable) group.push(box);
  }
  flush();

  for (const beamGroup of groups) {
    const xs = beamGroup.map(b => x0 + b.x + NOTE_OFFSET);
    const first = xs[0] ?? 0;
    const lastX = xs[xs.length - 1] ?? first;
    if (beamGroup.length === 1) {
      const count = beamCount(beamGroup[0]!.event);
      for (let level = 0; level < count; level++) {
        const y = stemEnd - level * BEAM_GAP;
        svg('path', { class: 'tab-flag', d: `M ${first} ${y} l 7 -6` }, g);
      }
      continue;
    }
    svg('line', { class: 'tab-beam', x1: first, x2: lastX, y1: stemEnd, y2: stemEnd }, g);
    // Secondary beams: join neighbours that both need them; otherwise a short stub.
    const counts = beamGroup.map(b => beamCount(b.event));
    for (let level = 2; level <= Math.max(...counts); level++) {
      const y = stemEnd - (level - 1) * BEAM_GAP;
      for (let i = 0; i < beamGroup.length; i++) {
        if ((counts[i] ?? 0) < level) continue;
        const x = xs[i] ?? 0;
        const next = xs[i + 1];
        if (next !== undefined && (counts[i + 1] ?? 0) >= level) {
          svg('line', { class: 'tab-beam', x1: x, x2: next, y1: y, y2: y }, g);
        } else if (i === 0 || (counts[i - 1] ?? 0) < level) {
          const stub = next !== undefined ? 6 : -6;
          svg('line', { class: 'tab-beam', x1: x, x2: x + stub, y1: y, y2: y }, g);
        }
      }
    }
    const tuplet = beamGroup[0]?.event.duration.tuplet;
    if (tuplet && beamGroup.every(b => b.event.duration.tuplet?.actual === tuplet.actual)) {
      text(g, (first + lastX) / 2, stemEnd + 11, String(tuplet.actual), 'tab-tuplet');
    }
  }
}

/** Simple rest marks on the middle of the staff. */
function drawRest(g: SVGGElement, x: number, y: number, value: number): void {
  if (value <= 2) {
    // Whole rests hang below a line, half rests sit on it.
    svg('rect', { class: 'tab-rest', x: x - 5, y: value === 1 ? y - 6 : y - 2, width: 10, height: 4 }, g);
    return;
  }
  if (value === 4) {
    svg('path', { class: 'tab-rest-line', d: `M ${x - 2} ${y - 9} l 4 5 l -4 4 l 4 5 q -5 -2 -3 3` }, g);
    return;
  }
  const flags = Math.log2(value) - 2;
  svg('path', { class: 'tab-rest-line', d: `M ${x + 3} ${y - 6} L ${x - 1} ${y + 8}` }, g);
  for (let i = 0; i < flags; i++) {
    const fy = y - 6 + i * 5;
    svg('circle', { class: 'tab-rest', cx: x - 2 + i * -0.8, cy: fy, r: 1.8 }, g);
    svg('path', { class: 'tab-rest-line', d: `M ${x - 2 + i * -0.8} ${fy} q 3 1.5 5 0` }, g);
  }
}
