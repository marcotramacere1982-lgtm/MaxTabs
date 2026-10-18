import { requireInstrument } from './state';
import { chartBars, barAt } from './timeline';
import type { AppState, Bar, InstrumentString, TabEvent } from './types';

export function renderTab(state: AppState, container: HTMLElement): void {
  const instrument = requireInstrument(state.instrumentId);
  const bars = chartBars(state, true);
  const starts = new Map(state.events.map(e => [e.startSlot, e]));
  container.replaceChildren();
  for (let offset = 0; offset < bars.length; offset += state.barsPerRow) {
    const rowBars = bars.slice(offset, offset + state.barsPerRow);
    const first = rowBars[0]?.startSlot ?? 0;
    const count = rowBars.reduce((n, b) => n + b.lengthSlots, 0);
    const system = document.createElement('section');
    system.className = 'tab-system';
    const grid = document.createElement('div');
    grid.className = 'tab-grid';
    grid.style.setProperty('--slot-count', String(count));
    grid.append(createLabel(''));
    rowBars.forEach((bar, i) => {
      const label = document.createElement('div');
      label.className = 'tab-bar-label';
      label.textContent = `Bar ${offset + i + 1} · ${bar.numerator}/${bar.denominator}`;
      label.style.gridColumn = `span ${bar.lengthSlots}`;
      label.title = bar.tempoValue ? `${bar.tempoUnit === 'quarter' ? 'Quarter' : '1/' + bar.denominator} = ${bar.tempoValue}` : `Quarter = ${state.bpm}`;
      grid.append(label);
    });
    grid.append(createLabel(''));
    for (let slot = first; slot < first + count; slot++) grid.append(createBeatCell(state, slot));
    for (const string of [...instrument.strings].reverse()) {
      grid.append(createLabel(string.label));
      for (let slot = first; slot < first + count; slot++) grid.append(createStringCell(state, string, slot, starts.get(slot)));
    }
    system.append(grid); container.append(system);
  }
}

function createLabel(text: string): HTMLDivElement {
  const label = document.createElement('div');
  label.className = 'tab-grid-label';
  label.textContent = text;

  return label;
}

/** Every rendered slot lies inside a bar; a miss means the render loop and timeline disagree. */
function requireBarAt(state: AppState, slot: number): Bar {
  const bar = barAt(state, slot);
  if (!bar) throw new Error(`No bar contains slot ${slot}.`);
  return bar;
}

function createBeatCell(state: AppState, slot: number): HTMLDivElement {
  const cell = document.createElement('div');
  cell.className = 'tab-grid-header-cell';

  const bar = applyBoundaryClasses(state, cell, slot);
  const local = slot - bar.startSlot;
  const pulse = Math.floor(local / bar.pulseSlots);
  const isStart = local % bar.pulseSlots === 0;
  cell.textContent = isStart ? String(pulse + 1)
    : bar.pulseSlots === 2 ? '&' : `+${local % bar.pulseSlots}/${bar.pulseSlots}`;
  if (isStart) {
    const accent = bar.accents[pulse] ?? 0;
    cell.classList.add(`accent-${accent}`);
    cell.title = `Pulse ${pulse + 1}: ${['weak', 'medium', 'strong'][accent]}`;
  }

  return cell;
}

function createStringCell(
  state: AppState,
  stringData: InstrumentString,
  slot: number,
  event: TabEvent | undefined
): HTMLDivElement {
  const cell = document.createElement('div');
  cell.className = 'tab-cell';
  cell.dataset.slot = String(slot);
  cell.dataset.string = String(stringData.number);

  applyBoundaryClasses(state, cell, slot);

  if (slot === state.playbackSlot) {
    cell.classList.add('is-playhead');
  } else if (
    state.playbackSlot === null &&
    slot === state.cursorSlot
  ) {
    cell.classList.add('is-edit-cursor');
  }

  const note = event?.type === 'note'
    ? event.notes.find((item) => item.string === stringData.number)
    : undefined;

  if (note) {
    cell.classList.add('has-note');

    const fretNumber = document.createElement('span');
    fretNumber.className = 'tab-fret-number';
    fretNumber.textContent = String(note.fret);

    cell.title =
      `${note.noteName}, string ${stringData.number}, fret ${note.fret}`;

    cell.append(fretNumber);
  } else if (event?.type === 'rest') {
    cell.title = `Rest: ${event.durationSlots} eighth-note slots`;
  }

  return cell;
}

function applyBoundaryClasses(state: AppState, cell: HTMLElement, slot: number): Bar {
  const bar = requireBarAt(state, slot);
  const local = slot - bar.startSlot;
  if (local === 0) cell.classList.add('is-bar-start');
  if (local + 1 === bar.lengthSlots) cell.classList.add('is-bar-end');
  else if ((local + 1) % bar.pulseSlots === 0) cell.classList.add('is-beat-end');
  return bar;
}

export function updateTabPlayback(state: AppState, container: HTMLElement): void {
  container.querySelectorAll('.is-playhead, .is-edit-cursor').forEach(cell => {
    cell.classList.remove('is-playhead', 'is-edit-cursor');
  });
  const slot = state.playbackSlot ?? state.cursorSlot;
  container.querySelectorAll(`.tab-cell[data-slot="${slot}"]`).forEach(cell => {
    cell.classList.add(state.playbackSlot === null ? 'is-edit-cursor' : 'is-playhead');
  });
}
