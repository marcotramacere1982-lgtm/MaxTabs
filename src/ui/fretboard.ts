import { getScale, type Scale } from '../model/scales';
import { mainTrack, type Key } from '../model/song';
import { midiToNoteName, pitchClassOf, stringsOf } from '../model/pitch';
import { harmonyAt } from '../model/harmony';
import { cursorPosition } from '../model/editing';
import type { FretboardNote, UiState } from './uiState';

const MARKER_FRETS = new Set([3, 5, 7, 9, 12, 15, 17, 19, 21, 24]);

/** The key the overlay shows: the harmony in effect at the cursor. */
export function overlayKey(ui: UiState): Key {
  const position = cursorPosition(ui.doc);
  const bars = ui.doc.song.timeline.bars.length;
  return position.ended
    ? harmonyAt(ui.doc.song, bars - 1, Number.MAX_SAFE_INTEGER).key
    : harmonyAt(ui.doc.song, position.bar, position.tickInBar).key;
}

export function renderFretboard(
  ui: UiState,
  container: HTMLElement,
  onNoteClicked: (note: FretboardNote) => void
): void {
  const strings = stringsOf(mainTrack(ui.doc.song).tuning);
  const fretCount = ui.view.fretCount;
  const key = ui.view.overlayEnabled ? overlayKey(ui) : null;
  const activeScale = key ? getScale(key.scaleId) : undefined;

  container.replaceChildren();
  container.style.setProperty('--fret-count', String(fretCount + 1));

  for (const stringData of [...strings].reverse()) {
    const row = document.createElement('div');
    row.className = 'fretboard-row';

    const stringLabel = document.createElement('span');
    stringLabel.className = 'string-label';
    stringLabel.textContent = `${stringData.label} (${stringData.noteName})`;
    row.append(stringLabel);

    for (let fret = 0; fret <= fretCount; fret += 1) {
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

      const scaleTone = key ? getScaleToneInfo(key.tonic, activeScale, midi) : null;

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
        ui.selectedNote &&
        ui.selectedNote.string === stringData.number &&
        ui.selectedNote.fret === fret;

      if (isSelected) {
        button.classList.add('is-selected');
      }

      const isPlayingThisFret = ui.activeNotes.some((note) => {
        return (
          note.string === stringData.number &&
          note.fret === fret
        );
      });

      if (isPlayingThisFret) {
        button.classList.add('is-playing');
      }

      button.addEventListener('click', () => {
        onNoteClicked({ string: stringData.number, fret, midi, noteName });
      });

      row.append(button);
    }

    container.append(row);
  }

  renderFretMarkers(fretCount, container);
}

function getScaleToneInfo(
  tonic: number,
  scale: Scale | undefined,
  midi: number
): { degree: string; isRoot: boolean } | null {
  if (!scale) {
    return null;
  }

  const interval = (pitchClassOf(midi) - tonic + 12) % 12;
  const degree = scale.degrees[scale.intervals.indexOf(interval)];

  if (degree === undefined) {
    return null;
  }

  return {
    degree,
    isRoot: interval === 0
  };
}

function renderFretMarkers(fretCount: number, container: HTMLElement): void {
  const markerRow = document.createElement('div');
  markerRow.className = 'fretboard-marker-row';

  const spacer = document.createElement('span');
  markerRow.append(spacer);

  for (let fret = 0; fret <= fretCount; fret += 1) {
    const marker = document.createElement('span');
    marker.className = 'fret-marker';

    if (MARKER_FRETS.has(fret)) {
      marker.textContent = fret === 12 || fret === 24 ? '●●' : '●';
    }

    markerRow.append(marker);
  }

  container.append(markerRow);
}
