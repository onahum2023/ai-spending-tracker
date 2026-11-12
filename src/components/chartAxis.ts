/**
 * A y-axis that ends just above the tallest bar: the step (1, 2, 2.5 or 5 times a power of ten) that gives the lowest top with
 * at most seven gridlines, and a little room above the tallest bar for the "at least" label. A €420 peak gets €500, not €600.
 */
export function niceAxis(maxEuros: number): { max: number; ticks: number[] } {
  if (!(maxEuros > 0)) return { max: 100, ticks: [0, 50, 100] };
  const pow = 10 ** Math.floor(Math.log10(maxEuros / 7));
  let best = { step: 0, max: Infinity };
  for (const m of [1, 2, 2.5, 5, 10, 20]) {
    const step = m * pow;
    if (maxEuros / step > 7) continue;
    let top = Math.ceil(maxEuros / step - 1e-9) * step;
    if (top - maxEuros < step * 0.12) top += step;
    if (top < best.max - 1e-9 || (Math.abs(top - best.max) < 1e-9 && step > best.step)) best = { step, max: top };
  }
  const ticks: number[] = [];
  for (let v = 0; v <= best.max + best.step / 1000; v += best.step) ticks.push(Math.round(v * 100) / 100);
  return { max: ticks[ticks.length - 1], ticks };
}
