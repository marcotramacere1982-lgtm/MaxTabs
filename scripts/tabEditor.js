import { getInstrument } from './state.js';
import { chartBars, barAt } from './timeline.js';

export function renderTab(state, container) {
  const instrument = getInstrument(state.instrumentId);
  const bars = chartBars(state, true);
  const starts = new Map(state.events.map(e => [e.startSlot,e]));
  container.replaceChildren();
  for (let offset = 0; offset < bars.length; offset += state.barsPerRow) {
    const rowBars = bars.slice(offset,offset+state.barsPerRow);
    const first = rowBars[0].startSlot;
    const count = rowBars.reduce((n,b) => n+b.lengthSlots,0);
    const system = document.createElement('section');
    system.className = 'tab-system';
    const grid = document.createElement('div');
    grid.className = 'tab-grid';
    grid.style.setProperty('--slot-count',count);
    grid.append(createLabel(''));
    rowBars.forEach((bar,i) => {
      const label = document.createElement('div');
      label.className = 'tab-bar-label';
      label.textContent = `Bar ${offset+i+1} · ${bar.numerator}/${bar.denominator}`;
      label.style.gridColumn = `span ${bar.lengthSlots}`;
      label.title = bar.tempoValue ? `${bar.tempoUnit === 'quarter' ? 'Quarter' : '1/'+bar.denominator} = ${bar.tempoValue}` : `Quarter = ${state.bpm}`;
      grid.append(label);
    });
    grid.append(createLabel(''));
    for (let slot=first; slot<first+count; slot++) grid.append(createBeatCell(state,slot));
    for (const string of [...instrument.strings].reverse()) {
      grid.append(createLabel(string.label));
      for (let slot=first; slot<first+count; slot++) grid.append(createStringCell(state,string,slot,starts.get(slot)));
    }
    system.append(grid); container.append(system);
  }
}

function createLabel(text) {
  const label = document.createElement('div');
  label.className = 'tab-grid-label';
  label.textContent = text;

  return label;
}

function createBeatCell(state, slot) {
  const cell = document.createElement('div');
  cell.className = 'tab-grid-header-cell';

  applyBoundaryClasses(state, cell, slot);

  const bar = barAt(state, slot);
  const local = slot - bar.startSlot;
  const pulse = Math.floor(local / bar.pulseSlots);
  const isStart = local % bar.pulseSlots === 0;
  cell.textContent = isStart ? String(pulse + 1)
    : bar.pulseSlots === 2 ? '&' : `+${local % bar.pulseSlots}/${bar.pulseSlots}`;
  if (isStart) {
    cell.classList.add(`accent-${bar.accents[pulse]}`);
    cell.title = `Pulse ${pulse+1}: ${['weak','medium','strong'][bar.accents[pulse]]}`;
  }

  return cell;
}

function createStringCell(state, stringData, slot, event) {
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
    : null;

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

function applyBoundaryClasses(state, cell, slot) {
  const bar = barAt(state,slot);
  const local = slot - bar.startSlot;
  if (local === 0) cell.classList.add('is-bar-start');
  if (local+1 === bar.lengthSlots) cell.classList.add('is-bar-end');
  else if ((local+1)%bar.pulseSlots === 0) cell.classList.add('is-beat-end');
}

export function updateTabPlayback(state, container) {
  container.querySelectorAll('.is-playhead, .is-edit-cursor').forEach(cell => {
    cell.classList.remove('is-playhead','is-edit-cursor');
  });
  const slot = state.playbackSlot ?? state.cursorSlot;
  container.querySelectorAll(`.tab-cell[data-slot="${slot}"]`).forEach(cell => {
    cell.classList.add(state.playbackSlot === null ? 'is-edit-cursor' : 'is-playhead');
  });
}
