// Project files: format v2 (current) and migration from v1 (the slot-based alpha).

import { isNoteValue, type Duration } from '../model/time';
import { validateCursor, validateSong } from '../model/validate';
import type { EditorDoc } from '../model/song';
import { migrateV1 } from './projectV1';

export const PROJECT_FORMAT = 'maxtabs-project';
export const PROJECT_VERSION = 2;

/** Editor preferences saved with a project but not part of the undoable document. */
export interface ViewPrefs {
  fretCount: number;
  barsPerRow: number;
  overlayEnabled: boolean;
  metronomeEnabled: boolean;
  clickVolume: number;
  duration: Duration;
}

export const FRET_COUNTS = [12, 15, 17, 22, 24] as const;

export function defaultViewPrefs(): ViewPrefs {
  return {
    fretCount: 15,
    barsPerRow: 4,
    overlayEnabled: false,
    metronomeEnabled: true,
    clickVolume: 0.3,
    duration: { value: 8, dots: 0 }
  };
}

export interface ProjectFile {
  format: typeof PROJECT_FORMAT;
  version: typeof PROJECT_VERSION;
  title: string;
  savedAt: string;
  doc: EditorDoc;
  view: ViewPrefs;
}

export interface LoadedProject {
  title: string;
  doc: EditorDoc;
  view: ViewPrefs;
  /** Set when the file was upgraded from an older format. */
  migratedFrom?: number;
}

export function serializeProject(title: string, doc: EditorDoc, view: ViewPrefs, now = new Date()): ProjectFile {
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    title: title.trim().slice(0, 120) || 'Untitled',
    savedAt: now.toISOString(),
    doc: structuredClone(doc),
    view: structuredClone(view)
  };
}

/** Parse any supported project version. Throws with a readable message on invalid input. */
export function parseProject(input: unknown): LoadedProject {
  const file = input as { format?: unknown; version?: unknown } | null;
  if (file?.format !== PROJECT_FORMAT) throw new Error('Not a MaxTabs project file.');
  if (file.version === 1) return { ...migrateV1(input), migratedFrom: 1 };
  if (file.version !== PROJECT_VERSION) throw new Error(`Unsupported project version: ${String(file.version)}.`);

  const v2 = input as Partial<Record<keyof ProjectFile, unknown>>;
  if (typeof v2.title !== 'string' || v2.title.length > 120) throw new Error('Invalid project title.');
  const doc = v2.doc as Partial<Record<keyof EditorDoc, unknown>> | null | undefined;
  if (!doc || typeof doc !== 'object') throw new Error('Missing project data.');
  const song = validateSong(doc.song);
  const cursor = validateCursor(song, doc.cursor);
  return { title: v2.title, doc: { song, cursor }, view: parseViewPrefs(v2.view) };
}

/** Lenient: invalid or missing preferences fall back to defaults rather than rejecting the file. */
function parseViewPrefs(input: unknown): ViewPrefs {
  const view = defaultViewPrefs();
  const raw = (input ?? {}) as Record<string, unknown>;
  if (FRET_COUNTS.includes(raw.fretCount as never)) view.fretCount = raw.fretCount as number;
  if (Number.isInteger(raw.barsPerRow) && (raw.barsPerRow as number) >= 1 && (raw.barsPerRow as number) <= 8)
    view.barsPerRow = raw.barsPerRow as number;
  if (typeof raw.overlayEnabled === 'boolean') view.overlayEnabled = raw.overlayEnabled;
  if (typeof raw.metronomeEnabled === 'boolean') view.metronomeEnabled = raw.metronomeEnabled;
  if (typeof raw.clickVolume === 'number' && raw.clickVolume >= 0 && raw.clickVolume <= 0.6)
    view.clickVolume = raw.clickVolume;
  const duration = raw.duration as Partial<Duration> | undefined;
  if (duration && isNoteValue(duration.value) && (duration.dots === 0 || duration.dots === 1 || duration.dots === 2))
    view.duration = { value: duration.value, dots: duration.dots };
  return view;
}
