import { buildSchedule, type ScheduledNote, type ScheduledSound } from '../model/schedule';
import { secondsToTick } from '../model/timeline';
import type { Song } from '../model/song';
import { scheduleClick } from './metronome';
import { playPluck } from './pluck';

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export interface PlaybackOptions {
  metronome: boolean;
  clickVolume: number;
  /** Absolute tick of the playhead, or null when it leaves the song. */
  onPositionChange?: (tick: number | null) => void;
  onComplete?: () => void;
}

let context: AudioContext | undefined;
let session = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let frame: number | null = null;
const voices = new Set<AudioScheduledSourceNode>();

async function getContext(): Promise<AudioContext> {
  if (!context) {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error('Web Audio is not supported by this browser.');
    context = new Audio();
  }
  if (context.state === 'suspended') await context.resume();
  return context;
}

function register(source: AudioScheduledSourceNode, gain: GainNode): void {
  voices.add(source);
  source.addEventListener('ended', () => {
    voices.delete(source); source.disconnect(); gain.disconnect();
  }, { once: true });
}

function note(ctx: AudioContext, sound: ScheduledNote, when: number): void {
  const { source, gain } = playPluck(ctx, sound.midi, when, sound.duration, {
    legato: sound.legato,
    bend: sound.bend,
    vibrato: sound.vibrato,
    slideTo: sound.slideTo
  });
  register(source, gain);
}

export async function playPreviewNote(midi: number, dead = false): Promise<void> {
  const ctx = await getContext();
  // Previews ring freely; they are not tracked, so Stop does not cut a note you just clicked.
  playPluck(ctx, midi, ctx.currentTime + 0.01, dead ? 0.05 : 1.6);
}

export function stopPlayback(): void {
  session++;
  if (timer !== null) clearInterval(timer);
  if (frame !== null) cancelAnimationFrame(frame);
  timer = frame = null;
  for (const source of voices) {
    try { source.stop(); } catch { /* Already ended. */ }
  }
  voices.clear();
}

export async function playSong(song: Song, options: PlaybackOptions): Promise<boolean> {
  stopPlayback();
  const id = session;
  const ctx = await getContext();
  if (id !== session) return false;
  const { layout, sounds, endSeconds } = buildSchedule(song, { metronome: options.metronome });
  const start = ctx.currentTime + 0.08;
  let next = 0;
  function schedule(): void {
    if (id !== session) return;
    const horizon = ctx.currentTime + 0.12;
    let sound: ScheduledSound | undefined;
    while ((sound = sounds[next]) && start + sound.time < horizon) {
      next++;
      const when = Math.max(ctx.currentTime, start + sound.time);
      if (sound.kind === 'note') note(ctx, sound, when);
      else scheduleClick(ctx, when, sound.accent, options.clickVolume, register);
    }
    if (ctx.currentTime >= start + endSeconds + 0.02) {
      stopPlayback(); options.onPositionChange?.(null); options.onComplete?.();
    }
  }
  let previous: number | null | undefined;
  function visuals(): void {
    if (id !== session) return;
    const elapsed = ctx.currentTime - start;
    const tick = elapsed < 0 ? null : secondsToTick(layout, elapsed);
    if (tick !== previous) { previous = tick; options.onPositionChange?.(tick); }
    frame = requestAnimationFrame(visuals);
  }
  timer = setInterval(schedule, 25);
  schedule(); frame = requestAnimationFrame(visuals);
  return true;
}
