export interface BrainRegion {
  label: string;
  activation: number;
}

const SPATIAL_LABELS = [
  "Secondary Visual",
  "Auditory Cortex",
  "Sensorimotor",
  "Temporo-Parietal",
  "Prefrontal Cortex",
] as const;

function meanPredForIndices(predictions: number[], indices: number[]): number {
  if (indices.length === 0) return 0;
  let s = 0;
  for (const i of indices) s += predictions[i] ?? 0;
  return s / indices.length;
}

/**
 * Split each hemisphere into 5 Y-coordinate quintiles (anterior-posterior proxy),
 * average predicted activity in each band, then merge L+R. Vertex Y in fsaverage
 * RAS roughly maps to posterior (low Y) -> anterior (high Y).
 */
export function computeSimplifiedActivationsSpatial(
  predictions: number[],
  vertices: number[],
  nLeft: number
): BrainRegion[] {
  const n = predictions.length;
  if (vertices.length < n * 3 || nLeft <= 0 || nLeft > n) {
    return fallbackUniform(predictions);
  }

  function quintileMeans(offset: number, count: number): number[] {
    const items: { y: number; vi: number }[] = [];
    for (let i = 0; i < count; i++) {
      const vi = offset + i;
      if (vi >= n) break;
      const y = vertices[vi * 3 + 1] ?? 0;
      items.push({ y, vi });
    }
    items.sort((a, b) => a.y - b.y);
    const qMeans: number[] = [];
    const q = 5;
    const chunk = Math.max(1, Math.ceil(items.length / q));
    for (let qi = 0; qi < q; qi++) {
      const start = qi * chunk;
      const slice = items.slice(start, start + chunk);
      const idx = slice.map((x) => x.vi);
      qMeans.push(meanPredForIndices(predictions, idx));
    }
    return qMeans;
  }

  const leftQ = quintileMeans(0, nLeft);
  const rightQ = quintileMeans(nLeft, n - nLeft);

  const out: BrainRegion[] = [];
  for (let i = 0; i < 5; i++) {
    out.push({
      label: SPATIAL_LABELS[i]!,
      activation: (leftQ[i]! + rightQ[i]!) / 2,
    });
  }
  return out.sort((a, b) => b.activation - a.activation);
}

function fallbackUniform(predictions: number[]): BrainRegion[] {
  const mean = predictions.reduce((a, b) => a + b, 0) / (predictions.length || 1);
  return SPATIAL_LABELS.map((label) => ({ label, activation: mean }));
}
