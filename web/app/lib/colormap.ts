const HOT: [number, number, number][] = [
  [0.40, 0.02, 0.02],
  [0.55, 0.04, 0.02],
  [0.70, 0.08, 0.02],
  [0.82, 0.14, 0.02],
  [0.90, 0.22, 0.03],
  [0.95, 0.34, 0.04],
  [0.98, 0.48, 0.06],
  [1.00, 0.62, 0.10],
  [1.00, 0.74, 0.18],
  [1.00, 0.84, 0.30],
  [1.00, 0.92, 0.50],
  [1.00, 0.96, 0.70],
  [1.00, 0.98, 0.85],
  [1.00, 1.00, 0.95],
  [1.00, 1.00, 1.00],
];

export function fireColor(t: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  const idx = clamped * (HOT.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, HOT.length - 1);
  const frac = idx - lo;
  return [
    HOT[lo][0] + frac * (HOT[hi][0] - HOT[lo][0]),
    HOT[lo][1] + frac * (HOT[hi][1] - HOT[lo][1]),
    HOT[lo][2] + frac * (HOT[hi][2] - HOT[lo][2]),
  ];
}

export { fireColor as plasmaColor };

const BASE: [number, number, number] = [0.73, 0.69, 0.67];
const THRESHOLD = 0.50;

export function getBaseColor(): [number, number, number] {
  return BASE;
}

export function buildColorArray(
  values: number[],
  min: number,
  max: number,
): Float32Array {
  const colors = new Float32Array(values.length * 3);
  const range = max - min || 1;
  for (let i = 0; i < values.length; i++) {
    const t = (values[i] - min) / range;
    if (t < THRESHOLD) {
      colors[i * 3] = BASE[0];
      colors[i * 3 + 1] = BASE[1];
      colors[i * 3 + 2] = BASE[2];
    } else {
      const norm = (t - THRESHOLD) / (1 - THRESHOLD);
      const [r, g, b] = fireColor(norm);
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }
  }
  return colors;
}
