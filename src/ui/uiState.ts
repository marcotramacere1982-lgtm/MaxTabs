import type { EditorDoc } from '../model/song';
import type { ViewPrefs } from '../io/projectFormat';

export interface FretPosition {
  string: number;
  fret: number;
}

/** A fretboard click: position plus the pitch it sounds. */
export interface FretboardNote extends FretPosition {
  midi: number;
  noteName: string;
}

/** Everything the renderers read. */
export interface UiState {
  doc: EditorDoc;
  view: ViewPrefs;
  selectedNote: FretboardNote | null;
  /** Absolute tick of the playhead, or null when stopped. */
  playbackTick: number | null;
  activeNotes: FretPosition[];
}
