# Guitar/Bass Tab Builder

## Goal
Build a self-contained browser app for creating guitar and bass tabs,
with later support for standard music notation.

## Core features
- Clickable fretboard for guitar and bass
- Tab sequence editor
- Tap tempo
- Chord dictionary
- Manual technique annotations
- MIDI-style playback
- Future: standard notation via abcjs or VexFlow

## Architecture principles
- Store notes with string, fret, MIDI pitch, start time, and duration
- Treat tab, staff notation, and playback as views/outputs of one sequence model
- TypeScript (strict) with Vite; pure model modules have no DOM access and are unit-tested
- Use Web Audio or Tone.js for playback
- Use localStorage for early persistence
- Add notation only after the core sequence model is stable


# Architecture

## Core principle
The app should have one internal sequence model, with tab, notation,
and playback treated as separate views or outputs.

## Data model
Each musical event should contain:

```json
{
  "id": "event-1",
  "startBeat": 0,
  "durationBeats": 1,
  "notes": [
    {
      "string": 6,
      "fret": 3,
      "midi": 43
    }
  ],
  "techniques": [],
  "label": "G"
}
```

## Modules (src/)
- `types.ts`: shared model types
- `state.ts`: application state, instruments and event editing
- `timeline.ts`: bars, slot/seconds conversion
- `scales.ts`: scale and mode definitions
- `fretboard.ts`: clickable fretboard and scale overlay
- `tabEditor.ts`: tab rendering
- `playback.ts` / `metronome.ts`: Web Audio scheduling and synthesis
- `projectFiles.ts`: browser save/load, JSON export/import and validation
- `importers/metronomoComposto.ts`: rhythm chart import
- `menu.ts`, `dom.ts`, `errors.ts`, `main.ts`: UI wiring

## Development order
1. Fretboard and note insertion
2. Tab rendering
3. Bars, beats, rests, and cursor movement
4. Tap tempo
5. Basic playback
6. Chords
7. Techniques
8. Save/load and export