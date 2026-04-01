#!/usr/bin/env python3
"""
Compare TRIBE v2 predictions: Neuroscope-style (explicit GPU) vs demo-style (device=auto).

The FastAPI server deletes uploads after analysis, so pass a video path that still exists
(e.g. a copy under /tmp/neuroscope_uploads/).

Usage (on GPU VM, venv activated):
  python scripts/compare_tribe_inference.py /path/to/video.mp4
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import numpy as np
import torch


def load_predict(video_path: str, device: str, cache_folder: Path) -> np.ndarray:
    from tribev2.demo_utils import TribeModel

    model = TribeModel.from_pretrained(
        "facebook/tribev2",
        cache_folder=str(cache_folder),
        device=device,
    )
    events = model.get_events_dataframe(video_path=str(video_path))
    preds, _segments = model.predict(events=events, verbose=False)
    del model
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    return np.asarray(preds, dtype=np.float64)


def norm_like_api(preds: np.ndarray) -> np.ndarray:
    vmin, vmax = float(preds.min()), float(preds.max())
    rng = vmax - vmin if vmax - vmin > 1e-9 else 1.0
    return (preds - vmin) / rng


def stats(name: str, a: np.ndarray) -> None:
    print(f"\n{name}")
    print(f"  shape: {a.shape}")
    print(f"  min/max: {a.min():.6f} / {a.max():.6f}")
    print(f"  mean/std: {a.mean():.6f} / {a.std():.6f}")


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__.strip())
        return 2

    video = Path(sys.argv[1]).resolve()
    if not video.is_file():
        print(f"Video not found: {video}")
        return 2

    cache = Path(os.environ.get("TRIBE_CACHE", "/home/ubuntu/neuroscope/cache")).resolve()
    cache.mkdir(parents=True, exist_ok=True)

    print(f"Video: {video} ({video.stat().st_size // 1024} KB)")
    print(f"Cache: {cache}")
    print(f"CUDA available: {torch.cuda.is_available()}  count: {torch.cuda.device_count()}")

    # Match test_demo / Colab: device resolves to first CUDA or CPU
    print("\n=== Run A: device=auto (GitHub notebook / test_demo style) ===")
    preds_auto = load_predict(str(video), device="auto", cache_folder=cache)
    stats("raw A", preds_auto)

    # Match Neuroscope api/server.py when two GPUs exist
    dev_server = "cuda:1" if torch.cuda.is_available() and torch.cuda.device_count() > 1 else (
        "cuda" if torch.cuda.is_available() else "cpu"
    )
    print(f"\n=== Run B: device={dev_server!r} (Neuroscope server style) ===")
    preds_srv = load_predict(str(video), device=dev_server, cache_folder=cache)
    stats("raw B", preds_srv)

    diff = np.abs(preds_auto - preds_srv)
    print("\n=== Raw A vs B ===")
    print(f"  max abs diff: {diff.max():.6e}")
    print(f"  mean abs diff: {diff.mean():.6e}")
    rel = diff / (np.abs(preds_auto) + 1e-12)
    print(f"  max rel diff (vs |A|): {rel.max():.6e}")

    na = norm_like_api(preds_auto)
    nb = norm_like_api(preds_srv)
    d2 = np.abs(na - nb)
    print("\n=== Per-run min-max normalized (like API, but separate per run) ===")
    print(f"  max abs diff: {d2.max():.6e}")

    out_dir = Path(os.environ.get("COMPARE_OUT", "/tmp/tribe_compare"))
    out_dir.mkdir(parents=True, exist_ok=True)
    np.save(out_dir / "preds_auto.npy", preds_auto)
    np.save(out_dir / "preds_server_device.npy", preds_srv)
    summary = {
        "video": str(video),
        "shape": list(preds_auto.shape),
        "raw_max_abs_diff": float(diff.max()),
        "raw_mean_abs_diff": float(diff.mean()),
        "norm_separate_max_abs_diff": float(d2.max()),
        "device_auto": "auto",
        "device_server_style": dev_server,
    }
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"\nSaved: {out_dir}/preds_auto.npy, preds_server_device.npy, summary.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
