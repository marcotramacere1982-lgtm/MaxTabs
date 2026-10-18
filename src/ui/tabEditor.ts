// Grid tab view. Each row of bars is split into equal columns as fine as its content needs
// (at least eighth notes); Phase 3 replaces this with an SVG renderer.

import { mainTrack, type BarDef, type TabEvent } from '../model/song';
import { stringsOf, type StringInfo } from '../model/pitch';
import { layoutBarDefs, subdivisionLabel, type BarLayout } from '../model/timeline';
import { PPQ } from '../model/time';
import { cursorPosition } from '../model/editing';
import { chordSymbol } from '../model/harmony';
import { placeEvents, type PlacedEvent } from '../model/schedule';
import type { UiState } from './uiState';

/** Widest column: an eighth note. */
const MAX_COLUMN_TICKS = PPQ / 2;

interface Column {
  start: number;
  end: number;
  cells: HTMLElement[];
}

const columnIndex = new WeakMap<HTMLElement, Column[]>();

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Bars to draw: the song's bars, plus padding bars for a free timeline so rows are full and the cursor shows. */
function displayBars(ui: UiState): { layout: BarLayout[]; defs: BarDef[] } {
  const { song, cursor } = ui.doc;
  const defs = [...song.timeline.bars];
  if (song.timeline.extendable) {
    const last = defs[defs.length - 1];
    const needed = Math.max(defs.length, cursor.bar + 1);
    const count = Math.ceil(needed / ui.view.barsPerRow) * ui.view.barsPerRow;
    while (last && defs.length < count) defs.push({ time: { ...last.time } });
  }
  return { layout: layoutBarDefs(defs, song.tempo), defs };
}

export function renderTab(ui: UiState, container: HTMLElement): void {
  const { song } = ui.doc;
  const strings = stringsOf(mainTrack(song).tuning);
  const { layout, defs } = displayBars(ui);
  const placed = placeEvents(song, layout);
  const starts = new Map(placed.map(p => [p.startTick, p]));
  const position = cursorPosition(ui.doc);
  const cursorTick = position.ended ? null : position.tick;
  const columns: Column[] = [];

  container.replaceChildren();
  for (let offset = 0; offset < layout.length; offset += ui.view.barsPerRow) {
    const rowBars = layout.slice(offset, offset + ui.view.barsPerRow);
    const first = rowBars[0];
    const lastBar = rowBars[rowBars.length - 1];
    if (!first || !lastBar) continue;
    const rowStart = first.startTick;
    const rowEnd = lastBar.startTick + lastBar.lengthTicks;

    let unit = MAX_COLUMN_TICKS;
    for (const bar of rowBars) unit = gcd(unit, gcd(bar.pulseTicks, bar.lengthTicks));
    for (const p of placed) {
      if (p.startTick >= rowStart && p.startTick < rowEnd) unit = gcd(unit, gcd(p.startTick - rowStart, p.endTick - p.startTick));
    }
    if (cursorTick !== null && cursorTick >= rowStart && cursorTick < rowEnd) unit = gcd(unit, cursorTick - rowStart);

    const system = document.createElement('section');
    system.className = 'tab-system';
    const grid = document.createElement('div');
    grid.className = 'tab-grid';
    grid.style.setProperty('--slot-count', String((rowEnd - rowStart) / unit));
    grid.append(createLabel(''));
    for (const bar of rowBars) grid.append(createBarLabel(bar, defs[bar.index], unit));

    const rowColumns: Column[] = [];
    grid.append(createLabel(''));
    for (const bar of rowBars) {
      for (let tick = bar.startTick; tick < bar.startTick + bar.lengthTicks; tick += unit) {
        const column: Column = { start: tick, end: tick + unit, cells: [] };
        rowColumns.push(column);
        grid.append(createBeatCell(bar, tick, unit));
      }
    }
    for (const string of [...strings].reverse()) {
      grid.append(createLabel(string.label));
      rowBars.forEach(bar => {
        for (const column of rowColumns) {
          if (column.start < bar.startTick || column.start >= bar.startTick + bar.lengthTicks) continue;
          const cell = createStringCell(bar, column, unit, string, starts.get(column.start));
          if (column.start === cursorTick && ui.playbackTick === null) cell.classList.add('is-edit-cursor');
          if (ui.playbackTick !== null && ui.playbackTick >= column.start && ui.playbackTick < column.end)
            cell.classList.add('is-playhead');
          column.cells.push(cell);
          grid.append(cell);
        }
      });
    }
    columns.push(...rowColumns);
    system.append(grid);
    container.append(system);
  }
  columnIndex.set(container, columns);
}

function createLabel(text: string): HTMLDivElement {
  const label = document.createElement('div');
  label.className = 'tab-grid-label';
  label.textContent = text;
  return label;
}

function tempoText(bar: BarLayout): string {
  const unit = bar.tempo.unit === 4 ? 'Quarter' : `1/${bar.tempo.unit}`;
  return `${unit}${bar.tempo.dotted ? ' dotted' : ''} = ${bar.tempo.bpm}`;
}

function createBarLabel(bar: BarLayout, def: BarDef | undefined, unit: number): HTMLDivElement {
  const label = document.createElement('div');
  label.className = 'tab-bar-label';
  const chords = (def?.chords ?? []).map(change => chordSymbol(change.chord)).join(' ');
  label.textContent = `Bar ${bar.index + 1} · ${bar.numerator}/${bar.denominator}${chords ? ` · ${chords}` : ''}`;
  label.style.gridColumn = `span ${bar.lengthTicks / unit}`;
  label.title = tempoText(bar);
  return label;
}

function applyBoundaryClasses(bar: BarLayout, cell: HTMLElement, tick: number, unit: number): void {
  const local = tick - bar.startTick;
  if (local === 0) cell.classList.add('is-bar-start');
  if (local + unit === bar.lengthTicks) cell.classList.add('is-bar-end');
  else if ((local + unit) % bar.pulseTicks === 0) cell.classList.add('is-beat-end');
}

function createBeatCell(bar: BarLayout, tick: number, unit: number): HTMLDivElement {
  const cell = document.createElement('div');
  cell.className = 'tab-grid-header-cell';
  applyBoundaryClasses(bar, cell, tick, unit);

  const local = tick - bar.startTick;
  const pulse = Math.floor(local / bar.pulseTicks);
  const offset = local % bar.pulseTicks;
  if (offset === 0) {
    const accent = bar.accents[pulse] ?? 0;
    cell.textContent = String(pulse + 1);
    cell.classList.add(`accent-${accent}`);
    cell.title = `Pulse ${pulse + 1}: ${['weak', 'medium', 'strong'][accent]}`;
  } else {
    cell.textContent = subdivisionLabel(offset, bar.pulseTicks);
  }
  return cell;
}

function createStringCell(
  bar: BarLayout,
  column: Column,
  unit: number,
  string: StringInfo,
  placed: PlacedEvent | undefined
): HTMLDivElement {
  const cell = document.createElement('div');
  cell.className = 'tab-cell';
  cell.dataset.tick = String(column.start);
  cell.dataset.string = String(string.number);
  applyBoundaryClasses(bar, cell, column.start, unit);

  const event: TabEvent | undefined = placed?.event;
  const note = event?.notes.find(item => item.string === string.number);
  if (note) {
    cell.classList.add('has-note');
    const fretNumber = document.createElement('span');
    fretNumber.className = 'tab-fret-number';
    fretNumber.textContent = note.tie ? `(${note.fret})` : String(note.fret);
    cell.title = `String ${string.number}, fret ${note.fret}${note.tie ? ' (tied)' : ''}`;
    cell.append(fretNumber);
  } else if (event && event.notes.length === 0) {
    cell.title = 'Rest';
  }
  return cell;
}

/** Move the cursor/playhead highlight without rebuilding the grid. */
export function updateTabPlayback(ui: UiState, container: HTMLElement): void {
  container.querySelectorAll('.is-playhead, .is-edit-cursor').forEach(cell => {
    cell.classList.remove('is-playhead', 'is-edit-cursor');
  });
  const columns = columnIndex.get(container) ?? [];
  if (ui.playbackTick !== null) {
    const tick = ui.playbackTick;
    columns.find(c => tick >= c.start && tick < c.end)?.cells.forEach(cell => cell.classList.add('is-playhead'));
    return;
  }
  const position = cursorPosition(ui.doc);
  if (position.ended) return;
  columns.find(c => c.start === position.tick)?.cells.forEach(cell => cell.classList.add('is-edit-cursor'));
}
