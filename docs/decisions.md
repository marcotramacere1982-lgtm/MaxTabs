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

## 2026-10-19 — Phase 1 model design
- **Song = timeline + tracks.** One shared timeline of bars (meter, accents, tempo
  changes, key changes, chord symbols) and a list of tracks whose bars line up with
  it index for index. Only track 1 is edited for now; the array keeps multi-track
  (e.g. guitar + bass for MIDI export) open without another format change.
- **Events fill bars in sequence.** Each track bar is a list of events (duration +
  notes; no notes = rest) laid end to end from the bar start. Positions are derived,
  not stored, which is how notation software models rhythm and keeps tuplets exact.
  Events never cross a bar line; ties carry a note across instead.
- **Ties** are a flag on a note meaning "continue the same string and fret from the
  event just before". Playback merges tied notes into one sound.
- **Pitch is derived, not stored.** Supersedes the 2026-10-13 decision: a note stores
  string and fret; MIDI pitch comes from the track's tuning. A tuning change can then
  never leave stale pitches behind.
- **Tempo, key and chord changes are sticky**: each applies until the next one.
  Tempo and key change at bar starts; chords can sit anywhere in a bar.
- **Free vs imported charts** are the same structure with an `extendable` flag:
  free timelines grow when you write past the end, imported ones are fixed.
- **Undo is snapshot-based.** Every edit runs on a deep copy and is validated before
  it is committed, so a failed edit changes nothing. Limit: 200 steps. Simple and
  safe at tab-sized documents; revisit only if songs get very large.
- **Known limit:** at 960 PPQ, septuplets of 16ths and 8ths are not whole ticks and
  are rejected. Raising PPQ to 6720 would allow them if ever needed.
- **Interim grid view:** until the SVG renderer (Phase 3), each tab row splits into
  columns as fine as its shortest note, so rows with 32nds get very wide.

## 2026-10-19 — Instruments and tunings (Phase 2)
- A track stores an instrument type (`guitar-6`, `guitar-7`, `bass-4`, `bass-5`) and
  its open-string pitches. Tuning names are not stored: a tuning is recognised by
  matching its pitches to a preset, otherwise it shows as "Custom". Older ids
  (`guitar-standard`, `guitar-drop-d`, `bass-standard`) are mapped on load.
- Changing instrument or tuning with notes present asks the user:
  **keep pitches** (re-finger: same string if reachable, else the free string whose
  fret is closest to the original) or **keep fret numbers**. Notes on strings the new
  instrument lacks are always placed by pitch. Notes with no position within 24 frets
  are removed and reported; ties that no longer join matching notes are removed.
  The change is one undo step.
- Phase 3 starts with a deep visual restyle (user request), not just new components.
