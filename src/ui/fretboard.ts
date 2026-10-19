// Realistic SVG fretboard: rosewood, nickel frets, pearl inlays, wound strings you click directly.
// The board itself is rebuilt only when tuning, fret count or the scale overlay change; selection,
// playback highlights and pluck animations live on a separate layer so they never restart it.

import { getScale } from '../model/scales';
import { mainTrack, type Note } from '../model/song';
import { midiToNoteName, pitchClassOf, stringsOf, type StringInfo } from '../model/pitch';
import { chordPitchClasses, harmonyAt, intervalLabel, type Harmony } from '../model/harmony';
import { currentEvent, cursorPosition } from '../model/editing';
import type { FretPosition, FretboardNote, UiState } from './uiState';
import type { OverlayMode } from '../io/projectFormat';
import { releaseControlFocus } from './dom';

const SVG_NS = 'http://www.w3.org/2000/svg';
const WIDTH = 1200;
const LABEL_X = 20;
const NUT_X = 74;
const OPEN_X = NUT_X - 26;
const END_PAD = 10;
/** 1 = true guitar fret spacing; lower values even out high frets so they stay clickable. */
const REALISM = 0.7;
const INLAYS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
const DOUBLE_INLAYS = new Set([12, 24]);
/** Strings at or below this pitch are drawn wound. */
const WOUND_BELOW_MIDI = 51;

type Attrs = Record<string, string | number>;

function svg<K extends keyof SVGElementTagNameMap>(name: K, attrs: Attrs = {}, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    // Theme tokens only resolve through CSS, not presentation attributes.
    if (typeof value === 'string' && value.includes('var(')) node.style.setProperty(key, value);
    else node.setAttribute(key, String(value));
  }
  parent?.append(node);
  return node;
}

/** The key and chord in effect at the cursor; the overlay shows these. */
export function harmonyAtCursor(ui: Pick<UiState, 'doc'>): Harmony {
  const position = cursorPosition(ui.doc);
  const bars = ui.doc.song.timeline.bars.length;
  return position.ended
    ? harmonyAt(ui.doc.song, bars - 1, Number.MAX_SAFE_INTEGER)
    : harmonyAt(ui.doc.song, position.bar, position.tickInBar);
}

interface StringRow extends StringInfo {
  y: number;
  group: SVGGElement;
}

interface Layout {
  key: string;
  fretCount: number;
  rows: StringRow[];
  gap: number;
  dynamic: SVGGElement;
  flash: SVGCircleElement;
}

export class FretboardView {
  private layout: Layout | null = null;
  private readonly root: SVGSVGElement;

  constructor(container: HTMLElement,
    private readonly onNote: (note: FretboardNote, options: { chord: boolean; mute: boolean }) => void) {
    this.root = svg('svg', { role: 'presentation' });
    container.replaceChildren(this.root);
    this.root.addEventListener('pointerdown', event => this.handlePointer(event));
  }

  /** Redraw as needed for the current state. */
  update(ui: UiState): void {
    const tuning = mainTrack(ui.doc.song).tuning;
    const harmony = ui.view.overlayEnabled ? harmonyAtCursor(ui) : null;
    const mode = ui.view.overlayMode;
    const structureKey = JSON.stringify([tuning, ui.view.fretCount, harmony, mode]);
    if (this.layout?.key !== structureKey) this.build(tuning, ui.view.fretCount, harmony, mode, structureKey);
    this.updateDynamic(currentEvent(ui.doc)?.notes ?? [], ui.activeNotes);
  }

  /** Vibrate a string and flash the fretted position (on click and during playback). */
  pluck(position: FretPosition): void {
    const layout = this.layout;
    const row = layout?.rows.find(r => r.number === position.string);
    if (!layout || !row) return;
    restartAnimation(row.group, 'is-plucked');
    layout.flash.setAttribute('cx', String(this.noteX(position.fret)));
    layout.flash.setAttribute('cy', String(row.y));
    restartAnimation(layout.flash, 'is-on');
  }

  /** Ring the notes being edited (✕ for muted ones) and fill the ones sounding, without plucking. */
  private updateDynamic(selected: readonly Note[], active: readonly FretPosition[]): void {
    const layout = this.layout;
    if (!layout) return;
    layout.dynamic.replaceChildren();
    for (const note of active) {
      const row = layout.rows.find(r => r.number === note.string);
      if (row) svg('circle', { class: 'fb-active', cx: this.noteX(note.fret), cy: row.y, r: 9 }, layout.dynamic);
    }
    for (const note of selected) {
      const row = layout.rows.find(r => r.number === note.string);
      if (!row) continue;
      const x = this.noteX(note.fret);
      if (note.dead) {
        svg('text', { class: 'fb-dead', x, y: row.y + 0.5 }, layout.dynamic).textContent = '✕';
      } else {
        svg('circle', { class: note.letRing ? 'fb-selected is-ring' : 'fb-selected', cx: x, cy: row.y, r: 13 }, layout.dynamic);
      }
    }
  }

  private fretX(fret: number): number {
    const count = this.layout?.fretCount ?? 15;
    const span = WIDTH - NUT_X - END_PAD;
    const real = (1 - 2 ** (-fret / 12)) / (1 - 2 ** (-count / 12));
    return NUT_X + span * (REALISM * real + (1 - REALISM) * fret / count);
  }

  /** Centre of the space where a fret is played (left of the nut for open strings). */
  private noteX(fret: number): number {
    return fret === 0 ? OPEN_X : (this.fretX(fret - 1) + this.fretX(fret)) / 2;
  }

  private handlePointer(event: PointerEvent): void {
    const hit = (event.target as Element).closest<SVGRectElement>('.fb-hit');
    const row = this.layout?.rows.find(r => r.number === Number(hit?.dataset.string));
    if (!hit || !row || event.button > 0) return;
    event.preventDefault();
    releaseControlFocus();
    const mute = hit.dataset.mute === 'true';
    const fret = Number(hit.dataset.fret);
    const midi = row.midi + fret;
    this.pluck({ string: row.number, fret });
    this.onNote({ string: row.number, fret, midi, noteName: midiToNoteName(midi) }, { chord: event.shiftKey, mute });
  }

  private build(tuning: number[], fretCount: number, harmony: Harmony | null, mode: OverlayMode,
    structureKey: string): void {
    const strings = stringsOf(tuning);
    const count = strings.length;
    const gap = count >= 7 ? 26 : count === 6 ? 30 : count === 5 ? 32 : 34;
    const pad = 22;
    const top = 12;
    const bottom = top + pad * 2 + gap * (count - 1);
    const height = bottom + 22;
    const boardWidth = WIDTH - NUT_X - END_PAD + 4;
    const root = this.root;
    root.replaceChildren();
    root.setAttribute('viewBox', `0 0 ${WIDTH} ${height}`);
    // fretX reads the fret count from the layout, so set it before drawing.
    this.layout = { key: structureKey, fretCount, rows: [], gap, dynamic: svg('g'), flash: svg('circle') };

    const defs = svg('defs', {}, root);
    const wood = svg('linearGradient', { id: 'fb-wood', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    svg('stop', { offset: 0, 'stop-color': 'var(--board-a)' }, wood);
    svg('stop', { offset: 1, 'stop-color': 'var(--board-b)' }, wood);
    const fret = svg('linearGradient', { id: 'fb-fret', x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
    svg('stop', { offset: 0, 'stop-color': 'var(--fret)' }, fret);
    svg('stop', { offset: 0.45, 'stop-color': 'var(--fret-hi)' }, fret);
    svg('stop', { offset: 1, 'stop-color': 'var(--fret)' }, fret);
    const pearl = svg('radialGradient', { id: 'fb-pearl', cx: 0.35, cy: 0.35, r: 0.7 }, defs);
    svg('stop', { offset: 0, 'stop-color': '#FFFFFF' }, pearl);
    svg('stop', { offset: 0.6, 'stop-color': 'var(--inlay)' }, pearl);
    svg('stop', { offset: 1, 'stop-color': '#C9BFAE' }, pearl);
    // Wood grain: stretched fractal noise, tinted brown and clipped to the board.
    const grain = svg('filter', { id: 'fb-grain', x: 0, y: 0, width: 1, height: 1 }, defs);
    svg('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.004 0.22', numOctaves: 3, seed: 7, result: 'noise' }, grain);
    svg('feColorMatrix', { in: 'noise', type: 'matrix', values: '0 0 0 0 0.12  0 0 0 0 0.06  0 0 0 0 0.02  0 0 0 0.55 0', result: 'tint' }, grain);
    svg('feComposite', { in: 'tint', in2: 'SourceGraphic', operator: 'in' }, grain);
    const winding = svg('pattern', { id: 'fb-wound', width: 2.2, height: 6, patternUnits: 'userSpaceOnUse' }, defs);
    svg('rect', { width: 2.2, height: 6, fill: 'var(--string-wound)' }, winding);
    svg('rect', { width: 0.7, height: 6, fill: 'rgba(0,0,0,.35)' }, winding);

    svg('rect', { x: NUT_X, y: top, width: boardWidth, height: bottom - top, rx: 3, fill: 'url(#fb-wood)' }, root);
    svg('rect', { x: NUT_X, y: top, width: boardWidth, height: bottom - top, rx: 3, fill: '#000', filter: 'url(#fb-grain)' }, root);
    svg('rect', { x: NUT_X - 9, y: top - 2, width: 10, height: bottom - top + 4, rx: 2, fill: 'var(--nut)' }, root);

    const mid = (top + bottom) / 2;
    for (const n of INLAYS) {
      if (n > fretCount) break;
      const x = this.noteX(n);
      const ys = DOUBLE_INLAYS.has(n) ? [mid - gap, mid + gap] : [mid];
      for (const y of ys) svg('circle', { cx: x, cy: y, r: 7, fill: 'url(#fb-pearl)' }, root);
    }

    for (let n = 1; n <= fretCount; n++) {
      const x = this.fretX(n);
      svg('rect', { x: x - 2.2, y: top, width: 4.4, height: bottom - top, rx: 1.5, fill: 'url(#fb-fret)' }, root);
      if (INLAYS.includes(n)) svg('text', { class: 'fb-fretnum', x: this.noteX(n), y: height - 4 }, root).textContent = String(n);
    }

    // Strings: lowest at the bottom, as you look down at the instrument.
    const rows: StringRow[] = [];
    strings.forEach((string, i) => {
      const y = bottom - pad - i * gap;
      const thickness = Math.max(0.9, 3.6 - i * (2.7 / Math.max(1, count - 1)));
      const wound = string.midi <= WOUND_BELOW_MIDI;
      svg('text', { class: 'fb-label', x: LABEL_X, y }, root).textContent = string.label;
      const group = svg('g', { class: 'fb-string' }, root);
      const length = WIDTH - NUT_X - END_PAD + 6;
      svg('rect', { x: NUT_X - 4, y: y - thickness / 2 + 1.2, width: length, height: thickness, fill: 'rgba(0,0,0,.28)' }, group);
      svg('rect', {
        x: NUT_X - 4, y: y - thickness / 2, width: length, height: thickness, rx: thickness / 2,
        fill: wound ? 'url(#fb-wound)' : 'var(--string-plain)'
      }, group);
      svg('rect', {
        x: NUT_X - 4, y: y - thickness / 2, width: length, height: Math.max(0.4, thickness * 0.3),
        fill: 'var(--string-hi)', opacity: 0.55
      }, group);
      rows.push({ ...string, y, group });
    });

    if (harmony) this.drawOverlay(rows, fretCount, harmony, mode);

    const layout = this.layout;
    layout.rows = rows;
    root.append(layout.dynamic);
    layout.flash = svg('circle', { class: 'fb-flash', r: 11, cx: -50, cy: -50 }, root);

    // Hit areas: one per string per fret space, plus the open string left of the nut.
    const hits = svg('g', {}, root);
    for (const row of rows) {
      // The string name mutes the string ("x").
      const mute = svg('rect', {
        class: 'fb-hit fb-mute', x: 0, y: row.y - gap / 2, width: LABEL_X + 12, height: gap,
        'data-string': row.number, 'data-fret': 0, 'data-mute': 'true'
      }, hits);
      svg('title', {}, mute).textContent = `Mute string ${row.number} (x)`;
      for (let f = 0; f <= fretCount; f++) {
        const x0 = f === 0 ? LABEL_X + 12 : this.fretX(f - 1);
        const x1 = f === 0 ? NUT_X - 6 : this.fretX(f);
        const hit = svg('rect', {
          class: 'fb-hit', x: x0, y: row.y - gap / 2, width: x1 - x0, height: gap,
          'data-string': row.number, 'data-fret': f
        }, hits);
        svg('title', {}, hit).textContent = `String ${row.number}, fret ${f}: ${midiToNoteName(row.midi + f)}`;
      }
    }
  }

  /**
   * Scale mode: scale degrees, tonic highlighted. Chord mode: chord tones labelled from the chord
   * root. Both: scale degrees, with chord tones tinted and labelled as chord tones.
   */
  private drawOverlay(rows: StringRow[], fretCount: number, harmony: Harmony, mode: OverlayMode): void {
    const scale = mode === 'chord' ? undefined : getScale(harmony.key.scaleId);
    const chord = mode === 'scale' ? null : harmony.chord;
    const chordTones = new Set(chord ? chordPitchClasses(chord) : []);
    const group = svg('g', {}, this.root);
    for (const row of rows) {
      for (let f = 0; f <= fretCount; f++) {
        const pc = pitchClassOf(row.midi + f);
        const scaleInterval = (pc - harmony.key.tonic + 12) % 12;
        const degree = scale?.degrees[scale.intervals.indexOf(scaleInterval)];
        const isChordTone = chordTones.has(pc);
        if (degree === undefined && !isChordTone) continue;
        const chordInterval = chord ? (pc - chord.root + 12) % 12 : -1;
        let className = 'fb-tone';
        let label = degree ?? '';
        if (isChordTone) {
          className += chordInterval === 0 ? ' is-root' : ' is-chord';
          label = intervalLabel(chordInterval);
        } else if (!chord && scaleInterval === 0) {
          className += ' is-root';
        }
        const x = this.noteX(f);
        const tone = svg('g', { class: className }, group);
        svg('circle', { cx: x, cy: row.y, r: 10.5 }, tone);
        svg('text', { x, y: row.y + 0.5 }, tone).textContent = label;
      }
    }
  }
}

function restartAnimation(element: Element, className: string): void {
  element.classList.remove(className);
  // Reading layout forces the browser to notice the removal before the class returns.
  void (element as SVGGraphicsElement).getBoundingClientRect();
  element.classList.add(className);
}
