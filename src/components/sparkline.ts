/**
 * The points of a sparkline: values spread across `width`, the lowest at the bottom and the highest at the top (with `pad`
 * keeping the stroke inside the box). A flat series is drawn in the middle. Fewer than two values give nothing to draw.
 */
export function sparklinePoints(values: number[], width: number, height: number, pad = 2): [number, number][] {
  if (values.length < 2) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const inner = height - pad * 2;
  return values.map((v, i) => [
    (i / (values.length - 1)) * width,
    span === 0 ? height / 2 : pad + inner - ((v - min) / span) * inner,
  ]);
}

/** The `d` attribute of the sparkline's path. Empty when there is nothing to draw. */
export function sparklinePath(values: number[], width: number, height: number, pad = 2): string {
  return sparklinePoints(values, width, height, pad)
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ');
}
