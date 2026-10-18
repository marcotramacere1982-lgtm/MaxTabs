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

/** Schedule one plucked note. It rings for `duration` seconds, then is damped quickly. */
export function playPluck(context: AudioContext, midi: number, when: number, duration: number,
  level = 0.32): Voice {
  const source = context.createBufferSource();
  const tone = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = pluckBuffer(context, midi);
  tone.type = 'lowpass';
  tone.frequency.value = 4200;
  const ring = Math.min(duration, RING_SECONDS - 0.2);
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
