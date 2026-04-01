"use client";

import { useMemo } from "react";
import { computeSimplifiedActivationsSpatial } from "../lib/brain-regions";
import { plasmaColor } from "../lib/colormap";
import type { BrainMeshData } from "../lib/types";

interface RegionPanelProps {
  activations: number[] | null;
  meshData: BrainMeshData | null;
}

function intensityLabel(v: number): string {
  if (v > 0.7) return "High";
  if (v > 0.45) return "Medium";
  if (v > 0.25) return "Low";
  return "Minimal";
}

export default function RegionPanel({ activations, meshData }: RegionPanelProps) {
  const regions = useMemo(() => {
    if (!activations) return [];
    const rows = computeSimplifiedActivationsSpatial(
      activations,
      meshData?.vertices ?? [],
      meshData?.n_left ?? 0
    );
    const acts = rows.map((r) => r.activation);
    const lo = Math.min(...acts);
    const hi = Math.max(...acts);
    const span = hi - lo;
    return rows.map((r) => ({
      label: r.label,
      raw: r.activation,
      display: span < 1e-8 ? 0.5 : (r.activation - lo) / span,
    }));
  }, [activations, meshData]);

  if (!activations) {
    return (
      <div className="p-4 text-sm text-zinc-500">
        Upload media to see region breakdown
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-4 overflow-y-auto max-h-[340px]">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">
        Region Activation
      </h3>
      <p className="text-[10px] text-zinc-600 leading-snug mb-2">
        Bars compare regions for this frame (ranked). Dot color follows relative level.
      </p>
      {regions.map(({ label, raw, display }) => {
        const [r, g, b] = plasmaColor(display);
        const color = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
        return (
          <div key={label} className="flex items-center gap-3">
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-zinc-200 truncate">{label}</div>
              <div className="h-1.5 rounded-full bg-zinc-800 mt-1">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.round(display * 100)}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            </div>
            <span className="text-xs text-zinc-500 w-16 text-right shrink-0">
              {intensityLabel(raw)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
