import { barAt } from './timeline.js';

const INSTRUMENTS = {
  'guitar-standard': {
    name: 'Guitar — Standard',
    strings: [
      { number: 6, label: 'E', noteName: 'E2', midi: 40 },
      { number: 5, label: 'A', noteName: 'A2', midi: 45 },
      { number: 4, label: 'D', noteName: 'D3', midi: 50 },
      { number: 3, label: 'G', noteName: 'G3', midi: 55 },
      { number: 2, label: 'B', noteName: 'B3', midi: 59 },
      { number: 1, label: 'e', noteName: 'E4', midi: 64 }
    ]
  },

  'guitar-drop-d': {
    name: 'Guitar — Drop D',
    strings: [
      { number: 6, label: 'D', noteName: 'D2', midi: 38 },
      { number: 5, label: 'A', noteName: 'A2', midi: 45 },
      { number: 4, label: 'D', noteName: 'D3', midi: 50 },
      { number: 3, label: 'G', noteName: 'G3', midi: 55 },
      { number: 2, label: 'B', noteName: 'B3', midi: 59 },
      { number: 1, label: 'e', noteName: 'E4', midi: 64 }
    ]
  },

  'bass-standard': {
    name: 'Bass — Standard',
    strings: [
      { number: 4, label: 'E', noteName: 'E1', midi: 28 },
      { number: 3, label: 'A', noteName: 'A1', midi: 33 },
      { number: 2, label: 'D', noteName: 'D2', midi: 38 },
      { number: 1, label: 'G', noteName: 'G2', midi: 43 }
    ]
  }
};

export function createState() {
  return {
    instrumentId: 'guitar-standard',
    fretCount: 15,
    selectedNote: null,

    beatsPerBar: 4,
    slotsPerBeat: 2,
    selectedDurationSlots: 1,
    barsPerRow: 4,
    bpm: 120,
    rhythmChart: null,
    metronomeEnabled: true,
    clickVolume: 0.3,

    events: [],
    nextEventId: 1,
    cursorSlot: 0,

    playbackSlot: null,
    activeNotes: [],

    scaleOverlay: {
      enabled: false,
      tonicPitchClass: 0,
      scaleId: 'major'
    }
  };
}

export function getInstrument(instrumentId) {
  return INSTRUMENTS[instrumentId];
}

export function getSlotsPerBar(state) {
  return state.beatsPerBar * state.slotsPerBeat;
}

export function setInstrument(state, instrumentId) {
  state.instrumentId = instrumentId;
  state.selectedNote = null;
  clearEvents(state);
}

export function setFretCount(state, fretCount) {
  state.fretCount = Number(fretCount);
  state.selectedNote = null;
}

export function setSelectedDuration(state, durationSlots) {
  state.selectedDurationSlots = Number(durationSlots);
}

export function setScaleOverlayEnabled(state, enabled) {
  state.scaleOverlay.enabled = Boolean(enabled);
}

export function setScaleTonic(state, tonicPitchClass) {
  state.scaleOverlay.tonicPitchClass = Number(tonicPitchClass);
}

export function setScaleId(state, scaleId) {
  state.scaleOverlay.scaleId = scaleId;
}

export function addNoteEvent(state, note) {
  validateInsertion(state);
  const event = {
    id: state.nextEventId,
    type: 'note',
    startSlot: state.cursorSlot,
    durationSlots: state.selectedDurationSlots,
    notes: [
      {
        string: note.string,
        fret: note.fret,
        midi: note.midi,
        noteName: note.noteName
      }
    ],
    techniques: []
  };

  state.events.push(event);
  state.nextEventId += 1;
  state.cursorSlot += state.selectedDurationSlots;

  return event;
}

export function addRestEvent(state) {
  validateInsertion(state);
  const event = {
    id: state.nextEventId,
    type: 'rest',
    startSlot: state.cursorSlot,
    durationSlots: state.selectedDurationSlots,
    notes: [],
    techniques: []
  };

  state.events.push(event);
  state.nextEventId += 1;
  state.cursorSlot += state.selectedDurationSlots;

  return event;
}

export function undoLastEvent(state) {
  if (state.events.length === 0) {
    return null;
  }

  const removedEvent = state.events.pop();

  state.cursorSlot = removedEvent.startSlot;
  state.nextEventId -= 1;

  return removedEvent;
}

export function clearEvents(state) {
  state.events = [];
  state.cursorSlot = 0;
  state.nextEventId = 1;
}

export function getCursorPosition(state) {
  const bar = barAt(state, state.cursorSlot);
  if (!bar) return {ended:true};
  const bars = state.rhythmChart?.bars;
  const index = bars ? bars.indexOf(bar) : Math.floor(bar.startSlot / 8);
  const offset = state.cursorSlot - bar.startSlot;
  return {bar:index+1, beat:Math.floor(offset/bar.pulseSlots)+1,
    isOffBeat:offset % bar.pulseSlots !== 0, denominator:bar.denominator};
}

function validateInsertion(state) {
  const bar = barAt(state, state.cursorSlot);
  if (!bar) throw new Error('End of imported chart. Undo or clear notes to continue.');
  if (state.cursorSlot + state.selectedDurationSlots > bar.startSlot + bar.lengthSlots)
    throw new Error('This duration crosses a bar line. Choose a shorter duration.');
}

export function applyRhythmChart(state, chart) {
  clearEvents(state);
  clearPlaybackPosition(state);
  state.selectedNote = null;
  state.rhythmChart = chart;
}

export function setPlaybackPosition(state, playbackSlot) {
  state.playbackSlot = playbackSlot;

  const activeEvent = state.events.find((event) => {
    const eventEndSlot = event.startSlot + event.durationSlots;

    return (
      event.type === 'note' &&
      playbackSlot >= event.startSlot &&
      playbackSlot < eventEndSlot
    );
  });

  state.activeNotes = activeEvent ? activeEvent.notes : [];
}

export function clearPlaybackPosition(state) {
  state.playbackSlot = null;
  state.activeNotes = [];
}

export function setBarsPerRow(state, barsPerRow) {
  const value = Number(barsPerRow);

  if (!Number.isFinite(value)) {
    return;
  }

  state.barsPerRow = Math.min(8, Math.max(1, Math.round(value)));
}