import { timedBars, slotToSeconds, secondsToSlot } from './timeline.js';
import { scheduleClick } from './metronome.js';

let context;
let session = 0;
let timer = null;
let frame = null;
const voices = new Set();

async function getContext() {
  if (!context) {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error('Web Audio is not supported by this browser.');
    context = new Audio();
  }
  if (context.state === 'suspended') await context.resume();
  return context;
}

function register(oscillator,gain) {
  voices.add(oscillator);
  oscillator.addEventListener('ended', () => {
    voices.delete(oscillator); oscillator.disconnect(); gain.disconnect();
  },{once:true});
}

function note(midi,when,duration) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'triangle';
  oscillator.frequency.value = 440 * 2 ** ((midi-69)/12);
  gain.gain.setValueAtTime(0.0001,when);
  gain.gain.exponentialRampToValueAtTime(0.14,when+Math.min(0.01,duration/4));
  gain.gain.exponentialRampToValueAtTime(0.0001,when+duration);
  oscillator.connect(gain); gain.connect(context.destination);
  register(oscillator,gain);
  oscillator.start(when); oscillator.stop(when+duration+0.01);
}

export async function playPreviewNote(midi) {
  await getContext();
  note(midi,context.currentTime+0.01,0.35);
}

export function stopPlayback() {
  session++;
  if (timer !== null) clearInterval(timer);
  if (frame !== null) cancelAnimationFrame(frame);
  timer = frame = null;
  for (const oscillator of voices) {
    try { oscillator.stop(); } catch { /* Already ended. */ }
  }
  voices.clear();
}

export async function playSequence(state,bpm,options={}) {
  stopPlayback();
  const id = session;
  await getContext();
  if (id !== session) return false;
  state.bpm = bpm;
  const bars = timedBars(state);
  const end = bars[bars.length-1].endSeconds;
  const start = context.currentTime+0.08;
  const jobs = [];
  for (const event of state.events) {
    if (event.type !== 'note') continue;
    const time = slotToSeconds(bars,event.startSlot);
    const duration = slotToSeconds(bars,event.startSlot+event.durationSlots)-time;
    for (const pitch of event.notes) jobs.push({time,kind:'note',midi:pitch.midi,duration});
  }
  if (state.metronomeEnabled) {
    for (const bar of bars) {
      for (let pulse=0; pulse<bar.numerator; pulse++) {
        jobs.push({kind:'click',time:bar.startSeconds+pulse*bar.pulseSlots*bar.secondsPerSlot,
          accent:bar.accents[pulse]});
      }
    }
  }
  jobs.sort((a,b)=>a.time-b.time);
  let next = 0;
  function schedule() {
    if (id !== session) return;
    const horizon = context.currentTime+0.12;
    while (next<jobs.length && start+jobs[next].time<horizon) {
      const job = jobs[next++];
      const when = Math.max(context.currentTime,start+job.time);
      if (job.kind === 'note') note(job.midi,when,job.duration);
      else scheduleClick(context,when,job.accent,state.clickVolume,register);
    }
    if (context.currentTime >= start+end+0.02) {
      stopPlayback(); options.onPositionChange?.(null); options.onComplete?.();
    }
  }
  let previous;
  function visuals() {
    if (id !== session) return;
    const elapsed = context.currentTime-start;
    const slot = elapsed<0 ? null : secondsToSlot(bars,elapsed);
    if (slot !== previous) { previous=slot; options.onPositionChange?.(slot); }
    frame = requestAnimationFrame(visuals);
  }
  timer = setInterval(schedule,25);
  schedule(); frame = requestAnimationFrame(visuals);
  return true;
}
