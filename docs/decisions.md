# Decisions

## 2026-10-13 — Start with separate source files
Develop with separate HTML, CSS, JS, JSON, docs, and test folders.
This improves maintainability. A single-file build can be added later.

## 2026-10-13 — Store MIDI pitch alongside string/fret
String and fret describe performance; MIDI pitch supports playback,
transposition, chord logic, and future standard notation.

## 2026-10-13 — Defer standard notation
Build a custom tab renderer first. Add abcjs or VexFlow only after
the sequence model and editing workflow are stable.