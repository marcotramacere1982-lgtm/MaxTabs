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

## Data model (src/model/song.ts)

```
Song
├─ tempo: TempoMark            opening tempo (bpm, beat unit, dotted)
├─ key: Key                    opening key (tonic pitch class, scale id)
├─ timeline
│  ├─ extendable               free charts grow; imported charts are fixed
│  └─ bars[]: BarDef           time signature, accents, and optional tempo/key/chord changes
└─ tracks[]
   ├─ instrumentId, tuning[]   open-string MIDI pitches, lowest first
   └─ bars[] (one per timeline bar)
      └─ events[]: { duration, notes[] }   no notes = rest
                    note = { string, fret, tie? }
```

Time is measured in ticks, 960 per quarter note. Event positions are derived by summing
durations within a bar. The editor document is `{ song, cursor }`; the cursor is an
insertion point `{ bar, index }`.

## Layers
- `src/model/` — pure TypeScript, no DOM. Unit-tested.
  - `time.ts` ticks and durations; `timeline.ts` bar layout and tick/second conversion
  - `song.ts` document types; `editing.ts` commands; `history.ts` undo/redo
  - `harmony.ts` chords, keys, transposition; `scales.ts`; `pitch.ts`; `instruments.ts`
  - `schedule.ts` song → timed notes and clicks; `validate.ts` structural checks
- `src/io/` — project format v2 (`projectFormat.ts`), v1 migration (`projectV1.ts`),
  metronomo-composto import.
- `src/ui/` — DOM rendering and controls; `src/audio/` — Web Audio playback.
- `src/main.ts` — wires UI events to model commands through `History`.

## Development order
1. Fretboard and note insertion
2. Tab rendering
3. Bars, beats, rests, and cursor movement
4. Tap tempo
5. Basic playback
6. Chords
7. Techniques
8. Save/load and export