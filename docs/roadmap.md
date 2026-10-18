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

## Phase 1 — Core model (pure TS, no UI)
- [ ] Positions and durations in ticks (960 PPQ): dotted notes, tuplets, ties
- [ ] Unified timeline: free and imported charts share one bar + tempo-map structure
- [ ] Harmony track: optional key/chord per bar
- [ ] Command-based undo/redo
- [ ] Project format v2 with migration from v1

## Phase 2 — Instruments
- [ ] Data-driven registry: 6/7-string guitar, 4/5-string bass, alternate tunings
- [ ] Per-project tuning; confirm and remap notes on instrument change

## Phase 3 — UI
- [ ] SVG tab renderer
- [ ] Free cursor navigation and in-place editing
- [ ] Responsive, touch-friendly fretboard
- [ ] Overlay follows the harmony of the bar under the cursor

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
- [ ] More tunings and instruments; capo
- [ ] Standard notation
