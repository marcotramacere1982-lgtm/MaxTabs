export function scheduleClick(context, when, accent, volume, register) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = [800,1100,1500][accent];
  oscillator.type = 'sine';
  const peak = Math.max(0.0001, volume * [0.3,0.55,0.8][accent]);
  gain.gain.setValueAtTime(0.0001,when);
  gain.gain.exponentialRampToValueAtTime(peak,when+0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001,when+0.045);
  oscillator.connect(gain); gain.connect(context.destination);
  register(oscillator,gain);
  oscillator.start(when); oscillator.stop(when+0.05);
}
