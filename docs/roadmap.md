# Roadmap

## Done in the alpha (tag `alpha-concept`)
- [x] Clickable fretboard (guitar standard, drop D, bass standard; 12–22 frets)
- [x] Scale/mode overlay with tonic and degree labels
- [x] Append-only note and rest entry, eighth to whole notes; undo last; clear
- [x] Bars, beats, cursor, bars-per-row density
- [x] Web Audio playback with look-ahead scheduler and accented metronome
- [x] metronomo-composto import (mixed meter, per-bar tempo, repeats)
- [x] Browser save/load and JSON export/import with validation

## Phase 0 — Vite + TypeScript scaffold
- [x] 1:1 port to strict TypeScript, Vite dev/build, Vitest tests

## Phase 1 — Core model
- [x] Positions and durations in ticks (960 PPQ): dotted notes, tuplets, ties (model)
- [x] Unified timeline: free and imported charts share one bar + tempo-map structure
- [x] Harmony track: song key, key changes and chord symbols per bar (model)
- [x] Undo/redo (snapshot-based, atomic, validated)
- [x] Project format v2 with migration from v1
- [x] UI rewired: 16th/32nd and dotted durations, redo, undoable import/reset/instrument change

## Phase 2 — Instruments
- [x] Registry: 6/7-string guitar, 4/5-string bass, 25 preset tunings
- [x] Per-project tuning, recognised by its notes ("Custom" when no preset matches)
- [x] Instrument/tuning change asks: keep pitches (re-finger) or keep fret numbers; undoable

## Phase 3 — UI
- [ ] Deep visual restyle of the whole app (requested 2026-10-19): design system first,
      then the components below built on it
- [ ] SVG tab renderer
- [ ] Free cursor navigation and in-place editing
- [ ] Responsive, touch-friendly fretboard
- [ ] Overlay follows the harmony of the bar under the cursor (model ready; needs bar key/chord editing UI)
- [ ] Tuplet and tie entry (model ready)

## Phase 4 — Audio
- [ ] Voice interface between scheduler and sound source
- [ ] Tick-based scheduler

## Phase 5 — Export
- [ ] Standard MIDI file with tempo map and time signatures
- [ ] PDF via print layout

## Later
- [ ] Chords and multi-note events
- [ ] Techniques (hammer-on, pull-off, slide, bend, vibrato, palm mute)
- [ ] Realistic guitar/bass sound
- [ ] Tap tempo
- [ ] Custom tuning editor (model already accepts any tuning)
- [ ] More instruments (8-string, 6-string bass, baritone); capo
- [ ] Standard notation
