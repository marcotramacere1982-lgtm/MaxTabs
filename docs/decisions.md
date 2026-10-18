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
## 2026-10-18 — Move to Vite + TypeScript
The model is about to grow (ticks, tuplets, ties, harmony track), so the alpha was
ported 1:1 to strict TypeScript (`noUncheckedIndexedAccess` on) with Vite and Vitest.
Supersedes "no build step". A single-file build can still be produced later with an
inlining plugin. The vanilla alpha is tagged `alpha-concept` in git.

## 2026-10-18 — Product scope agreed
- Instruments: 6- and 7-string guitar, 4- and 5-string bass. More later.
- Scale overlay guides only; it never restricts input. Changing the tonic transposes it.
- Bars will carry an optional key/chord (harmony track); the overlay follows the bar at the cursor.
- Rhythm: full resolution (down to 32nds, tuplets, dotted notes, ties) so MIDI export is exact.
- Outputs: PDF and MIDI.
- metronomo-composto stays a companion app; MaxTabs imports its charts.
- Desktop first; phone must remain usable.
- Chords and techniques come after the core model and UI.

## 2026-10-18 — Time resolution: 960 ticks per quarter note (planned, Phase 1)
Standard MIDI resolution. Divisible by 2, 3, 4, 5, 6, 8, so 32nds, triplets and
quintuplets are exact integers. Replaces eighth-note slots.

## 2026-10-18 — Custom SVG tab renderer (planned, Phase 3)
The tab is the primary editing surface, so the rendering is custom. SVG scales to
phone screens and prints cleanly to PDF. VexFlow stays an option for standard notation later.
