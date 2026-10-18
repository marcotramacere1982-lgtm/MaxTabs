import './styles/main.css';
import { importMetronomo } from './importers/metronomoComposto';
import {
  addNoteEvent,
  applyRhythmChart,
  setBarsPerRow,
  addRestEvent,
  clearEvents,
  clearPlaybackPosition,
  createState,
  getCursorPosition,
  setFretCount,
  setInstrument,
  setPlaybackPosition,
  setScaleId,
  setScaleOverlayEnabled,
  setScaleTonic,
  setSelectedDuration,
  undoLastEvent
} from './state';

import { TONICS, SCALES } from './scales';
import { renderFretboard } from './fretboard';
import { renderTab, updateTabPlayback } from './tabEditor';
import { playPreviewNote, playSequence, stopPlayback } from './playback';
import { setupProjectFiles } from './projectFiles';
import { setupMenu } from './menu';
import { byId } from './dom';
import { errorMessage } from './errors';
import type { FretboardNote } from './types';

const state = createState();

const elements = {
  rhythmFile: byId<HTMLInputElement>('rhythm-file'),
  rhythmReset: byId<HTMLButtonElement>('rhythm-reset'),
  rhythmStatus: byId('rhythm-status'),
  metronomeToggle: byId<HTMLInputElement>('metronome-toggle'),
  clickVolume: byId<HTMLInputElement>('click-volume'),
  fretboard: byId('fretboard'),
  tabEditor: byId('tab-editor'),
  selectedNote: byId('selected-note'),

  instrumentSelect: byId<HTMLSelectElement>('instrument-select'),
  fretCountSelect: byId<HTMLSelectElement>('fret-count'),

  scaleOverlayToggle: byId<HTMLInputElement>('scale-overlay-toggle'),
  scaleTonicSelect: byId<HTMLSelectElement>('scale-tonic-select'),
  scaleSelect: byId<HTMLSelectElement>('scale-select'),

  durationSelect: byId<HTMLSelectElement>('duration-select'),
  restButton: byId<HTMLButtonElement>('rest-button'),
  cursorDisplay: byId('cursor-display'),

  undoButton: byId<HTMLButtonElement>('undo-button'),
  clearButton: byId<HTMLButtonElement>('clear-button'),

  playButton: byId<HTMLButtonElement>('play-button'),
  stopButton: byId<HTMLButtonElement>('stop-button'),
  tempoInput: byId<HTMLInputElement>('tempo-input'),
  playbackStatus: byId('playback-status'),

  fewerBarsButton: byId<HTMLButtonElement>('fewer-bars-button'),
  moreBarsButton: byId<HTMLButtonElement>('more-bars-button'),
  barsPerRowDisplay: byId<HTMLOutputElement>('bars-per-row-display')
};

let isPlaying = false;

function init(): void {
  // Populate the tonic and scale dropdowns.
  populateScaleControls();

  // Set initial control values.
  syncControlsFromState();

  // Rhythm import and reset.
  elements.rhythmFile.addEventListener('change', handleRhythmImport);
  elements.rhythmReset.addEventListener('click', handleRhythmReset);

  // Instrument and fretboard size.
  elements.instrumentSelect.addEventListener('change', handleInstrumentChange);
  elements.fretCountSelect.addEventListener('change', handleFretCountChange);

  // Tab display density.
  elements.fewerBarsButton.addEventListener('click', () => {
    changeBarsPerRow(-1);
  });

  elements.moreBarsButton.addEventListener('click', () => {
    changeBarsPerRow(1);
  });

  // Scale overlay.
  elements.scaleOverlayToggle.addEventListener('change', handleScaleOverlayToggle);
  elements.scaleTonicSelect.addEventListener('change', handleScaleTonicChange);
  elements.scaleSelect.addEventListener('change', handleScaleChange);

  // Note duration and editing.
  elements.durationSelect.addEventListener('change', handleDurationChange);
  elements.restButton.addEventListener('click', handleInsertRest);
  elements.undoButton.addEventListener('click', handleUndo);
  elements.clearButton.addEventListener('click', handleClear);

  // Playback and tempo.
  elements.playButton.addEventListener('click', handlePlay);
  elements.stopButton.addEventListener('click', handleStop);
  elements.tempoInput.addEventListener('change', handleTempoChange);

  // Metronome settings.
  elements.metronomeToggle.addEventListener('change', () => {
    state.metronomeEnabled = elements.metronomeToggle.checked;
  });

  elements.clickVolume.addEventListener('input', () => {
    state.clickVolume = Number(elements.clickVolume.value);
  });

  setupMenu();
  // Attach Save, Load and Export handlers once.
  setupProjectFiles({
    state,

    isBusy: () => isPlaying,

    beforeSave: () => {
      state.bpm = getValidBpm();
    },

    onLoaded: () => {
      syncControlsFromState();
      elements.playbackStatus.textContent = 'Ready';
      renderApp();
    }
  });

  // Draw the initial interface.
  renderApp();

  console.log('Tab Builder loaded');
}

function syncControlsFromState(): void {
  elements.instrumentSelect.value = state.instrumentId;
  elements.fretCountSelect.value = String(state.fretCount);
  elements.durationSelect.value = String(state.selectedDurationSlots);
  elements.tempoInput.value = String(state.bpm);
  elements.scaleOverlayToggle.checked = state.scaleOverlay.enabled;
  elements.scaleTonicSelect.value = String(state.scaleOverlay.tonicPitchClass);
  elements.scaleSelect.value = state.scaleOverlay.scaleId;
  elements.metronomeToggle.checked = state.metronomeEnabled;
  elements.clickVolume.value = String(state.clickVolume);
}

function populateScaleControls(): void {
  for (const tonic of TONICS) {
    const option = document.createElement('option');
    option.value = String(tonic.pitchClass);
    option.textContent = tonic.label;
    elements.scaleTonicSelect.append(option);
  }

  const groups = new Map<string, HTMLOptGroupElement>();

  for (const scale of SCALES) {
    let group = groups.get(scale.group);

    if (!group) {
      group = document.createElement('optgroup');
      group.label = scale.group;

      groups.set(scale.group, group);
      elements.scaleSelect.append(group);
    }

    const option = document.createElement('option');
    option.value = scale.id;
    option.textContent = scale.name;

    group.append(option);
  }
}

function renderApp(): void {
  renderFretboard(state, elements.fretboard, handleFretboardNoteClick);
  renderTab(state, elements.tabEditor);
  renderSelectedNote();
  renderCursorPosition();
  updateControls();
}

function renderFretboardOnly(): void {
  renderFretboard(state, elements.fretboard, handleFretboardNoteClick);
}

function handleFretboardNoteClick(note: FretboardNote): void {
  if (isPlaying) {
    return;
  }

  // Start the preview directly from the user's click.
  playPreviewNote(note.midi).catch((error: unknown) => {
    console.error('Could not play note preview:', error);
  });

  state.selectedNote = note;

  let event;
  try { event = addNoteEvent(state, note); }
  catch (error) { elements.playbackStatus.textContent = errorMessage(error); return; }

  console.log('Inserted note event:', event);

  renderApp();
}

function handleInstrumentChange(): void {
  if (isPlaying) {
    return;
  }

  setInstrument(state, elements.instrumentSelect.value);
  renderApp();
}

function handleFretCountChange(): void {
  if (isPlaying) {
    return;
  }

  setFretCount(state, elements.fretCountSelect.value);
  renderApp();
}

function handleScaleOverlayToggle(): void {
  setScaleOverlayEnabled(state, elements.scaleOverlayToggle.checked);
  updateScaleControlAvailability();
  renderFretboardOnly();
}

function handleScaleTonicChange(): void {
  setScaleTonic(state, elements.scaleTonicSelect.value);
  renderFretboardOnly();
}

function handleScaleChange(): void {
  setScaleId(state, elements.scaleSelect.value);
  renderFretboardOnly();
}

function handleDurationChange(): void {
  setSelectedDuration(state, elements.durationSelect.value);
  renderCursorPosition();
}

function handleInsertRest(): void {
  if (isPlaying) {
    return;
  }

  let event;
  try { event = addRestEvent(state); }
  catch (error) { elements.playbackStatus.textContent = errorMessage(error); return; }

  console.log('Inserted rest event:', event);

  renderApp();
}

function handleUndo(): void {
  if (isPlaying) {
    return;
  }

  const removedEvent = undoLastEvent(state);

  if (removedEvent) {
    console.log('Undid event:', removedEvent);
  }

  renderApp();
}

function handleClear(): void {
  if (isPlaying || state.events.length === 0) {
    return;
  }

  clearEvents(state);
  renderApp();
}

async function handlePlay(): Promise<void> {
  if (isPlaying) {
    return;
  }

  const bpm = getValidBpm();

  isPlaying = true;
  elements.playbackStatus.textContent = `Playing at ${bpm} BPM…`;
  updateControls();

  try {
    const started = await playSequence(state, bpm, {
      onPositionChange: handlePlaybackPositionChange,
      onComplete: handlePlaybackComplete
    });

    if (!started && isPlaying) handlePlaybackComplete();
  } catch (error) {
    stopPlayback(); handlePlaybackComplete();
    elements.playbackStatus.textContent = `Playback failed: ${errorMessage(error)}`;
    console.error(error);
  }
}

function handlePlaybackPositionChange(slot: number | null): void {
  if (slot === null) {
    clearPlaybackPosition(state);
  } else {
    setPlaybackPosition(state, slot);
  }

  renderPlaybackVisuals();
}

function handleStop(): void {
  if (!isPlaying) {
    return;
  }

  stopPlayback();
  handlePlaybackComplete();
}

function handlePlaybackComplete(): void {
  clearPlaybackPosition(state);

  isPlaying = false;
  elements.playbackStatus.textContent = 'Ready';

  renderPlaybackVisuals();
  updateControls();
}

function handleTempoChange(): void {
  const bpm = getValidBpm();
  elements.tempoInput.value = String(bpm);
  state.bpm = bpm;
}

function getValidBpm(): number {
  const inputBpm = Number(elements.tempoInput.value);

  if (!Number.isFinite(inputBpm)) {
    elements.tempoInput.value = '120';
    return 120;
  }

  const clampedBpm = Math.min(300, Math.max(20, inputBpm));

  elements.tempoInput.value = String(clampedBpm);

  state.bpm = clampedBpm;
  return clampedBpm;
}

function renderSelectedNote(): void {
  if (!state.selectedNote) {
    elements.selectedNote.textContent = 'No note selected';
    return;
  }

  const { string, fret, noteName, midi } = state.selectedNote;

  elements.selectedNote.textContent =
    `Selected: ${noteName} — string ${string}, fret ${fret}, MIDI ${midi}`;
}

function renderCursorPosition(): void {
  const position = getCursorPosition(state);
  if (position.ended) {
    elements.cursorDisplay.textContent = 'Cursor: end of imported chart';
    return;
  }
  const offBeatText = position.isOffBeat ? ' &' : '';

  elements.cursorDisplay.textContent =
    `Cursor: Bar ${position.bar}, beat ${position.beat}${offBeatText}`;
}

function renderPlaybackVisuals(): void {
  updateTabPlayback(state, elements.tabEditor);
  const keys = new Set(state.activeNotes.map(n => `${n.string}:${n.fret}`));
  elements.fretboard.querySelectorAll<HTMLElement>('.fret').forEach(button => {
    button.classList.toggle('is-playing', keys.has(`${button.dataset.string}:${button.dataset.fret}`));
  });
}

function updateControls(): void {
  const hasEvents = state.events.length > 0;

  elements.undoButton.disabled = !hasEvents || isPlaying;
  elements.clearButton.disabled = !hasEvents || isPlaying;
  elements.restButton.disabled = isPlaying;

  elements.playButton.disabled = isPlaying;
  elements.stopButton.disabled = !isPlaying;

  elements.instrumentSelect.disabled = isPlaying;
  elements.fretCountSelect.disabled = isPlaying;
  elements.durationSelect.disabled = isPlaying;
  elements.tempoInput.disabled = isPlaying || Boolean(state.rhythmChart);
  elements.rhythmFile.disabled = isPlaying;
  elements.rhythmReset.disabled = isPlaying;
  elements.metronomeToggle.disabled = isPlaying;
  elements.clickVolume.disabled = isPlaying;
  elements.rhythmStatus.textContent = state.rhythmChart
    ? `${state.rhythmChart.name}: ${state.rhythmChart.bars.length} bars · imported tempo map`
    : 'Free 4/4 chart · global BPM';

  elements.scaleOverlayToggle.disabled = isPlaying;

  updateScaleControlAvailability();
  updateBarDensityControls();
}

function updateScaleControlAvailability(): void {
  const scaleControlsDisabled =
    !state.scaleOverlay.enabled || isPlaying;

  elements.scaleTonicSelect.disabled = scaleControlsDisabled;
  elements.scaleSelect.disabled = scaleControlsDisabled;
}

function changeBarsPerRow(change: number): void {
  if (isPlaying) {
    return;
  }

  setBarsPerRow(state, state.barsPerRow + change);

  renderTab(state, elements.tabEditor);
  updateBarDensityControls();
}

function updateBarDensityControls(): void {
  elements.barsPerRowDisplay.textContent = String(state.barsPerRow);

  elements.fewerBarsButton.disabled =
    isPlaying || state.barsPerRow <= 1;

  elements.moreBarsButton.disabled =
    isPlaying || state.barsPerRow >= 8;
}

async function handleRhythmImport(): Promise<void> {
  const file = elements.rhythmFile.files?.[0];
  if (!file) return;
  try {
    if (file.size > 1000000) throw new Error('Rhythm file must be smaller than 1 MB.');
    const chart = importMetronomo(JSON.parse(await file.text()));
    if (isPlaying) throw new Error('Stop playback before importing.');
    if ((state.events.length || state.rhythmChart) &&
      !window.confirm('Replace the current rhythm chart and remove its notes? This cannot be undone.')) return;
    applyRhythmChart(state, chart);
    elements.playbackStatus.textContent = 'Rhythm imported. Press Play to hear the empty chart.';
    renderApp();
  } catch (error) {
    elements.playbackStatus.textContent = `Import failed: ${errorMessage(error)}`;
  } finally { elements.rhythmFile.value = ''; }
}

function handleRhythmReset(): void {
  if (isPlaying) {
    return;
  }

  if (
    (state.events.length || state.rhythmChart) &&
    !window.confirm(
      'Return to free 4/4 and remove the current notes? ' +
      'This cannot be undone.'
    )
  ) {
    return;
  }

  clearEvents(state);
  clearPlaybackPosition(state);

  state.rhythmChart = null;
  state.selectedNote = null;

  elements.playbackStatus.textContent = 'Ready';

  renderApp();
}


init();
