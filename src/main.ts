import './styles/main.css';
import { History } from './model/history';
import { createDoc, mainTrack, type EditorDoc, type Note } from './model/song';
import { validateDoc } from './model/validate';
import {
  DEFAULT_INSTRUMENT_ID,
  defaultTuning,
  findTuningPreset,
  INSTRUMENT_TYPES,
  requireInstrumentType,
  requireTuningPreset,
  tuningsFor
} from './model/instruments';
import { midiToNoteName, noteMidi, pitchClassName, pitchClassOf } from './model/pitch';
import type { RemapReport } from './model/remap';
import { SCALES, TONICS } from './model/scales';
import { durationName, TRIPLET, type Duration, type NoteValue } from './model/time';
import {
  addNoteToChord,
  clearNotes,
  currentEvent,
  cursorPosition,
  deleteAtCursor,
  deleteBeforeCursor,
  eventAtCursor,
  hasTempoChanges,
  insertEvent,
  moveCursor,
  replaceTimeline,
  resetToFreeTimeline,
  setCursor,
  setDurationAtCursor,
  setInstrument,
  setTempoBpm,
  writeAtCursor,
  addKeyChangeAtCursor,
  chordAtCursor,
  continueWithTie,
  keyOwnerBar,
  removeKeyChangeAtCursor,
  setChordAtCursor,
  setKeyAtCursor,
  toggleTie,
  chordNoteAtCursor,
  setTechniqueOnCurrent,
  type Technique
} from './model/editing';
import { CHORD_QUALITIES, chordSymbol } from './model/harmony';
import { subdivisionLabel } from './model/timeline';
import { noteSpans, soundingAt, type NoteSpan } from './model/schedule';
import { importMetronomo } from './io/metronomoComposto';
import { defaultViewPrefs, type LoadedProject, type OverlayMode } from './io/projectFormat';
import { FretboardView, harmonyAtCursor } from './ui/fretboard';
import { TabView } from './ui/tabEditor';
import { setupProjectFiles } from './ui/projectFiles';
import { setupMenu } from './ui/menu';
import { setupTheme } from './ui/theme';
import { askRemapMode } from './ui/remapDialog';
import { byId } from './ui/dom';
import type { FretboardNote, UiState } from './ui/uiState';
import { playPreviewNote, playSong, stopPlayback } from './audio/playback';
import { errorMessage } from './errors';

/** Note values offered in the editor, longest first, with their chip labels. */
const VALUE_CHOICES: { value: NoteValue; label: string }[] = [
  { value: 1, label: '1' },
  { value: 2, label: '½' },
  { value: 4, label: '¼' },
  { value: 8, label: '⅛' },
  { value: 16, label: '1/16' },
  { value: 32, label: '1/32' }
];

const history = new History<EditorDoc>(
  createDoc(DEFAULT_INSTRUMENT_ID, defaultTuning(DEFAULT_INSTRUMENT_ID).notes),
  validateDoc
);

const ui: UiState = {
  get doc() { return history.present; },
  view: defaultViewPrefs(),
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
  tuningSelect: byId<HTMLSelectElement>('tuning-select'),
  fretCountSelect: byId<HTMLSelectElement>('fret-count'),

  scaleOverlayToggle: byId<HTMLInputElement>('scale-overlay-toggle'),
  overlayMode: byId('overlay-mode'),
  scaleTonicSelect: byId<HTMLSelectElement>('scale-tonic-select'),
  scaleSelect: byId<HTMLSelectElement>('scale-select'),
  keyLabel: byId<HTMLLabelElement>('key-label'),
  keyChangeButton: byId<HTMLButtonElement>('key-change-button'),
  chordRootSelect: byId<HTMLSelectElement>('chord-root-select'),
  chordQualitySelect: byId<HTMLSelectElement>('chord-quality-select'),
  harmonyHint: byId('harmony-hint'),

  durationChips: byId('duration-chips'),
  dotToggle: byId<HTMLButtonElement>('dot-toggle'),
  tripletToggle: byId<HTMLButtonElement>('triplet-toggle'),
  restButton: byId<HTMLButtonElement>('rest-button'),
  tieButton: byId<HTMLButtonElement>('tie-button'),
  chordToggle: byId<HTMLButtonElement>('chord-toggle'),
  muteToggle: byId<HTMLButtonElement>('mute-toggle'),
  ringToggle: byId<HTMLButtonElement>('ring-toggle'),
  cursorDisplay: byId('cursor-display'),
  cursorPrev: byId<HTMLButtonElement>('cursor-prev'),
  cursorNext: byId<HTMLButtonElement>('cursor-next'),
  deleteButton: byId<HTMLButtonElement>('delete-button'),

  undoButton: byId<HTMLButtonElement>('undo-button'),
  redoButton: byId<HTMLButtonElement>('redo-button'),
  clearButton: byId<HTMLButtonElement>('clear-button'),

  playButton: byId<HTMLButtonElement>('play-button'),
  tempoInput: byId<HTMLInputElement>('tempo-input'),
  tempoLabel: byId<HTMLLabelElement>('tempo-label'),
  playbackStatus: byId('playback-status'),

  fewerBarsButton: byId<HTMLButtonElement>('fewer-bars-button'),
  moreBarsButton: byId<HTMLButtonElement>('more-bars-button'),
  barsPerRowDisplay: byId<HTMLOutputElement>('bars-per-row-display')
};

let isPlaying = false;
/** Note spans of the song being played, and the playhead tick last shown. */
let playSpans: NoteSpan[] = [];
let lastPlayTick = -1;
/** Entry modes (this session only): build chords in place, enter muted or let-ring notes. */
const entry = { chord: false, dead: false, letRing: false };

const fretboard = new FretboardView(elements.fretboard, handleFretboardNoteClick);
const tabView = new TabView(elements.tabEditor, {
  onCursor: (bar, index) => {
    if (isPlaying) return;
    history.amend(doc => setCursor(doc, bar, index));
    renderApp();
  }
});

function init(): void {
  populateControls();
  syncControlsFromState();

  elements.rhythmFile.addEventListener('change', handleRhythmImport);
  elements.rhythmReset.addEventListener('click', handleRhythmReset);

  elements.instrumentSelect.addEventListener('change', () => {
    const instrumentId = elements.instrumentSelect.value;
    void changeInstrument(instrumentId, defaultTuning(instrumentId).notes);
  });
  elements.tuningSelect.addEventListener('change', () => {
    const tuning = requireTuningPreset(elements.tuningSelect.value);
    void changeInstrument(tuning.instrumentId, tuning.notes);
  });
  elements.fretCountSelect.addEventListener('change', () => {
    if (isPlaying) return;
    ui.view.fretCount = Number(elements.fretCountSelect.value);
    renderApp();
  });

  elements.fewerBarsButton.addEventListener('click', () => changeBarsPerRow(-1));
  elements.moreBarsButton.addEventListener('click', () => changeBarsPerRow(1));

  elements.scaleOverlayToggle.addEventListener('change', () => {
    ui.view.overlayEnabled = elements.scaleOverlayToggle.checked;
    renderHarmonyControls();
    renderFretboardOnly();
  });
  elements.overlayMode.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-mode]');
    if (!button) return;
    ui.view.overlayMode = button.dataset.mode as OverlayMode;
    ui.view.overlayEnabled = true;
    renderHarmonyControls();
    renderFretboardOnly();
  });
  elements.scaleTonicSelect.addEventListener('change', handleKeyChange);
  elements.scaleSelect.addEventListener('change', handleKeyChange);
  elements.keyChangeButton.addEventListener('click', handleKeyChangeButton);
  elements.chordRootSelect.addEventListener('change', handleChordChange);
  elements.chordQualitySelect.addEventListener('change', handleChordChange);

  elements.durationChips.addEventListener('click', event => {
    const chip = (event.target as Element).closest<HTMLButtonElement>('.chip');
    if (!chip || chip.disabled) return;
    changeDuration(d => ({ ...d, value: Number(chip.value) as NoteValue }));
  });
  elements.dotToggle.addEventListener('click', () => changeDuration(d => ({ ...d, dots: d.dots ? 0 : 1 })));
  elements.tripletToggle.addEventListener('click', () => changeDuration(d => {
    const { tuplet, ...rest } = d;
    return tuplet ? rest : { ...rest, tuplet: { ...TRIPLET } };
  }));
  elements.restButton.addEventListener('click', () => write([], false));
  elements.tieButton.addEventListener('click', handleTie);
  elements.chordToggle.addEventListener('click', () => {
    entry.chord = !entry.chord;
    elements.playbackStatus.textContent = entry.chord
      ? 'Chord mode: click strings to build a chord at the cursor (click a note again to remove it). → or Enter moves on.'
      : 'Ready';
    renderApp();
  });
  elements.muteToggle.addEventListener('click', () => toggleTechnique('dead'));
  elements.ringToggle.addEventListener('click', () => toggleTechnique('letRing'));
  elements.cursorPrev.addEventListener('click', () => runEditingKey('ArrowLeft'));
  elements.cursorNext.addEventListener('click', () => runEditingKey('ArrowRight'));
  elements.deleteButton.addEventListener('click', () => runEditingKey('Delete'));
  elements.undoButton.addEventListener('click', handleUndo);
  elements.redoButton.addEventListener('click', handleRedo);
  elements.clearButton.addEventListener('click', handleClear);

  elements.playButton.addEventListener('click', () => {
    if (isPlaying) handleStop();
    else void handlePlay();
  });
  elements.tempoInput.addEventListener('change', commitTempo);

  elements.metronomeToggle.addEventListener('change', () => {
    ui.view.metronomeEnabled = elements.metronomeToggle.checked;
  });
  elements.clickVolume.addEventListener('input', () => {
    ui.view.clickVolume = Number(elements.clickVolume.value);
  });

  document.addEventListener('keydown', handleShortcut);

  setupTheme();
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
  for (const instrument of INSTRUMENT_TYPES) {
    elements.instrumentSelect.append(new Option(instrument.name, instrument.id));
  }

  for (const { value, label } of VALUE_CHOICES) {
    const chip = document.createElement('button');
    const name = durationName({ value, dots: 0 });
    chip.type = 'button';
    chip.className = 'chip';
    chip.value = String(value);
    chip.textContent = label;
    chip.title = name;
    chip.setAttribute('role', 'radio');
    chip.setAttribute('aria-label', name);
    elements.durationChips.append(chip);
  }

  elements.chordRootSelect.append(new Option('—', ''));
  for (const tonic of TONICS) {
    elements.chordRootSelect.append(new Option(tonic.label, String(tonic.pitchClass)));
  }
  for (const quality of CHORD_QUALITIES) {
    elements.chordQualitySelect.append(new Option(quality.symbol ? `${quality.symbol} · ${quality.name}` : quality.name, quality.id));
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
  const track = mainTrack(song);
  elements.instrumentSelect.value = track.instrumentId;
  populateTunings(track.instrumentId, track.tuning);
  elements.fretCountSelect.value = String(ui.view.fretCount);
  markDurationChips();
  elements.tempoInput.value = String(song.tempo.bpm);
  elements.tempoLabel.textContent = song.tempo.unit === 4 && !song.tempo.dotted
    ? 'BPM'
    : `BPM (1/${song.tempo.unit}${song.tempo.dotted ? ' dotted' : ''})`;
  elements.scaleOverlayToggle.checked = ui.view.overlayEnabled;
  elements.metronomeToggle.checked = ui.view.metronomeEnabled;
  elements.clickVolume.value = String(ui.view.clickVolume);
}

/** The duration shown in the chips: the event under the cursor's, or the one the next note gets. */
function shownDuration(): Duration {
  return eventAtCursor(history.present)?.duration ?? ui.view.duration;
}

function markDurationChips(): void {
  const current = shownDuration();
  for (const chip of elements.durationChips.querySelectorAll<HTMLButtonElement>('.chip')) {
    chip.setAttribute('aria-checked', String(Number(chip.value) === current.value));
  }
  elements.dotToggle.setAttribute('aria-pressed', String(current.dots > 0));
  elements.tripletToggle.setAttribute('aria-pressed', String(Boolean(current.tuplet)));
}

/** Change the next note's duration, and the duration of the event under the cursor if there is one. */
function changeDuration(change: (duration: Duration) => Duration): void {
  if (isPlaying) return;
  const duration = change(shownDuration());
  if (eventAtCursor(history.present)) {
    if (!edit(doc => setDurationAtCursor(doc, duration))) {
      renderApp();
      return;
    }
  }
  ui.view.duration = duration;
  renderApp();
}

function renderApp(): void {
  renderFretboardOnly();
  tabView.render(ui);
  renderSelectedNote();
  renderCursorPosition();
  markDurationChips();
  markTechniqueToggles();
  renderHarmonyControls();
  updateControls();
}

/** Show the key and chord at the cursor in the harmony panel. */
function renderHarmonyControls(): void {
  const doc = history.present;
  const harmony = harmonyAtCursor(ui);
  const cursorBar = doc.cursor.bar;
  const owner = keyOwnerBar(doc.song, cursorBar);
  elements.scaleTonicSelect.value = String(harmony.key.tonic);
  elements.scaleSelect.value = harmony.key.scaleId;
  elements.keyLabel.textContent = owner >= 0 ? `Key (from bar ${owner + 1})` : 'Key';
  const hasKeyChange = Boolean(doc.song.timeline.bars[cursorBar]?.key);
  elements.keyChangeButton.textContent = hasKeyChange ? 'Remove key change' : 'Key change here';
  elements.keyChangeButton.disabled = isPlaying || cursorPosition(doc).ended || (cursorBar === 0 && !hasKeyChange);

  const chord = chordAtCursor(doc);
  elements.chordRootSelect.value = chord ? String(chord.root) : '';
  elements.chordQualitySelect.value = chord?.quality ?? elements.chordQualitySelect.value ?? 'maj';
  elements.chordQualitySelect.disabled = isPlaying || !chord;
  elements.chordRootSelect.disabled = isPlaying || cursorPosition(doc).ended;

  elements.scaleOverlayToggle.checked = ui.view.overlayEnabled;
  for (const button of elements.overlayMode.querySelectorAll<HTMLButtonElement>('button[data-mode]')) {
    button.setAttribute('aria-pressed', String(ui.view.overlayEnabled && button.dataset.mode === ui.view.overlayMode));
  }
  elements.harmonyHint.textContent = harmonyHint(harmony.chord, Boolean(chord));
}

function harmonyHint(current: ReturnType<typeof harmonyAtCursor>['chord'], chordHere: boolean): string {
  if (current && !chordHere) return `${chordSymbol(current)} continues from earlier. Pick a root to change chord here.`;
  if (!current && ui.view.overlayEnabled && ui.view.overlayMode !== 'scale')
    return 'No chord yet: pick a root to place one at the cursor.';
  return '';
}

function renderFretboardOnly(): void {
  fretboard.update(ui);
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
  syncControlsFromState();
  renderApp();
}

/** Write notes (or a rest) at the cursor, or add one note to the current chord. */
function write(notes: Note[], chord: boolean): void {
  if (isPlaying) return;
  const note = notes[0];
  const ok = entry.chord && note
    ? edit(doc => chordNoteAtCursor(doc, note, ui.view.duration))
    : chord && note
      ? edit(doc => addNoteToChord(doc, note))
      : edit(doc => writeAtCursor(doc, notes, ui.view.duration));
  if (ok) elements.playbackStatus.textContent = 'Ready';
  renderApp();
}

function handleFretboardNoteClick(note: FretboardNote, options: { chord: boolean; mute: boolean }): void {
  if (isPlaying) return;
  const dead = options.mute || entry.dead;

  // Start the preview directly from the user's click.
  playPreviewNote(note.midi, dead).catch((error: unknown) => {
    console.error('Could not play note preview:', error);
  });

  const written: Note = { string: note.string, fret: note.fret };
  if (dead) written.dead = true;
  else if (entry.letRing) written.letRing = true;
  write([written], options.chord);
}

/**
 * Mute / Let ring: on a note, switch it for that note (and for what you enter next);
 * elsewhere, just switch the mode for the notes you enter next.
 */
function toggleTechnique(technique: Technique): void {
  if (isPlaying) return;
  const event = eventAtCursor(history.present);
  const onNote = Boolean(event && event.notes.length);
  const on = onNote ? !hasTechnique(event!.notes, technique) : !entry[technique];
  if (onNote) edit(doc => setTechniqueOnCurrent(doc, technique, on));
  entry[technique] = on;
  // A note is either muted or ringing.
  if (on) entry[technique === 'dead' ? 'letRing' : 'dead'] = false;
  renderApp();
}

/** Whether a chord uses a technique: all its notes muted, or all its sounding notes ringing. */
function hasTechnique(notes: readonly Note[], technique: Technique): boolean {
  const relevant = technique === 'letRing' ? notes.filter(n => !n.dead) : notes;
  return relevant.length > 0 && relevant.every(n => n[technique]);
}

function markTechniqueToggles(): void {
  const event = eventAtCursor(history.present);
  const shown = (technique: Technique): boolean => event && event.notes.length
    ? hasTechnique(event.notes, technique)
    : entry[technique];
  elements.chordToggle.setAttribute('aria-pressed', String(entry.chord));
  elements.muteToggle.setAttribute('aria-pressed', String(shown('dead')));
  elements.ringToggle.setAttribute('aria-pressed', String(shown('letRing')));
}

/** Open-string names, lowest first: "D A D G B E". */
function tuningNoteNames(notes: readonly number[]): string {
  return notes.map(midi => pitchClassName(pitchClassOf(midi))).join(' ');
}

/** Fill the tuning list for an instrument, adding a "Custom" entry when the tuning matches no preset. */
function populateTunings(instrumentId: string, notes: readonly number[]): void {
  const select = elements.tuningSelect;
  select.replaceChildren();
  for (const tuning of tuningsFor(instrumentId)) {
    select.append(new Option(`${tuning.name} — ${tuningNoteNames(tuning.notes)}`, tuning.id));
  }
  const preset = findTuningPreset(instrumentId, notes);
  if (preset) {
    select.value = preset.id;
  } else {
    const custom = new Option(`Custom — ${tuningNoteNames(notes)}`, '');
    custom.disabled = true;
    select.prepend(custom);
    select.value = '';
  }
}

function describeTuning(instrumentId: string, notes: readonly number[]): string {
  const preset = findTuningPreset(instrumentId, notes);
  return `${requireInstrumentType(instrumentId).name}, ${preset ? preset.name : 'custom'} tuning`;
}

function describeRemap(report: RemapReport): string {
  const parts: string[] = [];
  if (report.moved) parts.push(`${report.moved} note${report.moved === 1 ? '' : 's'} moved`);
  if (report.dropped) parts.push(`${report.dropped} note${report.dropped === 1 ? '' : 's'} removed (no playable position)`);
  if (report.tiesBroken) parts.push(`${report.tiesBroken} tie${report.tiesBroken === 1 ? '' : 's'} removed`);
  return parts.length ? `${parts.join(', ')}. Undo to restore.` : 'Ready';
}

async function changeInstrument(instrumentId: string, notes: readonly number[]): Promise<void> {
  const track = mainTrack(history.present.song);
  const unchanged = track.instrumentId === instrumentId &&
    track.tuning.length === notes.length && track.tuning.every((n, i) => n === notes[i]);
  if (isPlaying || unchanged) {
    syncControlsFromState();
    return;
  }

  let mode: 'pitch' | 'fret' | null = 'fret';
  if (hasNotes()) {
    mode = await askRemapMode(`This song has notes. How should they move to ${describeTuning(instrumentId, notes)}?`);
  }
  if (mode === null || isPlaying) {
    syncControlsFromState();
    return;
  }

  let report: RemapReport | undefined;
  const chosen = mode;
  if (edit(doc => { report = setInstrument(doc, instrumentId, notes, chosen); }) && report) {
    elements.playbackStatus.textContent = describeRemap(report);
  }
  syncControlsFromState();
  renderApp();
}

function selectedKey(): { tonic: number; scaleId: string } {
  return { tonic: Number(elements.scaleTonicSelect.value), scaleId: elements.scaleSelect.value };
}

function handleKeyChange(): void {
  if (!isPlaying) edit(doc => setKeyAtCursor(doc, selectedKey()));
  renderApp();
}

function handleKeyChangeButton(): void {
  if (isPlaying) return;
  const hasKeyChange = Boolean(history.present.song.timeline.bars[history.present.cursor.bar]?.key);
  if (edit(doc => (hasKeyChange ? removeKeyChangeAtCursor(doc) : addKeyChangeAtCursor(doc, selectedKey())))) {
    elements.playbackStatus.textContent = hasKeyChange
      ? 'Key change removed.'
      : 'Key change added: the key fields now set the key from this bar on.';
  }
  renderApp();
}

function handleChordChange(): void {
  if (isPlaying) return;
  const root = elements.chordRootSelect.value;
  const quality = elements.chordQualitySelect.value || 'maj';
  edit(doc => setChordAtCursor(doc, root === '' ? null : { root: Number(root), quality }));
  renderApp();
}

function handleTie(): void {
  if (isPlaying) return;
  const onEvent = Boolean(eventAtCursor(history.present));
  if (edit(doc => (onEvent ? toggleTie(doc) : continueWithTie(doc, ui.view.duration)))) {
    elements.playbackStatus.textContent = 'Ready';
  }
  renderApp();
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
  // A modal dialog is waiting for an answer; editing underneath it would invalidate that answer.
  if (document.querySelector('dialog[open]')) return;
  const target = event.target as HTMLElement | null;
  // Leave keys inside text fields and lists to the browser.
  if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || (target.tagName === 'INPUT' &&
    ['text', 'number', 'search', 'range'].includes((target as HTMLInputElement).type)))) return;
  if (!event.ctrlKey && !event.metaKey && !event.altKey) {
    handleEditingKey(event);
    return;
  }
  if (event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === 'z' && !event.shiftKey) {
    event.preventDefault();
    handleUndo();
  } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
    event.preventDefault();
    handleRedo();
  }
}

/** Cursor and editing keys: arrows move, Delete/Backspace remove, Insert adds a rest before the cursor. */
function handleEditingKey(event: KeyboardEvent): void {
  // Enter on a focused button or menu presses that control instead.
  if (event.key === 'Enter' && (event.target as Element | null)?.closest('button, summary, a, label')) return;
  if (runEditingKey(event.key)) event.preventDefault();
}

/** Run an editing key's action; returns false for keys that are not editing keys. */
function runEditingKey(key: string): boolean {
  if (isPlaying) return false;
  let change: ((doc: EditorDoc) => void) | null = null;
  let recorded = true;
  switch (key) {
    case 'ArrowRight':
    case 'Enter': change = doc => moveCursor(doc, 1); recorded = false; break;
    case 'ArrowLeft': change = doc => moveCursor(doc, -1); recorded = false; break;
    case 'Delete': change = deleteAtCursor; break;
    case 'Backspace': change = deleteBeforeCursor; break;
    case 'Insert': change = doc => insertEvent(doc, [], ui.view.duration); break;
    default: return false;
  }
  if (recorded) {
    if (edit(change)) elements.playbackStatus.textContent = 'Ready';
  } else {
    history.amend(change);
  }
  renderApp();
  return true;
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

  playSpans = noteSpans(history.present.song);
  lastPlayTick = -1;
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
  // Light every string that is sounding, including let-ring notes from earlier.
  ui.activeNotes = tick === null ? [] : soundingAt(playSpans, tick).filter(s => !s.dead);
  // Pluck each note once, in the frame where it starts.
  if (tick !== null) {
    for (const span of playSpans) {
      if (span.startTick > lastPlayTick && span.startTick <= tick) fretboard.pluck(span);
    }
    lastPlayTick = tick;
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
  lastPlayTick = -1;
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

/** Describe the event being worked on under the fretboard. */
function renderSelectedNote(): void {
  const event = currentEvent(history.present);
  const label = eventAtCursor(history.present) ? 'At cursor' : 'Last entered';
  if (!event) {
    elements.selectedNote.textContent = 'Click a string to write a note. Shift+click adds notes to a chord.';
    return;
  }
  const track = mainTrack(history.present.song);
  const name = document.createElement('b');
  name.textContent = event.notes.length
    ? event.notes.map(n => (n.dead ? 'x' : midiToNoteName(noteMidi(track, n)))).join(' + ')
    : 'Rest';
  const where = event.notes
    .map(n => `string ${n.string} ${n.dead ? 'muted' : `fret ${n.fret}`}${n.letRing ? ' (let ring)' : ''}`)
    .join(', ');
  elements.selectedNote.replaceChildren(`${label}: `, name,
    ` — ${durationName(event.duration).toLowerCase()}${where ? ` · ${where}` : ''}`);
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
  tabView.updatePlayback(ui);
  fretboard.update(ui);
}

function updateControls(): void {
  const { song } = history.present;
  const notes = hasNotes();

  elements.undoButton.disabled = !history.canUndo || isPlaying;
  elements.redoButton.disabled = !history.canRedo || isPlaying;
  elements.clearButton.disabled = !notes || isPlaying;
  elements.restButton.disabled = isPlaying;
  elements.tieButton.disabled = isPlaying;
  elements.chordToggle.disabled = isPlaying;
  elements.muteToggle.disabled = isPlaying;
  elements.ringToggle.disabled = isPlaying;
  elements.dotToggle.disabled = isPlaying;
  elements.tripletToggle.disabled = isPlaying;
  elements.cursorPrev.disabled = isPlaying;
  elements.cursorNext.disabled = isPlaying;
  elements.deleteButton.disabled = isPlaying || !eventAtCursor(history.present);

  elements.playButton.classList.toggle('is-playing', isPlaying);
  elements.playButton.setAttribute('aria-label', isPlaying ? 'Stop' : 'Play');

  elements.instrumentSelect.disabled = isPlaying;
  elements.tuningSelect.disabled = isPlaying;
  elements.fretCountSelect.disabled = isPlaying;
  for (const chip of elements.durationChips.querySelectorAll<HTMLButtonElement>('.chip')) chip.disabled = isPlaying;
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
  elements.scaleTonicSelect.disabled = isPlaying;
  elements.scaleSelect.disabled = isPlaying;
}

function changeBarsPerRow(change: number): void {
  if (isPlaying) return;
  ui.view.barsPerRow = Math.min(8, Math.max(1, ui.view.barsPerRow + change));
  tabView.render(ui);
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
    syncControlsFromState();
    elements.playbackStatus.textContent = 'Free chart. Undo restores the previous chart and notes.';
    renderApp();
  }
}

init();
