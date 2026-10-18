import type { Accent } from '../model/song';

export type RegisterVoice = (source: AudioScheduledSourceNode, gain: GainNode) => void;

const CLICK_FREQUENCIES = [800, 1100, 1500] as const;
const CLICK_LEVELS = [0.3, 0.55, 0.8] as const;

export function scheduleClick(
  context: AudioContext,
  when: number,
  accent: Accent,
  volume: number,
  register: RegisterVoice
): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = CLICK_FREQUENCIES[accent];
  oscillator.type = 'sine';
  const peak = Math.max(0.0001, volume * CLICK_LEVELS[accent]);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(peak, when + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
  oscillator.connect(gain); gain.connect(context.destination);
  register(oscillator, gain);
  oscillator.start(when); oscillator.stop(when + 0.05);
}
