import { createState, getInstrument } from './state';
import { getScale } from './scales';
import { byId } from './dom';
import { errorMessage } from './errors';
import type { AppState, Bar, RhythmChart, ScaleOverlay, TabEvent } from './types';

const STORAGE_KEY = 'maxtabs.project.v1';
const FORMAT = 'maxtabs-project';
const VERSION = 1;

/** The persisted subset of AppState. */
type ProjectData = Pick<AppState,
  | 'instrumentId' | 'fretCount' | 'bpm'
  | 'beatsPerBar' | 'slotsPerBeat' | 'selectedDurationSlots'
  | 'cursorSlot' | 'nextEventId' | 'events' | 'rhythmChart'
  | 'barsPerRow' | 'scaleOverlay' | 'metronomeEnabled' | 'clickVolume'>;

interface ProjectDocument {
  format: typeof FORMAT;
  version: typeof VERSION;
  title: string;
  savedAt: string;
  project: ProjectData;
}

export interface ProjectFilesOptions {
  state: AppState;
  isBusy: () => boolean;
  beforeSave?: () => void;
  onLoaded: () => void;
}

export function setupProjectFiles({
  state,
  isBusy,
  beforeSave,
  onLoaded
}: ProjectFilesOptions): void {
  console.log('Project file controls initialized');
  const titleInput = byId<HTMLInputElement>('project-title');
  const saveButton = byId<HTMLButtonElement>('project-save');
  const loadButton = byId<HTMLButtonElement>('project-load');
  const exportButton = byId<HTMLButtonElement>('project-export');
  const status = byId('project-status');
  const openInput = byId<HTMLInputElement>('project-open');

  function report(message: string): void {
    status.textContent = message;
  }

  function captureProject(): ProjectDocument {
    beforeSave?.();

    return {
      format: FORMAT,
      version: VERSION,
      title: titleInput.value.trim() || 'Untitled',
      savedAt: new Date().toISOString(),

      project: {
        instrumentId: state.instrumentId,
        fretCount: state.fretCount,
        bpm: state.bpm,

        beatsPerBar: state.beatsPerBar,
        slotsPerBeat: state.slotsPerBeat,
        selectedDurationSlots: state.selectedDurationSlots,

        cursorSlot: state.cursorSlot,
        nextEventId: state.nextEventId,
        events: state.events,
        rhythmChart: state.rhythmChart,

        barsPerRow: state.barsPerRow,
        scaleOverlay: state.scaleOverlay,
        metronomeEnabled: state.metronomeEnabled,
        clickVolume: state.clickVolume
      }
    };
  }

  function applyProject(restored: ProjectData, title: string): void {
    Object.assign(state, createState(), restored, {
      selectedNote: null,
      playbackSlot: null,
      activeNotes: []
    });

    titleInput.value = title;
    onLoaded();
  }

  saveButton.addEventListener('click', () => {
    if (isBusy()) {
      report('Stop playback before saving.');
      return;
    }

    try {
      const existing = localStorage.getItem(STORAGE_KEY);

      if (
        existing &&
        !window.confirm(
          'Replace the existing browser save? ' +
          'Export it first if you want to keep a separate copy.'
        )
      ) {
        return;
      }

      const project = captureProject();

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(project)
      );

      report(`Saved “${project.title}” in this browser.`);
    } catch (error) {
      console.error('Project save failed:', error);
      report('Save failed. Try exporting a JSON copy instead.');
    }
  });

  loadButton.addEventListener('click', () => {
    if (isBusy()) {
      report('Stop playback before loading.');
      return;
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        report('No browser save found.');
        return;
      }

      // Validate fully before changing the current project.
      const { title, project } = validateProject(JSON.parse(raw));

      if (
        !window.confirm(
          `Load “${title}” and replace the current project? ` +
          'Unsaved changes will be lost.'
        )
      ) {
        return;
      }

      applyProject(project, title);
      report(`Loaded “${title}”.`);
    } catch (error) {
      console.error('Project load failed:', error);
      report(`Load failed: ${errorMessage(error)}`);
    }
  });

  openInput.addEventListener('change', async () => {
    const file = openInput.files?.[0];

    if (!file) {
      return;
    }

    try {
      if (isBusy()) {
        report('Stop playback before opening a project.');
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        throw new Error('Project file must be smaller than 5 MB.');
      }

      const text = await file.text();

      // Validate before modifying the current project.
      const { title, project } = validateProject(JSON.parse(text));

      // Playback may have started while the file was being read.
      if (isBusy()) {
        report('Stop playback before opening a project.');
        return;
      }

      const approved = window.confirm(
        `Open “${title}” and replace the current project? ` +
        'Unsaved changes will be lost.'
      );

      if (!approved) {
        return;
      }

      applyProject(project, title);
      report(`Opened “${title}”.`);
    } catch (error) {
      console.error('Project open failed:', error);
      report(`Open failed: ${errorMessage(error)}`);
    } finally {
      // Allow selecting the same file again.
      openInput.value = '';
    }
  });

  exportButton.addEventListener('click', () => {
    if (isBusy()) {
      report('Stop playback before exporting.');
      return;
    }

    try {
      const project = captureProject();
      downloadProject(project);
      report(`Export requested for “${project.title}”.`);
    } catch (error) {
      console.error('Project export failed:', error);
      report(`Export failed: ${errorMessage(error)}`);
    }
  });
}


function downloadProject(project: ProjectDocument): void {
  const text = JSON.stringify(project, null, 2);
  const blob = new Blob([text], {
    type: 'application/json'
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  const filename = project.title
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'maxtabs-project';

  link.href = url;
  link.download = `${filename}.maxtabs.json`;

  document.body.append(link);
  link.click();
  link.remove();

  // Leave enough time for the browser to begin the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Loose views of untrusted JSON: every field is checked before use.
type Loose<T> = { [K in keyof T]?: unknown };

export function validateProject(input: unknown): { title: string; project: ProjectData } {
  function require(condition: unknown, message: string): asserts condition {
    if (!condition) {
      throw new Error(message);
    }
  }

  function integer(value: unknown, min: number, max: number): value is number {
    return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
  }

  function number(value: unknown, min: number, max: number): value is number {
    return (
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= min &&
      value <= max
    );
  }

  function oneOf<T>(values: readonly T[], value: unknown): value is T {
    return values.includes(value as T);
  }

  const doc = input as Loose<ProjectDocument> | null;

  require(
    doc?.format === FORMAT && doc.version === VERSION,
    'Unsupported project format or version.'
  );

  require(
    typeof doc.title === 'string' &&
    doc.title.length <= 120,
    'Invalid project title.'
  );

  const title = doc.title;
  const p = doc.project as Loose<ProjectData> | null | undefined;

  require(p && typeof p === 'object', 'Missing project data.');

  const instrument = typeof p.instrumentId === 'string' ? getInstrument(p.instrumentId) : undefined;

  require(instrument, 'Unknown instrument.');
  require(oneOf([12, 15, 17, 22], p.fretCount), 'Invalid fret count.');
  require(number(p.bpm, 20, 300), 'Invalid BPM.');

  require(
    p.beatsPerBar === 4 && p.slotsPerBeat === 2,
    'Unsupported base grid.'
  );

  require(
    oneOf([1, 2, 4, 8], p.selectedDurationSlots),
    'Invalid selected duration.'
  );

  require(integer(p.barsPerRow, 1, 8), 'Invalid bars-per-row setting.');
  require(integer(p.cursorSlot, 0, 10000000), 'Invalid cursor.');
  require(integer(p.nextEventId, 1, 10000000), 'Invalid next event ID.');

  require(
    Array.isArray(p.events) && p.events.length <= 100000,
    'Invalid event list.'
  );

  require(
    typeof p.metronomeEnabled === 'boolean' &&
    number(p.clickVolume, 0, 0.6),
    'Invalid metronome settings.'
  );

  const overlay = p.scaleOverlay as Loose<ScaleOverlay> | null | undefined;

  require(
    overlay &&
    typeof overlay.enabled === 'boolean' &&
    integer(overlay.tonicPitchClass, 0, 11) &&
    typeof overlay.scaleId === 'string' &&
    Boolean(getScale(overlay.scaleId)),
    'Invalid scale overlay.'
  );

  let chartEnd = Infinity;
  let chartBars: Loose<Bar>[] | null = null;

  if (p.rhythmChart !== null) {
    const chart = p.rhythmChart as Loose<RhythmChart> | undefined;

    require(
      chart &&
      typeof chart.name === 'string' &&
      Array.isArray(chart.bars) &&
      chart.bars.length > 0 &&
      chart.bars.length <= 256,
      'Invalid rhythm chart.'
    );

    chartBars = chart.bars as Loose<Bar>[];
    let expectedStart = 0;

    for (const bar of chartBars) {
      require(
        integer(bar.numerator, 1, 32) &&
        oneOf([1, 2, 4, 8], bar.denominator),
        'Invalid bar meter.'
      );

      const pulseSlots = 8 / bar.denominator;
      const lengthSlots = bar.numerator * pulseSlots;

      require(
        bar.startSlot === expectedStart &&
        bar.pulseSlots === pulseSlots &&
        bar.lengthSlots === lengthSlots &&
        number(bar.quarterBpm, 1, 1600),
        'Invalid bar timing.'
      );

      require(
        Array.isArray(bar.accents) &&
        bar.accents.length === bar.numerator &&
        bar.accents.every(value => oneOf([0, 1, 2], value)),
        'Invalid bar accents.'
      );

      expectedStart += lengthSlots;
    }

    chartEnd = expectedStart;
  }

  let expectedStart = 0;
  let largestId = 0;
  const ids = new Set<number>();

  for (const event of p.events as Loose<TabEvent>[]) {
    require(
      integer(event.id, 1, 10000000) &&
      !ids.has(event.id),
      'Invalid or duplicate event ID.'
    );

    ids.add(event.id);
    largestId = Math.max(largestId, event.id);

    require(
      oneOf(['note', 'rest'], event.type) &&
      event.startSlot === expectedStart &&
      oneOf([1, 2, 4, 8], event.durationSlots),
      'Invalid event timing.'
    );

    const startSlot = expectedStart;
    const end = startSlot + event.durationSlots;

    const bar = chartBars
      ? chartBars.find(
        b =>
          startSlot >= (b.startSlot as number) &&
          startSlot < (b.startSlot as number) + (b.lengthSlots as number)
      ) as Pick<Bar, 'startSlot' | 'lengthSlots'> | undefined
      : {
        startSlot: Math.floor(startSlot / 8) * 8,
        lengthSlots: 8
      };

    require(
      bar && end <= bar.startSlot + bar.lengthSlots,
      'An event crosses a bar boundary.'
    );

    require(
      Array.isArray(event.notes) &&
      (
        event.type === 'rest'
          ? event.notes.length === 0
          : event.notes.length === 1
      ) &&
      Array.isArray(event.techniques),
      'Invalid event contents.'
    );

    for (const note of event.notes as Loose<TabEvent['notes'][number]>[]) {
      const string = instrument.strings.find(
        item => item.number === note.string
      );

      require(
        string &&
        integer(note.fret, 0, 127) &&
        integer(note.midi, 0, 127) &&
        note.midi === string.midi + note.fret &&
        typeof note.noteName === 'string',
        'Invalid note.'
      );
    }

    expectedStart = end;
  }

  require(
    p.cursorSlot === expectedStart &&
    p.cursorSlot <= chartEnd &&
    p.nextEventId > largestId,
    'Project cursor or event IDs are inconsistent.'
  );

  // Return only fields understood by this version.
  return {
    title,
    project: {
      instrumentId: p.instrumentId as string,
      fretCount: p.fretCount,
      bpm: p.bpm,
      beatsPerBar: p.beatsPerBar,
      slotsPerBeat: p.slotsPerBeat,
      selectedDurationSlots: p.selectedDurationSlots,
      cursorSlot: p.cursorSlot,
      nextEventId: p.nextEventId,
      events: p.events as TabEvent[],
      rhythmChart: p.rhythmChart as RhythmChart | null,
      barsPerRow: p.barsPerRow,
      scaleOverlay: p.scaleOverlay as ScaleOverlay,
      metronomeEnabled: p.metronomeEnabled,
      clickVolume: p.clickVolume
    }
  };
}
