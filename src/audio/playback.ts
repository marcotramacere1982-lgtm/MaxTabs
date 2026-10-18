import { buildSchedule, type ScheduledSound } from '../model/schedule';
import { secondsToTick } from '../model/timeline';
import type { Song } from '../model/song';
import { scheduleClick } from './metronome';

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
const voices = new Set<OscillatorNode>();

async function getContext(): Promise<AudioContext> {
  if (!context) {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error('Web Audio is not supported by this browser.');
    context = new Audio();
  }
  if (context.state === 'suspended') await context.resume();
  return context;
}

function register(oscillator: OscillatorNode, gain: GainNode): void {
  voices.add(oscillator);
  oscillator.addEventListener('ended', () => {
    voices.delete(oscillator); oscillator.disconnect(); gain.disconnect();
  }, { once: true });
}

function note(ctx: AudioContext, midi: number, when: number, duration: number): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'triangle';
  oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(0.14, when + Math.min(0.01, duration / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  oscillator.connect(gain); gain.connect(ctx.destination);
  register(oscillator, gain);
  oscillator.start(when); oscillator.stop(when + duration + 0.01);
}

export async function playPreviewNote(midi: number): Promise<void> {
  const ctx = await getContext();
  note(ctx, midi, ctx.currentTime + 0.01, 0.35);
}

export function stopPlayback(): void {
  session++;
  if (timer !== null) clearInterval(timer);
  if (frame !== null) cancelAnimationFrame(frame);
  timer = frame = null;
  for (const oscillator of voices) {
    try { oscillator.stop(); } catch { /* Already ended. */ }
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
      if (sound.kind === 'note') note(ctx, sound.midi, when, sound.duration);
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
