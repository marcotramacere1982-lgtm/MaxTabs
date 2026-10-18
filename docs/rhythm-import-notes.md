# Rhythm import and metronome (alpha notes)

Notes from the increment that added metronomo-composto import. Still accurate for the current slot-based model.

## Features
- Import metronomo-composto version 1 JSON as an empty chart.
- Mixed meter, quarter/denominator tempo semantics, per-bar tempo and expanded repetitions.
- Optional accented metronome and volume control, including playback of empty charts.
- Rolling audio scheduler; visual updates change existing cells rather than rebuilding DOM.
- Existing guitar/bass, scales, note previews, duration entry and density controls preserved.
- Clear removes notes but retains the imported chart. New free 4/4 resets chart and notes.
- Imported chart is finite; no automatic extra bars. At its end, undo or clear to continue.
- Import/reset replacement prompts explain that the change cannot be undone.

## Deliberate limits
This increment RETAINS eighth-note slots in the note model. Explicit bars and tempo mapping
are implemented, but migration to ticks is deferred rather than partially mixed into the code.
Supported denominators: 1, 2, 4, 8. Other denominators are rejected before mutation.
Maximum 64 source bars / 256 expanded bars; 1 MB import size.
No crossing bar lines for newly inserted notes or rests: select a shorter duration.
No loop, count-in, append, save/load or tempo-map editing yet. Imported tempo maps lock BPM.
Tap Tempo remains disabled because it is not implemented.
Preview audio does not change the sequence's rhythmic timing.
In free mode playback finishes the last musical bar, not decorative padding bars.
Imported chart playback includes all imported bars, including empty trailing bars.

## Verification
Unit tests (`tests/unit/rhythm.test.ts`) cover the sample, timing boundaries, denominator-unit conversion,
per-bar tempo, repeats, invalid imports, note boundaries and ordinary 4/4.
Browser audio, mobile operation and visual behaviour require manual testing.

## Manual acceptance
1. Run `npm run dev`: verify scales, bass and fret previews still work.
2. Import tests/fixtures/metronomo-test.json: see exactly 5/4, 7/8, 2/8.
3. Play empty chart with metronome: 5 quarter pulses, 7 eighth pulses, 2 eighth pulses.
   Musical duration is 4.75 seconds plus the 80 ms startup lead-in.
4. Set click volume low, then mute metronome and verify tab notes still play.
5. Fill first 5/4 bar with ten eighths; cursor enters bar 2 at its first eighth pulse.
6. Try a quarter note at the last eighth of a bar: insertion must fail without truncation.
7. Stop mid-play: audio and yellow highlights stop; blue insertion cursor returns.
8. Clear: notes disappear, imported meter stays. Reset: return to free 4/4 after confirmation.
9. Import invalid JSON: existing chart/notes remain unchanged and an error is shown.
10. Rapid Play/Stop: cancelled AudioContext startup must not restart audio.
11. Check on a physical phone; background-tab scheduling can be throttled by the browser.
