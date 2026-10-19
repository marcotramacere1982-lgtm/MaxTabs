// Plucked-string voice (Karplus–Strong). A stand-in until sampled instruments (Phase 4):
// a short noise burst circulates through a delay line one period long, losing high
// frequencies each pass, which decays like a plucked string.

const RING_SECONDS = 2.2;
const buffers = new Map<string, AudioBuffer>();

function pluckBuffer(context: BaseAudioContext, midi: number): AudioBuffer {
  const cacheKey = `${context.sampleRate}:${midi}`;
  const cached = buffers.get(cacheKey);
  if (cached) return cached;

  const frequency = 440 * 2 ** ((midi - 69) / 12);
  const rate = context.sampleRate;
  const length = Math.floor(rate * RING_SECONDS);
  const buffer = context.createBuffer(1, length, rate);
  const out = buffer.getChannelData(0);
  const period = Math.max(2, Math.round(rate / frequency));
  const ring = new Float32Array(period);
  for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;
  // Low strings ring longer, as on a real instrument.
  const decay = midi < 40 ? 0.998 : midi < 55 ? 0.997 : 0.996;
  for (let i = 0, k = 0; i < length; i++) {
    const next = (k + 1) % period;
    const value = ring[k] ?? 0;
    ring[k] = decay * 0.5 * (value + (ring[next] ?? 0));
    out[i] = value;
    k = next;
  }
  buffers.set(cacheKey, buffer);
  return buffer;
}

export interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export interface PluckOptions {
  level?: number;
  /** Hammer-on, pull-off or slide arrival: softer and darker than a picked note. */
  legato?: boolean;
  /** Bend up by this many semitones early in the note, optionally releasing near its end. */
  bend?: { semitones: number; release?: boolean };
  vibrato?: boolean;
  /** Glide this many semitones over the end of the note (a slide into the next one). */
  slideTo?: number;
}

const rate = (semitones: number): number => 2 ** (semitones / 12);

/** Schedule one plucked note. It rings for `duration` seconds, then is damped quickly. */
export function playPluck(context: AudioContext, midi: number, when: number, duration: number,
  options: PluckOptions = {}): Voice {
  const level = (options.level ?? 0.32) * (options.legato ? 0.6 : 1);
  const source = context.createBufferSource();
  const tone = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = pluckBuffer(context, midi);
  tone.type = 'lowpass';
  tone.frequency.value = options.legato ? 2400 : 4200;
  const ring = Math.min(duration, RING_SECONDS - 0.2);

  // Pitch: bends and slides change the playback rate of the plucked-string buffer.
  const pitch = source.playbackRate;
  pitch.setValueAtTime(1, when);
  if (options.bend) {
    const up = Math.min(0.12, ring * 0.3);
    pitch.linearRampToValueAtTime(rate(options.bend.semitones), when + up);
    if (options.bend.release && ring > up * 2) {
      pitch.setValueAtTime(rate(options.bend.semitones), when + ring * 0.6);
      pitch.linearRampToValueAtTime(1, when + ring * 0.9);
    }
  }
  if (options.slideTo) {
    const glide = Math.min(0.15, ring * 0.4);
    pitch.setValueAtTime(options.bend ? rate(options.bend.semitones) : 1, when + ring - glide);
    pitch.linearRampToValueAtTime(rate(options.slideTo), when + ring);
  }
  if (options.vibrato && ring > 0.2) {
    // A slow wobble of about a quarter of a semitone, starting after the attack.
    const lfo = context.createOscillator();
    const depth = context.createGain();
    lfo.frequency.value = 5.5;
    depth.gain.setValueAtTime(0, when);
    depth.gain.linearRampToValueAtTime(0.015, when + Math.min(0.25, ring * 0.3));
    lfo.connect(depth).connect(pitch);
    lfo.start(when);
    lfo.stop(when + ring + 0.3);
  }

  gain.gain.setValueAtTime(level, when);
  // Damping, like lifting the fretting finger.
  gain.gain.setTargetAtTime(0.0001, when + ring, 0.04);
  source.connect(tone).connect(gain).connect(context.destination);
  source.start(when);
  source.stop(when + ring + 0.3);
  source.addEventListener('ended', () => {
    source.disconnect(); tone.disconnect(); gain.disconnect();
  }, { once: true });
  return { source, gain };
}
