# Manual Test Checklist

## Fretboard
- [ ] Guitar standard tuning renders six strings.
- [ ] Bass standard tuning renders four strings.
- [ ] Clicking a fret selects the expected string and fret.
- [ ] Open-string clicks work correctly.
- [ ] Fret numbers display correctly on the tab.

## Tab
- [ ] Notes appear in the correct string row.
- [ ] Cursor advances after insertion.
- [ ] Delete removes the expected event.
- [ ] Undo restores the previous state.

## Tempo
- [ ] Four evenly spaced taps produce a sensible BPM.
- [ ] Irregular taps do not produce wild BPM changes.
- [ ] Changing BPM updates playback timing.

## Playback
- [ ] Play starts from the beginning.
- [ ] Stop halts all sound.
- [ ] Notes play at their intended positions.
- [ ] No sound continues after the sequence ends.