# Manual Test Checklist

Browser behaviour that unit tests cannot cover. Run with `npm run dev`.

## Look and theme
- [ ] Menu → View → Theme: Auto follows the system; Light and Dark override it and survive a reload.
- [ ] No flash of the wrong theme on load.

## Fretboard
- [ ] Guitar renders six strings, bass four; the top guitar string is labelled "e"; low strings look wound.
- [ ] Clicking a string between two frets plucks it (string vibrates, sound plays) and inserts the note.
- [ ] Clicking left of the nut inserts an open string.
- [ ] During playback the sounding positions light up and strings vibrate as notes start.
- [ ] Scale overlay: degrees and roots move when tonic or scale change.

## Tab entry
- [ ] Every duration (whole to 32nd, dotted) inserts at the right position.
- [ ] A duration longer than the room left in the bar is refused with a message.
- [ ] Writing past the last bar of a free chart adds a bar.
- [ ] At the end of an imported chart, insertion is refused.

## Tab editing
- [ ] Clicking a note in the tab puts the cursor on it; clicking free space after the notes puts it there.
- [ ] ←/→ step through notes and rests across bar lines.
- [ ] With the cursor on a note, clicking a string replaces it (same duration) and moves on.
- [ ] Shift+click adds chord notes to the event under the cursor, or to the one just entered.
- [ ] Delete removes the note under the cursor; Backspace removes the one before; Insert adds a rest.
- [ ] A duration chip changes the note under the cursor when the bar has room.
- [ ] Rhythm: eighths and shorter are beamed per beat; rests and dots are drawn; rows wrap with the window.

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
