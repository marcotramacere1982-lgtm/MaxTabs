import { createState, getInstrument } from './state.js';
import { getScale } from './scales.js';

const STORAGE_KEY = 'maxtabs.project.v1';
const FORMAT = 'maxtabs-project';
const VERSION = 1;

export function setupProjectFiles({
  state,
  isBusy,
  beforeSave,
  onLoaded
}) {
  console.log('Project file controls initialized');
  const titleInput = document.getElementById('project-title');
  const saveButton = document.getElementById('project-save');
  const loadButton = document.getElementById('project-load');
  const exportButton = document.getElementById('project-export');
  const status = document.getElementById('project-status');
  const openInput = document.getElementById('project-open');

  function report(message) {
    status.textContent = message;
  }

  function captureProject() {
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
      const document = JSON.parse(raw);
      const restored = validateProject(document);

      if (
        !window.confirm(
          `Load “${document.title}” and replace the current project? ` +
          'Unsaved changes will be lost.'
        )
      ) {
        return;
      }

      Object.assign(state, createState(), restored, {
        selectedNote: null,
        playbackSlot: null,
        activeNotes: []
      });

      titleInput.value = document.title;
      onLoaded();
      report(`Loaded “${document.title}”.`);
    } catch (error) {
      console.error('Project load failed:', error);
      report(`Load failed: ${error.message}`);
    }
  });

  openInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];

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
      const projectDocument = JSON.parse(text);

      // Validate before modifying the current project.
      const restored = validateProject(projectDocument);

      // Playback may have started while the file was being read.
      if (isBusy()) {
        report('Stop playback before opening a project.');
        return;
      }

      const approved = window.confirm(
        `Open “${projectDocument.title}” and replace the current project? ` +
        'Unsaved changes will be lost.'
      );

      if (!approved) {
        return;
      }

      Object.assign(state, createState(), restored, {
        selectedNote: null,
        playbackSlot: null,
        activeNotes: []
      });

      titleInput.value = projectDocument.title;

      onLoaded();

      report(`Opened “${projectDocument.title}”.`);
    } catch (error) {
      console.error('Project open failed:', error);
      report(`Open failed: ${error.message}`);
    } finally {
      // Allow selecting the same file again.
      event.target.value = '';
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
      report(`Export failed: ${error.message}`);
    }
  });
}

function downloadProject(project) {
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

function validateProject(document) {
  function require(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  function integer(value, min, max) {
    return Number.isInteger(value) && value >= min && value <= max;
  }

  function number(value, min, max) {
    return (
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= min &&
      value <= max
    );
  }

  require(
    document?.format === FORMAT && document.version === VERSION,
    'Unsupported project format or version.'
  );

  require(
    typeof document.title === 'string' &&
    document.title.length <= 120,
    'Invalid project title.'
  );

  const p = document.project;

  require(p && typeof p === 'object', 'Missing project data.');

  const instrument = getInstrument(p.instrumentId);

  require(Boolean(instrument), 'Unknown instrument.');
  require([12, 15, 17, 22].includes(p.fretCount), 'Invalid fret count.');
  require(number(p.bpm, 20, 300), 'Invalid BPM.');

  require(
    p.beatsPerBar === 4 && p.slotsPerBeat === 2,
    'Unsupported base grid.'
  );

  require(
    [1, 2, 4, 8].includes(p.selectedDurationSlots),
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

  require(
    p.scaleOverlay &&
    typeof p.scaleOverlay.enabled === 'boolean' &&
    integer(p.scaleOverlay.tonicPitchClass, 0, 11) &&
    Boolean(getScale(p.scaleOverlay.scaleId)),
    'Invalid scale overlay.'
  );

  let chartEnd = Infinity;

  if (p.rhythmChart !== null) {
    const chart = p.rhythmChart;

    require(
      chart &&
      typeof chart.name === 'string' &&
      Array.isArray(chart.bars) &&
      chart.bars.length > 0 &&
      chart.bars.length <= 256,
      'Invalid rhythm chart.'
    );

    let expectedStart = 0;

    for (const bar of chart.bars) {
      require(
        integer(bar.numerator, 1, 32) &&
        [1, 2, 4, 8].includes(bar.denominator),
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
        bar.accents.every(value => [0, 1, 2].includes(value)),
        'Invalid bar accents.'
      );

      expectedStart += lengthSlots;
    }

    chartEnd = expectedStart;
  }

  let expectedStart = 0;
  let largestId = 0;
  const ids = new Set();

  for (const event of p.events) {
    require(
      integer(event.id, 1, 10000000) &&
      !ids.has(event.id),
      'Invalid or duplicate event ID.'
    );

    ids.add(event.id);
    largestId = Math.max(largestId, event.id);

    require(
      ['note', 'rest'].includes(event.type) &&
      event.startSlot === expectedStart &&
      [1, 2, 4, 8].includes(event.durationSlots),
      'Invalid event timing.'
    );

    const end = event.startSlot + event.durationSlots;

    const bar = p.rhythmChart
      ? p.rhythmChart.bars.find(
        b =>
          event.startSlot >= b.startSlot &&
          event.startSlot < b.startSlot + b.lengthSlots
      )
      : {
        startSlot: Math.floor(event.startSlot / 8) * 8,
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

    for (const note of event.notes) {
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
    instrumentId: p.instrumentId,
    fretCount: p.fretCount,
    bpm: p.bpm,
    beatsPerBar: p.beatsPerBar,
    slotsPerBeat: p.slotsPerBeat,
    selectedDurationSlots: p.selectedDurationSlots,
    cursorSlot: p.cursorSlot,
    nextEventId: p.nextEventId,
    events: p.events,
    rhythmChart: p.rhythmChart,
    barsPerRow: p.barsPerRow,
    scaleOverlay: p.scaleOverlay,
    metronomeEnabled: p.metronomeEnabled,
    clickVolume: p.clickVolume
  };
}