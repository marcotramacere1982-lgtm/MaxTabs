import fixtureJson from './fixtures/metronomo-test.json';
import { History } from '../src/model/history';
import { createDoc, type EditorDoc } from '../src/model/song';
import { validateDoc } from '../src/model/validate';
import { requireInstrument } from '../src/model/instruments';
import type { Duration, NoteValue } from '../src/model/time';

export const GUITAR = requireInstrument('guitar-standard');
export const BASS = requireInstrument('bass-standard');

/** A fresh copy of the metronomo-composto sample: 5/4, 7/8, 2/8 at 120 quarter BPM. */
export const metronomoFixture = (): typeof fixtureJson => structuredClone(fixtureJson);

export function newDoc(): EditorDoc {
  return createDoc(GUITAR.id, GUITAR.tuning);
}

export function newHistory(doc: EditorDoc = newDoc()): History<EditorDoc> {
  return new History(doc, validateDoc);
}

export const d = (value: NoteValue, dots: 0 | 1 | 2 = 0): Duration => ({ value, dots });
