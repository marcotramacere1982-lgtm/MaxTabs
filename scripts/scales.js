export const TONICS = [
  { pitchClass: 0, label: 'C' },
  { pitchClass: 1, label: 'C# / Db' },
  { pitchClass: 2, label: 'D' },
  { pitchClass: 3, label: 'D# / Eb' },
  { pitchClass: 4, label: 'E' },
  { pitchClass: 5, label: 'F' },
  { pitchClass: 6, label: 'F# / Gb' },
  { pitchClass: 7, label: 'G' },
  { pitchClass: 8, label: 'G# / Ab' },
  { pitchClass: 9, label: 'A' },
  { pitchClass: 10, label: 'A# / Bb' },
  { pitchClass: 11, label: 'B' }
];

export const SCALES = [
  {
    id: 'major',
    group: 'Major & Modes',
    name: 'Ionian / Major',
    intervals: [0, 2, 4, 5, 7, 9, 11],
    degrees: ['R', '2', '3', '4', '5', '6', '7']
  },
  {
    id: 'dorian',
    group: 'Major & Modes',
    name: 'Dorian',
    intervals: [0, 2, 3, 5, 7, 9, 10],
    degrees: ['R', '2', '♭3', '4', '5', '6', '♭7']
  },
  {
    id: 'phrygian',
    group: 'Major & Modes',
    name: 'Phrygian',
    intervals: [0, 1, 3, 5, 7, 8, 10],
    degrees: ['R', '♭2', '♭3', '4', '5', '♭6', '♭7']
  },
  {
    id: 'lydian',
    group: 'Major & Modes',
    name: 'Lydian',
    intervals: [0, 2, 4, 6, 7, 9, 11],
    degrees: ['R', '2', '3', '#4', '5', '6', '7']
  },
  {
    id: 'mixolydian',
    group: 'Major & Modes',
    name: 'Mixolydian',
    intervals: [0, 2, 4, 5, 7, 9, 10],
    degrees: ['R', '2', '3', '4', '5', '6', '♭7']
  },
  {
    id: 'aeolian',
    group: 'Major & Modes',
    name: 'Aeolian / Natural Minor',
    intervals: [0, 2, 3, 5, 7, 8, 10],
    degrees: ['R', '2', '♭3', '4', '5', '♭6', '♭7']
  },
  {
    id: 'locrian',
    group: 'Major & Modes',
    name: 'Locrian',
    intervals: [0, 1, 3, 5, 6, 8, 10],
    degrees: ['R', '♭2', '♭3', '4', '♭5', '♭6', '♭7']
  },
  {
    id: 'major-pentatonic',
    group: 'Pentatonic & Blues',
    name: 'Major Pentatonic',
    intervals: [0, 2, 4, 7, 9],
    degrees: ['R', '2', '3', '5', '6']
  },
  {
    id: 'minor-pentatonic',
    group: 'Pentatonic & Blues',
    name: 'Minor Pentatonic',
    intervals: [0, 3, 5, 7, 10],
    degrees: ['R', '♭3', '4', '5', '♭7']
  },
  {
    id: 'minor-blues',
    group: 'Pentatonic & Blues',
    name: 'Minor Blues',
    intervals: [0, 3, 5, 6, 7, 10],
    degrees: ['R', '♭3', '4', '♭5', '5', '♭7']
  },
  {
    id: 'whole-tone',
    group: 'Symmetric',
    name: 'Whole Tone',
    intervals: [0, 2, 4, 6, 8, 10],
    degrees: ['R', '2', '3', '#4', '#5', '♭7']
  },
  {
    id: 'diminished-half-whole',
    group: 'Symmetric',
    name: 'Diminished Half–Whole',
    intervals: [0, 1, 3, 4, 6, 7, 9, 10],
    degrees: ['R', '♭2', '♭3', '3', '♭5', '5', '6', '♭7']
  }
];

export function getScale(scaleId) {
  return SCALES.find((scale) => scale.id === scaleId);
}