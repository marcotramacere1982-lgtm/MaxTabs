import './styles/main.css';
import { History } from './model/history';
import { createDoc, mainTrack, type EditorDoc, type Note } from './model/song';
import { validateDoc } from './model/validate';
import { DEFAULT_INSTRUMENT_ID, INSTRUMENTS, requireInstrument } from './model/instruments';
import { SCALES, TONICS } from './model/scales';
import { durationCode, durationName, parseDurationCode, type Duration } from './model/time';
import {
  clearNotes,
  cursorPosition,
  hasTempoChanges,
  insertEvent,
  replaceTimeline,
  resetToFreeTimeline,
  setInstrument,
  setSongKey,
  setTempoBpm
} from './model/editing';
import { subdivisionLabel } from './model/timeline';
import { eventAtTick, placeEvents } from './model/schedule';
import { importMetronomo } from './io/metronomoComposto';
import { defaultViewPrefs, type LoadedProject } from './io/projectFormat';
import { renderFretboard } from './ui/fretboard';
import { renderTab, updateTabPlayback } from './ui/tabEditor';
import { setupProjectFiles } from './ui/projectFiles';
import { setupMenu } from './ui/menu';
import { byId } from './ui/dom';
import type { FretboardNote, UiState } from './ui/uiState';
import { playPreviewNote, playSong, stopPlayback } from './audio/playback';
import { errorMessage } from './errors';

/** Durations offered in the editor, longest first. */
const DURATION_CHOICES: Duration[] = [
  { value: 1, dots: 0 },
  { value: 2, dots: 1 },
  { value: 2, dots: 0 },
  { value: 4, dots: 1 },
  { value: 4, dots: 0 },
  { value: 8, dots: 1 },
  { value: 8, dots: 0 },
  { value: 16, dots: 0 },
  { value: 32, dots: 0 }
];

const history = new History<EditorDoc>(
  createDoc(DEFAULT_INSTRUMENT_ID, requireInstrument(DEFAULT_INSTRUMENT_ID).tuning),
  validateDoc
);

const ui: UiState = {
  get doc() { return history.present; },
  view: defaultViewPrefs(),
  selectedNote: null,
  playbackTick: null,
  activeNotes: []
};

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
  redoButton: byId<HTMLButtonElement>('redo-button'),
  clearButton: byId<HTMLButtonElement>('clear-button'),

  playButton: byId<HTMLButtonElement>('play-button'),
  stopButton: byId<HTMLButtonElement>('stop-button'),
  tempoInput: byId<HTMLInputElement>('tempo-input'),
  tempoLabel: byId<HTMLLabelElement>('tempo-label'),
  playbackStatus: byId('playback-status'),

  fewerBarsButton: byId<HTMLButtonElement>('fewer-bars-button'),
  moreBarsButton: byId<HTMLButtonElement>('more-bars-button'),
  barsPerRowDisplay: byId<HTMLOutputElement>('bars-per-row-display')
};

let isPlaying = false;

function init(): void {
  populateControls();
  syncControlsFromState();

  elements.rhythmFile.addEventListener('change', handleRhythmImport);
  elements.rhythmReset.addEventListener('click', handleRhythmReset);

  elements.instrumentSelect.addEventListener('change', handleInstrumentChange);
  elements.fretCountSelect.addEventListener('change', () => {
    if (isPlaying) return;
    ui.view.fretCount = Number(elements.fretCountSelect.value);
    ui.selectedNote = null;
    renderApp();
  });

  elements.fewerBarsButton.addEventListener('click', () => changeBarsPerRow(-1));
  elements.moreBarsButton.addEventListener('click', () => changeBarsPerRow(1));

  elements.scaleOverlayToggle.addEventListener('change', () => {
    ui.view.overlayEnabled = elements.scaleOverlayToggle.checked;
    updateScaleControlAvailability();
    renderFretboardOnly();
  });
  elements.scaleTonicSelect.addEventListener('change', handleKeyChange);
  elements.scaleSelect.addEventListener('change', handleKeyChange);

  elements.durationSelect.addEventListener('change', () => {
    ui.view.duration = parseDurationCode(elements.durationSelect.value);
  });
  elements.restButton.addEventListener('click', () => insert([]));
  elements.undoButton.addEventListener('click', handleUndo);
  elements.redoButton.addEventListener('click', handleRedo);
  elements.clearButton.addEventListener('click', handleClear);

  elements.playButton.addEventListener('click', handlePlay);
  elements.stopButton.addEventListener('click', handleStop);
  elements.tempoInput.addEventListener('change', commitTempo);

  elements.metronomeToggle.addEventListener('change', () => {
    ui.view.metronomeEnabled = elements.metronomeToggle.checked;
  });
  elements.clickVolume.addEventListener('input', () => {
    ui.view.clickVolume = Number(elements.clickVolume.value);
  });

  document.addEventListener('keydown', handleShortcut);

  setupMenu();
  setupProjectFiles({
    isBusy: () => isPlaying,
    getProject: () => {
      commitTempo();
      return { doc: history.present, view: ui.view };
    },
    onLoaded: handleProjectLoaded
  });

  renderApp();
}

function populateControls(): void {
  for (const instrument of INSTRUMENTS) {
    elements.instrumentSelect.append(new Option(instrument.name, instrument.id));
  }

  for (const duration of DURATION_CHOICES) {
    elements.durationSelect.append(new Option(durationName(duration), durationCode(duration)));
  }

  for (const tonic of TONICS) {
    elements.scaleTonicSelect.append(new Option(tonic.label, String(tonic.pitchClass)));
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
    group.append(new Option(scale.name, scale.id));
  }
}

/** Copy document and view state into the form controls. */
function syncControlsFromState(): void {
  const { song } = history.present;
  elements.instrumentSelect.value = mainTrack(song).instrumentId;
  elements.fretCountSelect.value = String(ui.view.fretCount);
  elements.durationSelect.value = durationCode(ui.view.duration);
  elements.tempoInput.value = String(song.tempo.bpm);
  elements.tempoLabel.textContent = song.tempo.unit === 4 && !song.tempo.dotted
    ? 'BPM'
    : `BPM (1/${song.tempo.unit}${song.tempo.dotted ? ' dotted' : ''})`;
  elements.scaleOverlayToggle.checked = ui.view.overlayEnabled;
  elements.scaleTonicSelect.value = String(song.key.tonic);
  elements.scaleSelect.value = song.key.scaleId;
  elements.metronomeToggle.checked = ui.view.metronomeEnabled;
  elements.clickVolume.value = String(ui.view.clickVolume);
}

function renderApp(): void {
  renderFretboardOnly();
  renderTab(ui, elements.tabEditor);
  renderSelectedNote();
  renderCursorPosition();
  updateControls();
}

function renderFretboardOnly(): void {
  renderFretboard(ui, elements.fretboard, handleFretboardNoteClick);
}

/** Run an edit through the history; show its error instead of throwing. Returns false on failure. */
function edit(change: (doc: EditorDoc) => void): boolean {
  try {
    history.apply(change);
    return true;
  } catch (error) {
    elements.playbackStatus.textContent = errorMessage(error);
    return false;
  }
}

/** After undo/redo/load, the controls must reflect the restored document. */
function afterDocumentReplaced(): void {
  ui.selectedNote = null;
  syncControlsFromState();
  renderApp();
}

function insert(notes: Note[]): void {
  if (isPlaying) return;
  if (edit(doc => insertEvent(doc, notes, ui.view.duration))) {
    elements.playbackStatus.textContent = 'Ready';
    renderApp();
  }
}

function handleFretboardNoteClick(note: FretboardNote): void {
  if (isPlaying) return;

  // Start the preview directly from the user's click.
  playPreviewNote(note.midi).catch((error: unknown) => {
    console.error('Could not play note preview:', error);
  });

  ui.selectedNote = note;
  insert([{ string: note.string, fret: note.fret }]);
}

function handleInstrumentChange(): void {
  if (isPlaying) return;
  let cleared = false;
  const instrument = requireInstrument(elements.instrumentSelect.value);
  if (edit(doc => { cleared = setInstrument(doc, instrument); })) {
    ui.selectedNote = null;
    elements.playbackStatus.textContent = cleared
      ? 'Notes cleared: the new instrument has a different number of strings. Undo to restore them.'
      : 'Ready';
  }
  renderApp();
}

function handleKeyChange(): void {
  edit(doc => setSongKey(doc, {
    tonic: Number(elements.scaleTonicSelect.value),
    scaleId: elements.scaleSelect.value
  }));
  renderFretboardOnly();
  updateControls();
}

function handleUndo(): void {
  if (isPlaying || !history.undo()) return;
  elements.playbackStatus.textContent = 'Ready';
  afterDocumentReplaced();
}

function handleRedo(): void {
  if (isPlaying || !history.redo()) return;
  elements.playbackStatus.textContent = 'Ready';
  afterDocumentReplaced();
}

function handleClear(): void {
  if (isPlaying || !hasNotes()) return;
  if (edit(clearNotes)) elements.playbackStatus.textContent = 'Notes cleared. Undo to restore them.';
  renderApp();
}

function handleShortcut(event: KeyboardEvent): void {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  const target = event.target as HTMLElement | null;
  // Leave undo inside text fields to the browser.
  if (target && (target.tagName === 'TEXTAREA' || (target.tagName === 'INPUT' &&
    ['text', 'number', 'search'].includes((target as HTMLInputElement).type)))) return;
  const key = event.key.toLowerCase();
  if (key === 'z' && !event.shiftKey) {
    event.preventDefault();
    handleUndo();
  } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
    event.preventDefault();
    handleRedo();
  }
}

function handleProjectLoaded(project: LoadedProject): void {
  history.reset(project.doc);
  ui.view = project.view;
  elements.playbackStatus.textContent = 'Ready';
  afterDocumentReplaced();
}

function hasNotes(): boolean {
  return history.present.song.tracks.some(track => track.bars.some(bar => bar.events.length > 0));
}

async function handlePlay(): Promise<void> {
  if (isPlaying) return;
  commitTempo();

  isPlaying = true;
  elements.playbackStatus.textContent = `Playing at ${history.present.song.tempo.bpm} BPM…`;
  updateControls();

  try {
    const started = await playSong(history.present.song, {
      metronome: ui.view.metronomeEnabled,
      clickVolume: ui.view.clickVolume,
      onPositionChange: handlePlaybackPositionChange,
      onComplete: handlePlaybackComplete
    });
    if (!started && isPlaying) handlePlaybackComplete();
  } catch (error) {
    stopPlayback();
    handlePlaybackComplete();
    elements.playbackStatus.textContent = `Playback failed: ${errorMessage(error)}`;
    console.error(error);
  }
}

function handlePlaybackPositionChange(tick: number | null): void {
  ui.playbackTick = tick;
  if (tick === null) {
    ui.activeNotes = [];
  } else {
    const placed = eventAtTick(placeEvents(history.present.song), tick);
    ui.activeNotes = placed ? placed.event.notes : [];
  }
  renderPlaybackVisuals();
}

function handleStop(): void {
  if (!isPlaying) return;
  stopPlayback();
  handlePlaybackComplete();
}

function handlePlaybackComplete(): void {
  ui.playbackTick = null;
  ui.activeNotes = [];
  isPlaying = false;
  elements.playbackStatus.textContent = 'Ready';
  renderPlaybackVisuals();
  updateControls();
}

/** Clamp the BPM field and store it in the song if it changed. */
function commitTempo(): void {
  const input = Number(elements.tempoInput.value);
  const bpm = Number.isFinite(input) ? Math.min(300, Math.max(20, input)) : 120;
  elements.tempoInput.value = String(bpm);
  if (bpm !== history.present.song.tempo.bpm && !elements.tempoInput.disabled) {
    edit(doc => setTempoBpm(doc, bpm));
    updateControls();
  }
}

function renderSelectedNote(): void {
  if (!ui.selectedNote) {
    elements.selectedNote.textContent = 'No note selected';
    return;
  }
  const { string, fret, noteName, midi } = ui.selectedNote;
  elements.selectedNote.textContent = `Selected: ${noteName} — string ${string}, fret ${fret}, MIDI ${midi}`;
}

function renderCursorPosition(): void {
  const position = cursorPosition(history.present);
  if (position.ended) {
    elements.cursorDisplay.textContent = 'Cursor: end of the chart';
    return;
  }
  const { offsetInPulse, pulseTicks } = position;
  const label = subdivisionLabel(offsetInPulse, pulseTicks);
  // Positions without a name (e.g. after a 32nd) show as a fraction of the beat.
  const divisor = gcd(offsetInPulse, pulseTicks);
  const offset = offsetInPulse === 0 ? ''
    : label ? ` ${label}` : ` + ${offsetInPulse / divisor}/${pulseTicks / divisor}`;
  elements.cursorDisplay.textContent = `Cursor: Bar ${position.bar + 1}, beat ${position.pulse + 1}${offset}`;
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

function renderPlaybackVisuals(): void {
  updateTabPlayback(ui, elements.tabEditor);
  const keys = new Set(ui.activeNotes.map(n => `${n.string}:${n.fret}`));
  elements.fretboard.querySelectorAll<HTMLElement>('.fret').forEach(button => {
    button.classList.toggle('is-playing', keys.has(`${button.dataset.string}:${button.dataset.fret}`));
  });
}

function updateControls(): void {
  const { song } = history.present;
  const notes = hasNotes();

  elements.undoButton.disabled = !history.canUndo || isPlaying;
  elements.redoButton.disabled = !history.canRedo || isPlaying;
  elements.clearButton.disabled = !notes || isPlaying;
  elements.restButton.disabled = isPlaying;

  elements.playButton.disabled = isPlaying;
  elements.stopButton.disabled = !isPlaying;

  elements.instrumentSelect.disabled = isPlaying;
  elements.fretCountSelect.disabled = isPlaying;
  elements.durationSelect.disabled = isPlaying;
  // A tempo map is edited bar by bar (later); the single BPM field only drives songs without one.
  elements.tempoInput.disabled = isPlaying || hasTempoChanges(song);
  elements.rhythmFile.disabled = isPlaying;
  elements.rhythmReset.disabled = isPlaying;
  elements.metronomeToggle.disabled = isPlaying;
  elements.clickVolume.disabled = isPlaying;
  const timeline = song.timeline;
  elements.rhythmStatus.textContent = timeline.source
    ? `${timeline.source.name}: ${timeline.bars.length} bars · imported${hasTempoChanges(song) ? ' tempo map' : ''}`
    : 'Free chart · grows as you write';

  elements.scaleOverlayToggle.disabled = isPlaying;

  updateScaleControlAvailability();
  updateBarDensityControls();
}

function updateScaleControlAvailability(): void {
  const disabled = !ui.view.overlayEnabled || isPlaying;
  elements.scaleTonicSelect.disabled = disabled;
  elements.scaleSelect.disabled = disabled;
}

function changeBarsPerRow(change: number): void {
  if (isPlaying) return;
  ui.view.barsPerRow = Math.min(8, Math.max(1, ui.view.barsPerRow + change));
  renderTab(ui, elements.tabEditor);
  updateBarDensityControls();
}

function updateBarDensityControls(): void {
  elements.barsPerRowDisplay.textContent = String(ui.view.barsPerRow);
  elements.fewerBarsButton.disabled = isPlaying || ui.view.barsPerRow <= 1;
  elements.moreBarsButton.disabled = isPlaying || ui.view.barsPerRow >= 8;
}

async function handleRhythmImport(): Promise<void> {
  const file = elements.rhythmFile.files?.[0];
  if (!file) return;
  try {
    if (file.size > 1000000) throw new Error('Rhythm file must be smaller than 1 MB.');
    const chart = importMetronomo(JSON.parse(await file.text()));
    if (isPlaying) throw new Error('Stop playback before importing.');
    if (edit(doc => replaceTimeline(doc, chart.timeline, chart.tempo))) {
      ui.selectedNote = null;
      syncControlsFromState();
      elements.playbackStatus.textContent = 'Rhythm imported. Press Play to hear it; Undo restores the previous chart.';
      renderApp();
    }
  } catch (error) {
    elements.playbackStatus.textContent = `Import failed: ${errorMessage(error)}`;
  } finally {
    elements.rhythmFile.value = '';
  }
}

function handleRhythmReset(): void {
  if (isPlaying) return;
  if (edit(resetToFreeTimeline)) {
    ui.selectedNote = null;
    syncControlsFromState();
    elements.playbackStatus.textContent = 'Free chart. Undo restores the previous chart and notes.';
    renderApp();
  }
}

init();
