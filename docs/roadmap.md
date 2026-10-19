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
- [x] Deep visual restyle (3a): "Soft + Wood" design system, light/dark/system theme, new layout
- [x] Realistic SVG fretboard: click strings directly, pluck animation, playback highlights (3a)
- [x] Plucked-string voice for previews and playback (stand-in until Phase 4 samples)
- [x] SVG tab renderer (3b): duration-based spacing, line breaking, stems/beams/flags, rests,
      dots, time signatures, chord symbols, ties, cursor and playhead
- [x] Cursor navigation (click, ←/→) and in-place editing: overwrite, Shift+click chords,
      Delete/Backspace, Insert, duration change on the event under the cursor
- [x] Phone layout (3c): transport docked at the bottom, on-screen cursor and delete buttons
- [ ] Fretboard on phones still scrolls sideways; consider a position window or vertical board
- [x] Harmony panel (3c): key at the cursor, key changes per bar, chord symbols at the cursor
- [x] Overlay follows the harmony under the cursor: scale degrees, chord tones, or both
- [x] Triplet and dotted toggles for any note value; Tie (toggle, or hold the last note)

## Phase 4 — Audio
- [ ] Voice interface between scheduler and sound source
- [ ] Tick-based scheduler

## Phase 5 — Export
- [ ] Standard MIDI file with tempo map and time signatures
- [ ] PDF via print layout

## Chords and techniques (pulled forward, 2026-10-19)
- [x] Chord mode: build a chord in place on any strings; click a note again to remove it
- [x] Muted notes ("x"): toggle, or click a string's name on the fretboard
- [x] Let ring: notes sound until their string is played again; shown as dashed lines in the tab
- [ ] Chord shape library / voicing finder for the chord at the cursor

## Later
- [ ] Techniques (hammer-on, pull-off, slide, bend, vibrato, palm mute)
- [ ] Realistic guitar/bass sound
- [ ] Tap tempo
- [ ] Custom tuning editor (model already accepts any tuning)
- [ ] More instruments (8-string, 6-string bass, baritone); capo
- [ ] Standard notation
