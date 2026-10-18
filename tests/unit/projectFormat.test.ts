import { describe, expect, it } from 'vitest';
import { defaultViewPrefs, parseProject, serializeProject } from '../../src/io/projectFormat';
import { insertEvent } from '../../src/model/editing';
import { layoutBars } from '../../src/model/timeline';
import { mainTrack } from '../../src/model/song';
import { d, newDoc } from '../helpers';

const note = { string: 5, fret: 2 };

describe('format v2', () => {
  it('round-trips a document and view preferences through JSON', () => {
    const doc = newDoc();
    insertEvent(doc, [note], d(4, 1));
    insertEvent(doc, [], d(16));
    const view = { ...defaultViewPrefs(), fretCount: 22, duration: d(16) };
    const file = serializeProject('  Song  ', doc, view, new Date('2026-10-19T00:00:00Z'));
    expect(file.title).toBe('Song');
    const loaded = parseProject(JSON.parse(JSON.stringify(file)));
    expect(loaded).toEqual({ title: 'Song', doc, view });
  });

  it('rejects other formats and versions', () => {
    expect(() => parseProject(null)).toThrow(/Not a MaxTabs/);
    expect(() => parseProject({ format: 'other' })).toThrow(/Not a MaxTabs/);
    expect(() => parseProject({ format: 'maxtabs-project', version: 3 })).toThrow(/Unsupported project version/);
  });

  it('rejects invalid songs with the location of the problem', () => {
    const file = JSON.parse(JSON.stringify(serializeProject('x', newDoc(), defaultViewPrefs())));
    file.doc.song.tracks[0].bars[0].events = [{ duration: { value: 1, dots: 0 }, notes: [{ string: 9, fret: 0 }] }];
    expect(() => parseProject(file)).toThrow(/Track 1, bar 1, event 1: note on a missing string/);
  });

  it('falls back to default view preferences when they are damaged', () => {
    const file = JSON.parse(JSON.stringify(serializeProject('x', newDoc(), defaultViewPrefs())));
    file.view = { fretCount: 99, barsPerRow: 'many' };
    expect(parseProject(file).view).toEqual(defaultViewPrefs());
  });
});

/** A v1 file as the alpha wrote it. */
function v1File(project: Record<string, unknown>) {
  return {
    format: 'maxtabs-project',
    version: 1,
    title: 'Old song',
    savedAt: '2026-10-15T00:00:00Z',
    project: {
      instrumentId: 'guitar-standard', fretCount: 15, bpm: 100, beatsPerBar: 4, slotsPerBeat: 2,
      selectedDurationSlots: 2, cursorSlot: 0, nextEventId: 1, events: [], rhythmChart: null, barsPerRow: 4,
      scaleOverlay: { enabled: true, tonicPitchClass: 9, scaleId: 'minor-pentatonic' },
      metronomeEnabled: false, clickVolume: 0.2,
      ...project
    }
  };
}

const v1Event = (id: number, startSlot: number, durationSlots: number, fret: number | null) => ({
  id, type: fret === null ? 'rest' : 'note', startSlot, durationSlots,
  notes: fret === null ? [] : [{ string: 6, fret, midi: 40 + fret, noteName: 'x' }], techniques: []
});

describe('migration from v1', () => {
  it('converts a free 4/4 project', () => {
    const events = [v1Event(1, 0, 4, 3), v1Event(2, 4, 2, null), v1Event(3, 6, 2, 5), v1Event(4, 8, 1, 7)];
    const loaded = parseProject(v1File({ events, cursorSlot: 9, nextEventId: 5 }));
    expect(loaded.migratedFrom).toBe(1);
    expect(loaded.title).toBe('Old song');
    const { song, cursor } = loaded.doc;
    expect(song.tempo).toEqual({ bpm: 100, unit: 4, dotted: false });
    expect(song.key).toEqual({ tonic: 9, scaleId: 'minor-pentatonic' });
    expect(song.timeline.extendable).toBe(true);
    const bars = mainTrack(song).bars;
    expect(bars.map(b => b.events.map(e => e.duration.value))).toEqual([[2, 4, 4], [8]]);
    expect(bars[0]?.events[1]?.notes).toEqual([]);
    expect(bars[1]?.events[0]?.notes).toEqual([{ string: 6, fret: 7 }]);
    expect(cursor).toEqual({ bar: 1, index: 1 });
    expect(loaded.view).toEqual({
      fretCount: 15, barsPerRow: 4, overlayEnabled: true, metronomeEnabled: false, clickVolume: 0.2, duration: d(4)
    });
  });

  it('places the cursor on the next bar when the last bar is full', () => {
    const loaded = parseProject(v1File({ events: [v1Event(1, 0, 8, 0)], cursorSlot: 8, nextEventId: 2 }));
    expect(loaded.doc.cursor).toEqual({ bar: 1, index: 0 });
    expect(loaded.doc.song.timeline.bars).toHaveLength(1);
  });

  it('converts an imported chart with a tempo map', () => {
    const bar = (numerator: number, denominator: number, startSlot: number, quarterBpm: number, tempoValue: number) => ({
      numerator, denominator, startSlot, lengthSlots: numerator * 8 / denominator, pulseSlots: 8 / denominator,
      quarterBpm, accents: Array.from({ length: numerator }, (_, i) => (i ? 0 : 2)),
      tempoValue, tempoUnit: 'denom'
    });
    const rhythmChart = {
      name: 'Odd', bars: [bar(7, 8, 0, 60, 120), bar(2, 4, 7, 120, 120)],
      source: { app: 'metronomo-composto', version: 1, unit: 'denom', perBar: false }
    };
    const loaded = parseProject(v1File({ rhythmChart, events: [v1Event(1, 0, 4, 2)], cursorSlot: 4, nextEventId: 2 }));
    const { song } = loaded.doc;
    expect(song.timeline.extendable).toBe(false);
    expect(song.timeline.source).toEqual({ app: 'metronomo-composto', name: 'Odd' });
    expect(song.tempo).toEqual({ bpm: 120, unit: 8, dotted: false });
    expect(song.timeline.bars[1]?.tempo).toEqual({ bpm: 120, unit: 4, dotted: false });
    // Same audible timing as v1: 7 eighths at 60 quarter BPM, then 2 quarters at 120.
    expect(layoutBars(song).map(b => b.endSeconds)).toEqual([3.5, 4.5]);
    expect(loaded.doc.cursor).toEqual({ bar: 0, index: 1 });
  });

  it('keeps v1 validation', () => {
    expect(() => parseProject(v1File({ cursorSlot: 3 }))).toThrow(/inconsistent/);
    expect(() => parseProject(v1File({ instrumentId: 'banjo' }))).toThrow(/Unknown instrument/);
    expect(() => parseProject(v1File({ events: [v1Event(1, 7, 2, 0)], cursorSlot: 9 }))).toThrow(/Invalid event timing/);
  });
});

describe('instrument ids from early v2 files', () => {
  it('maps per-tuning ids to instrument types', () => {
    const file = JSON.parse(JSON.stringify(serializeProject('x', newDoc(), defaultViewPrefs())));
    file.doc.song.tracks[0].instrumentId = 'guitar-drop-d';
    file.doc.song.tracks[0].tuning = [38, 45, 50, 55, 59, 64];
    const track = mainTrack(parseProject(file).doc.song);
    expect(track.instrumentId).toBe('guitar-6');
    expect(track.tuning).toEqual([38, 45, 50, 55, 59, 64]);
  });

  it('rejects unknown instruments and tunings with the wrong string count', () => {
    const file = JSON.parse(JSON.stringify(serializeProject('x', newDoc(), defaultViewPrefs())));
    file.doc.song.tracks[0].instrumentId = 'banjo';
    expect(() => parseProject(file)).toThrow(/unknown instrument/);
    file.doc.song.tracks[0].instrumentId = 'bass-5';
    expect(() => parseProject(file)).toThrow(/5 strings/);
  });
});
