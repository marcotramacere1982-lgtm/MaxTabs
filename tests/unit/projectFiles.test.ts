import { describe, expect, it } from 'vitest';
import fixtureJson from '../fixtures/metronomo-test.json';
import { validateProject } from '../../src/projectFiles';
import { importMetronomo } from '../../src/importers/metronomoComposto';
import { addNoteEvent, addRestEvent, applyRhythmChart, createState } from '../../src/state';
import type { AppState } from '../../src/types';

function documentFor(state: AppState, title = 'Song') {
  const { selectedNote: _s, playbackSlot: _p, activeNotes: _a, ...project } = structuredClone(state);
  return { format: 'maxtabs-project', version: 1, title, savedAt: '2026-10-18T00:00:00Z', project };
}

const note = { string: 5, stringLabel: 'A', fret: 2, midi: 47, noteName: 'B2' };

describe('validateProject', () => {
  it('round-trips a free 4/4 project', () => {
    const state = createState();
    addNoteEvent(state, note);
    addRestEvent(state);
    const { title, project } = validateProject(documentFor(state));
    expect(title).toBe('Song');
    expect(project.events).toHaveLength(2);
    expect(project.cursorSlot).toBe(2);
  });

  it('round-trips a project with an imported chart', () => {
    const state = createState();
    applyRhythmChart(state, importMetronomo(structuredClone(fixtureJson)));
    addNoteEvent(state, note);
    expect(validateProject(documentFor(state)).project.rhythmChart?.bars).toHaveLength(3);
  });

  it('rejects unknown formats', () => {
    expect(() => validateProject({ format: 'other', version: 1 })).toThrow(/format/);
    expect(() => validateProject(null)).toThrow(/format/);
  });

  it('rejects notes whose pitch does not match string and fret', () => {
    const state = createState();
    addNoteEvent(state, note);
    const doc = documentFor(state);
    doc.project.events[0]!.notes[0]!.midi = 60;
    expect(() => validateProject(doc)).toThrow(/Invalid note/);
  });

  it('rejects an inconsistent cursor', () => {
    const state = createState();
    addNoteEvent(state, note);
    const doc = documentFor(state);
    doc.project.cursorSlot = 5;
    expect(() => validateProject(doc)).toThrow(/cursor/);
  });
});
