import { importMetronomo } from './importers/metronomoComposto.js';
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
} from './state.js';


import { TONICS, SCALES } from './scales.js';
import { renderFretboard } from './fretboard.js';
import { renderTab, updateTabPlayback } from './tabEditor.js';
import { playPreviewNote, playSequence, stopPlayback } from './playback.js';
import { setupProjectFiles } from './projectFiles.js';
import { setupMenu } from './menu.js';

const state = createState();

const elements = {
  rhythmFile: document.getElementById('rhythm-file'),
  rhythmReset: document.getElementById('rhythm-reset'),
  rhythmStatus: document.getElementById('rhythm-status'),
  metronomeToggle: document.getElementById('metronome-toggle'),
  clickVolume: document.getElementById('click-volume'),
  fretboard: document.getElementById('fretboard'),
  tabEditor: document.getElementById('tab-editor'),
  selectedNote: document.getElementById('selected-note'),

  instrumentSelect: document.getElementById('instrument-select'),
  fretCountSelect: document.getElementById('fret-count'),

  scaleOverlayToggle: document.getElementById('scale-overlay-toggle'),
  scaleTonicSelect: document.getElementById('scale-tonic-select'),
  scaleSelect: document.getElementById('scale-select'),

  durationSelect: document.getElementById('duration-select'),
  restButton: document.getElementById('rest-button'),
  cursorDisplay: document.getElementById('cursor-display'),

  undoButton: document.getElementById('undo-button'),
  clearButton: document.getElementById('clear-button'),

  playButton: document.getElementById('play-button'),
  stopButton: document.getElementById('stop-button'),
  tempoInput: document.getElementById('tempo-input'),
  playbackStatus: document.getElementById('playback-status'),

  fewerBarsButton: document.getElementById('fewer-bars-button'),
  moreBarsButton: document.getElementById('more-bars-button'),
  barsPerRowDisplay: document.getElementById('bars-per-row-display')
};

let isPlaying = false;

function init() {
  // Populate the tonic and scale dropdowns.
  populateScaleControls();

  // Set initial control values.
  elements.instrumentSelect.value = state.instrumentId;
  elements.fretCountSelect.value = String(state.fretCount);
  elements.durationSelect.value =
    String(state.selectedDurationSlots);

  elements.tempoInput.value = String(state.bpm);

  elements.scaleOverlayToggle.checked =
    state.scaleOverlay.enabled;

  elements.scaleTonicSelect.value =
    String(state.scaleOverlay.tonicPitchClass);

  elements.scaleSelect.value =
    state.scaleOverlay.scaleId;

  elements.metronomeToggle.checked =
    state.metronomeEnabled;

  elements.clickVolume.value =
    String(state.clickVolume);

  // Rhythm import and reset.
  elements.rhythmFile.addEventListener(
    'change',
    handleRhythmImport
  );

  elements.rhythmReset.addEventListener(
    'click',
    handleRhythmReset
  );

  // Instrument and fretboard size.
  elements.instrumentSelect.addEventListener(
    'change',
    handleInstrumentChange
  );

  elements.fretCountSelect.addEventListener(
    'change',
    handleFretCountChange
  );

  // Tab display density.
  elements.fewerBarsButton.addEventListener('click', () => {
    changeBarsPerRow(-1);
  });

  elements.moreBarsButton.addEventListener('click', () => {
    changeBarsPerRow(1);
  });

  // Scale overlay.
  elements.scaleOverlayToggle.addEventListener(
    'change',
    handleScaleOverlayToggle
  );

  elements.scaleTonicSelect.addEventListener(
    'change',
    handleScaleTonicChange
  );

  elements.scaleSelect.addEventListener(
    'change',
    handleScaleChange
  );

  // Note duration and editing.
  elements.durationSelect.addEventListener(
    'change',
    handleDurationChange
  );

  elements.restButton.addEventListener(
    'click',
    handleInsertRest
  );

  elements.undoButton.addEventListener(
    'click',
    handleUndo
  );

  elements.clearButton.addEventListener(
    'click',
    handleClear
  );

  // Playback and tempo.
  elements.playButton.addEventListener(
    'click',
    handlePlay
  );

  elements.stopButton.addEventListener(
    'click',
    handleStop
  );

  elements.tempoInput.addEventListener(
    'change',
    handleTempoChange
  );

  // Metronome settings.
  elements.metronomeToggle.addEventListener('change', (event) => {
    state.metronomeEnabled = event.target.checked;
  });

  elements.clickVolume.addEventListener('input', (event) => {
    state.clickVolume = Number(event.target.value);
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
      elements.instrumentSelect.value = state.instrumentId;

      elements.fretCountSelect.value =
        String(state.fretCount);

      elements.durationSelect.value =
        String(state.selectedDurationSlots);

      elements.tempoInput.value =
        String(state.bpm);

      elements.scaleOverlayToggle.checked =
        state.scaleOverlay.enabled;

      elements.scaleTonicSelect.value =
        String(state.scaleOverlay.tonicPitchClass);

      elements.scaleSelect.value =
        state.scaleOverlay.scaleId;

      elements.metronomeToggle.checked =
        state.metronomeEnabled;

      elements.clickVolume.value =
        String(state.clickVolume);

      elements.playbackStatus.textContent = 'Ready';

      renderApp();
    }
  });

  // Draw the initial interface.
  renderApp();

  console.log('Tab Builder loaded');
}

function populateScaleControls() {
  for (const tonic of TONICS) {
    const option = document.createElement('option');
    option.value = String(tonic.pitchClass);
    option.textContent = tonic.label;
    elements.scaleTonicSelect.append(option);
  }

  const groups = new Map();

  for (const scale of SCALES) {
    if (!groups.has(scale.group)) {
      const group = document.createElement('optgroup');
      group.label = scale.group;

      groups.set(scale.group, group);
      elements.scaleSelect.append(group);
    }

    const option = document.createElement('option');
    option.value = scale.id;
    option.textContent = scale.name;

    groups.get(scale.group).append(option);
  }
}

function renderApp() {
  renderFretboard(state, elements.fretboard, handleFretboardNoteClick);
  renderTab(state, elements.tabEditor);
  renderSelectedNote();
  renderCursorPosition();
  updateControls();
}

function renderFretboardOnly() {
  renderFretboard(state, elements.fretboard, handleFretboardNoteClick);
}

function handleFretboardNoteClick(note) {
  if (isPlaying) {
    return;
  }

  // Start the preview directly from the user's click.
  playPreviewNote(note.midi).catch((error) => {
    console.error('Could not play note preview:', error);
  });

  state.selectedNote = note;

  let event;
  try { event = addNoteEvent(state, note); }
  catch (error) { elements.playbackStatus.textContent = error.message; return; }

  console.log('Inserted note event:', event);

  renderApp();
}

function handleInstrumentChange(event) {
  if (isPlaying) {
    return;
  }

  setInstrument(state, event.target.value);
  renderApp();
}

function handleFretCountChange(event) {
  if (isPlaying) {
    return;
  }

  setFretCount(state, event.target.value);
  renderApp();
}

function handleScaleOverlayToggle(event) {
  setScaleOverlayEnabled(state, event.target.checked);
  updateScaleControlAvailability();
  renderFretboardOnly();
}

function handleScaleTonicChange(event) {
  setScaleTonic(state, event.target.value);
  renderFretboardOnly();
}

function handleScaleChange(event) {
  setScaleId(state, event.target.value);
  renderFretboardOnly();
}

function handleDurationChange(event) {
  setSelectedDuration(state, event.target.value);
  renderCursorPosition();
}

function handleInsertRest() {
  if (isPlaying) {
    return;
  }

  let event;
  try { event = addRestEvent(state); }
  catch (error) { elements.playbackStatus.textContent = error.message; return; }

  console.log('Inserted rest event:', event);

  renderApp();
}

function handleUndo() {
  if (isPlaying) {
    return;
  }

  const removedEvent = undoLastEvent(state);

  if (removedEvent) {
    console.log('Undid event:', removedEvent);
  }

  renderApp();
}

function handleClear() {
  if (isPlaying || state.events.length === 0) {
    return;
  }

  clearEvents(state);
  renderApp();
}

async function handlePlay() {
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
    elements.playbackStatus.textContent = `Playback failed: ${error.message}`;
    console.error(error);
  }
}

function handlePlaybackPositionChange(slot) {
  if (slot === null) {
    clearPlaybackPosition(state);
  } else {
    setPlaybackPosition(state, slot);
  }

  renderPlaybackVisuals();
}

function handleStop() {
  if (!isPlaying) {
    return;
  }

  stopPlayback();
  handlePlaybackComplete();
}

function handlePlaybackComplete() {
  clearPlaybackPosition(state);

  isPlaying = false;
  elements.playbackStatus.textContent = 'Ready';

  renderPlaybackVisuals();
  updateControls();
}

function handleTempoChange() {
  const bpm = getValidBpm();
  elements.tempoInput.value = String(bpm);
  state.bpm = bpm;
}

function getValidBpm() {
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

function renderSelectedNote() {
  if (!state.selectedNote) {
    elements.selectedNote.textContent = 'No note selected';
    return;
  }

  const { string, fret, noteName, midi } = state.selectedNote;

  elements.selectedNote.textContent =
    `Selected: ${noteName} — string ${string}, fret ${fret}, MIDI ${midi}`;
}

function renderCursorPosition() {
  const position = getCursorPosition(state);
  if (position.ended) {
    elements.cursorDisplay.textContent = 'Cursor: end of imported chart';
    return;
  }
  const offBeatText = position.isOffBeat ? ' &' : '';

  elements.cursorDisplay.textContent =
    `Cursor: Bar ${position.bar}, beat ${position.beat}${offBeatText}`;
}

function renderPlaybackVisuals() {
  updateTabPlayback(state, elements.tabEditor);
  const keys = new Set(state.activeNotes.map(n => `${n.string}:${n.fret}`));
  elements.fretboard.querySelectorAll('.fret').forEach(button => {
    button.classList.toggle('is-playing', keys.has(`${button.dataset.string}:${button.dataset.fret}`));
  });
}

function updateControls() {
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

function updateScaleControlAvailability() {
  const scaleControlsDisabled =
    !state.scaleOverlay.enabled || isPlaying;

  elements.scaleTonicSelect.disabled = scaleControlsDisabled;
  elements.scaleSelect.disabled = scaleControlsDisabled;
}

function changeBarsPerRow(change) {
  if (isPlaying) {
    return;
  }

  setBarsPerRow(state, state.barsPerRow + change);

  renderTab(state, elements.tabEditor);
  updateBarDensityControls();
}

function updateBarDensityControls() {
  elements.barsPerRowDisplay.textContent = String(state.barsPerRow);

  elements.fewerBarsButton.disabled =
    isPlaying || state.barsPerRow <= 1;

  elements.moreBarsButton.disabled =
    isPlaying || state.barsPerRow >= 8;
}

async function handleRhythmImport(event) {
  const file = event.target.files[0];
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
    elements.playbackStatus.textContent = `Import failed: ${error.message}`;
  } finally { event.target.value = ''; }
}

function handleRhythmReset() {
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
