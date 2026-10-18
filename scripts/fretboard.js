import { getInstrument } from './state.js';
import { getScale } from './scales.js';

const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B'
];

const MARKER_FRETS = new Set([3, 5, 7, 9, 12, 15, 17, 19, 21]);

export function renderFretboard(state, container, onNoteClicked) {
  const instrument = getInstrument(state.instrumentId);
  const activeScale = state.scaleOverlay.enabled
    ? getScale(state.scaleOverlay.scaleId)
    : null;

  container.replaceChildren();
  container.style.setProperty('--fret-count', state.fretCount + 1);

  for (const stringData of [...instrument.strings].reverse()) {
    const row = document.createElement('div');
    row.className = 'fretboard-row';

    const stringLabel = document.createElement('span');
    stringLabel.className = 'string-label';
    stringLabel.textContent = `${stringData.label} (${stringData.noteName})`;
    row.append(stringLabel);

    for (let fret = 0; fret <= state.fretCount; fret += 1) {
      const midi = stringData.midi + fret;
      const noteName = midiToNoteName(midi);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'fret';

      button.dataset.string = String(stringData.number);
      button.dataset.fret = String(fret);
      button.dataset.midi = String(midi);
      button.dataset.noteName = noteName;

      button.title =
        `String ${stringData.number}, fret ${fret}: ${noteName}`;

      button.setAttribute(
        'aria-label',
        `String ${stringData.number}, fret ${fret}, ${noteName}`
      );

      const scaleTone = getScaleToneInfo(state, activeScale, midi);

      if (scaleTone) {
        button.classList.add('is-scale-tone');
        button.textContent = scaleTone.degree;

        if (scaleTone.isRoot) {
          button.classList.add('is-scale-root');
        }
      } else if (fret === 0) {
        button.textContent = '0';
      }

      const isSelected =
        state.selectedNote &&
        state.selectedNote.string === stringData.number &&
        state.selectedNote.fret === fret;

      if (isSelected) {
        button.classList.add('is-selected');
      }

      const isPlayingThisFret = state.activeNotes.some((note) => {
        return (
          note.string === stringData.number &&
          note.fret === fret
        );
      });

      if (isPlayingThisFret) {
        button.classList.add('is-playing');
      }

      button.addEventListener('click', () => {
        const note = {
          string: stringData.number,
          stringLabel: stringData.label,
          fret,
          midi,
          noteName
        };

        onNoteClicked(note);
      });

      row.append(button);
    }

    container.append(row);
  }

  renderFretMarkers(state, container);
}

function getScaleToneInfo(state, scale, midi) {
  if (!scale) {
    return null;
  }

  const pitchClass = getPitchClass(midi);
  const interval = (pitchClass - state.scaleOverlay.tonicPitchClass + 12) % 12;
  const scaleIndex = scale.intervals.indexOf(interval);

  if (scaleIndex === -1) {
    return null;
  }

  return {
    degree: scale.degrees[scaleIndex],
    isRoot: interval === 0
  };
}

function getPitchClass(midi) {
  return ((midi % 12) + 12) % 12;
}

function renderFretMarkers(state, container) {
  const markerRow = document.createElement('div');
  markerRow.className = 'fretboard-marker-row';

  const spacer = document.createElement('span');
  markerRow.append(spacer);

  for (let fret = 0; fret <= state.fretCount; fret += 1) {
    const marker = document.createElement('span');
    marker.className = 'fret-marker';

    if (MARKER_FRETS.has(fret)) {
      marker.textContent = fret === 12 ? '●●' : '●';
    }

    markerRow.append(marker);
  }

  container.append(markerRow);
}

function midiToNoteName(midi) {
  const note = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;

  return `${note}${octave}`;
}