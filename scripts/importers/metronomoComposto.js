export function importMetronomo(data) {
  if (!data || data.app !== 'metronomo-composto' || data.version !== 1)
    throw new Error('Expected a metronomo-composto version 1 file.');
  if (!Array.isArray(data.bars) || !data.bars.length || data.bars.length > 64)
    throw new Error('The file must contain 1–64 source bars.');
  if (typeof data.perBar !== 'boolean' || !['quarter','denom'].includes(data.unit))
    throw new Error('Invalid tempo mode.');
  function tempo(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 20 || value > 400)
      throw new Error('Tempo must be a number between 20 and 400.');
    return value;
  }
  tempo(data.bpm);
  let startSlot = 0;
  const bars = [];
  data.bars.forEach((b, sourceIndex) => {
    if (!b || !Number.isInteger(b.num) || b.num < 1 || b.num > 32 || ![1,2,4,8].includes(b.den))
      throw new Error('This first version supports denominators 1, 2, 4 and 8 only.');
    if (!Number.isInteger(b.rep) || b.rep < 1 || b.rep > 99)
      throw new Error('Invalid repeat count.');
    if (!Array.isArray(b.acc) || b.acc.length !== b.num || !b.acc.every(a => [0,1,2].includes(a)))
      throw new Error('Each pulse needs an accent value of 0, 1 or 2.');
    if (b.bpm != null) tempo(b.bpm);
    const effective = data.perBar && b.bpm != null ? b.bpm : data.bpm;
    const quarterBpm = data.unit === 'quarter' ? effective : effective * 4 / b.den;
    for (let repetition = 0; repetition < b.rep; repetition++) {
      if (bars.length >= 256) throw new Error('Maximum 256 expanded bars in this version.');
      const pulseSlots = 8 / b.den;
      const lengthSlots = b.num * pulseSlots;
      bars.push({numerator:b.num, denominator:b.den, startSlot, lengthSlots,
        pulseSlots, quarterBpm, accents:[...b.acc], sourceIndex, repetition,
        tempoValue:effective, tempoUnit:data.unit});
      startSlot += lengthSlots;
    }
  });
  return {name: typeof data.name === 'string' ? data.name.slice(0,120) : 'Imported rhythm',
    bars, source:{app:data.app, version:data.version, unit:data.unit, perBar:data.perBar}};
}
