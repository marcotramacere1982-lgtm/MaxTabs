import { describe, expect, it } from 'vitest';
import { chordPitchClasses, chordSymbol, harmonyAt, transposeHarmony } from '../../src/model/harmony';
import { appendBar, setBarKey, setChord } from '../../src/model/editing';
import { newDoc } from '../helpers';

function songWithHarmony() {
  const doc = newDoc();
  appendBar(doc.song);
  appendBar(doc.song);
  setChord(doc, 0, 0, { root: 9, quality: 'min' });
  setChord(doc, 0, 1920, { root: 7, quality: 'maj' });
  setBarKey(doc, 2, { tonic: 7, scaleId: 'mixolydian' });
  setChord(doc, 2, 0, { root: 0, quality: 'maj7', bass: 4 });
  return doc.song;
}

describe('chords', () => {
  it('spells symbols', () => {
    expect(chordSymbol({ root: 9, quality: 'm7' })).toBe('Am7');
    expect(chordSymbol({ root: 0, quality: 'maj7', bass: 4 })).toBe('Cmaj7/E');
    expect(chordSymbol({ root: 10, quality: 'maj' }, true)).toBe('Bb');
  });

  it('lists pitch classes', () => {
    expect(chordPitchClasses({ root: 9, quality: 'min' })).toEqual([9, 0, 4]);
    expect(chordPitchClasses({ root: 11, quality: 'm7b5' })).toEqual([11, 2, 5, 9]);
  });
});

describe('harmony at a position', () => {
  it('uses the song key with no chord before any change', () => {
    expect(harmonyAt(newDoc().song, 0, 0)).toEqual({ key: { tonic: 0, scaleId: 'major' }, chord: null });
  });

  it('follows chord changes within and across bars', () => {
    const song = songWithHarmony();
    expect(harmonyAt(song, 0, 1919).chord?.root).toBe(9);
    expect(harmonyAt(song, 0, 1920).chord?.root).toBe(7);
    // Bar 2 has no chords: the last one carries over.
    expect(harmonyAt(song, 1, 0).chord?.root).toBe(7);
  });

  it('follows key changes', () => {
    const song = songWithHarmony();
    expect(harmonyAt(song, 1, 0).key.tonic).toBe(0);
    expect(harmonyAt(song, 2, 0).key).toEqual({ tonic: 7, scaleId: 'mixolydian' });
    // Past the end, the last bar's harmony applies.
    expect(harmonyAt(song, 5, 0).key.tonic).toBe(7);
  });
});

describe('transposing', () => {
  it('moves keys and chords, wrapping around the octave', () => {
    const song = songWithHarmony();
    transposeHarmony(song, 5);
    expect(song.key.tonic).toBe(5);
    expect(song.timeline.bars[0]?.chords?.map(c => c.chord.root)).toEqual([2, 0]);
    expect(song.timeline.bars[2]?.key?.tonic).toBe(0);
    expect(song.timeline.bars[2]?.chords?.[0]?.chord).toEqual({ root: 5, quality: 'maj7', bass: 9 });
  });
});
