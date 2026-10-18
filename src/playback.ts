import { timedBars, slotToSeconds, secondsToSlot, lastOf } from './timeline';
import { scheduleClick } from './metronome';
import type { Accent, AppState } from './types';

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export interface PlaybackOptions {
  onPositionChange?: (slot: number | null) => void;
  onComplete?: () => void;
}

type Job =
  | { kind: 'note'; time: number; midi: number; duration: number }
  | { kind: 'click'; time: number; accent: Accent };

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

export async function playSequence(state: AppState, bpm: number, options: PlaybackOptions = {}): Promise<boolean> {
  stopPlayback();
  const id = session;
  const ctx = await getContext();
  if (id !== session) return false;
  state.bpm = bpm;
  const bars = timedBars(state);
  const end = lastOf(bars).endSeconds;
  const start = ctx.currentTime + 0.08;
  const jobs: Job[] = [];
  for (const event of state.events) {
    if (event.type !== 'note') continue;
    const time = slotToSeconds(bars, event.startSlot);
    const duration = slotToSeconds(bars, event.startSlot + event.durationSlots) - time;
    for (const pitch of event.notes) jobs.push({ time, kind: 'note', midi: pitch.midi, duration });
  }
  if (state.metronomeEnabled) {
    for (const bar of bars) {
      for (let pulse = 0; pulse < bar.numerator; pulse++) {
        jobs.push({
          kind: 'click', time: bar.startSeconds + pulse * bar.pulseSlots * bar.secondsPerSlot,
          accent: bar.accents[pulse] ?? 0
        });
      }
    }
  }
  jobs.sort((a, b) => a.time - b.time);
  let next = 0;
  function schedule(): void {
    if (id !== session) return;
    const horizon = ctx.currentTime + 0.12;
    let job: Job | undefined;
    while ((job = jobs[next]) && start + job.time < horizon) {
      next++;
      const when = Math.max(ctx.currentTime, start + job.time);
      if (job.kind === 'note') note(ctx, job.midi, when, job.duration);
      else scheduleClick(ctx, when, job.accent, state.clickVolume, register);
    }
    if (ctx.currentTime >= start + end + 0.02) {
      stopPlayback(); options.onPositionChange?.(null); options.onComplete?.();
    }
  }
  let previous: number | null | undefined;
  function visuals(): void {
    if (id !== session) return;
    const elapsed = ctx.currentTime - start;
    const slot = elapsed < 0 ? null : secondsToSlot(bars, elapsed);
    if (slot !== previous) { previous = slot; options.onPositionChange?.(slot); }
    frame = requestAnimationFrame(visuals);
  }
  timer = setInterval(schedule, 25);
  schedule(); frame = requestAnimationFrame(visuals);
  return true;
}
