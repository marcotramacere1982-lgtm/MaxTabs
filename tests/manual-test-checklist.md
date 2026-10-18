# Manual Test Checklist

Browser behaviour that unit tests cannot cover. Run with `npm run dev`.

## Fretboard
- [ ] Guitar renders six strings, bass four; the top guitar string is labelled "e".
- [ ] Clicking a fret previews the note and inserts it at the cursor.
- [ ] Scale overlay: degrees and roots move when tonic or scale change.

## Tab entry
- [ ] Every duration (whole to 32nd, dotted) inserts at the right position.
- [ ] A duration longer than the room left in the bar is refused with a message.
- [ ] Writing past the last bar of a free chart adds a bar.
- [ ] At the end of an imported chart, insertion is refused.

## Undo / redo
- [ ] Undo/Redo buttons and Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z work; Ctrl+Z in the title field edits text.
- [ ] Instrument change with a different string count clears notes; Undo brings them back.
- [ ] Rhythm import and "New free 4/4" can be undone.

## Playback
- [ ] Play/Stop; the playhead and fretboard highlight follow the music.
- [ ] Imported tests/fixtures/metronomo-test.json: 5 quarter, 7 eighth, 2 eighth clicks (4.75 s).
- [ ] Rapid Play/Stop never leaves sound running.

## Files
- [ ] Save in browser, reload page, Load: same song; undo history is empty.
- [ ] Export, then Open the exported file: same song.
- [ ] A save from the alpha (format v1) loads and is upgraded.
- [ ] Check on a physical phone.
