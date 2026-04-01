"""Neuroscope API — FastAPI server wrapping TRIBE v2 inference."""

import logging
import os

import langdetect
langdetect.detect = lambda text: "en"

os.environ["PATH"] = os.path.expanduser("~/.local/bin") + ":" + os.environ.get("PATH", "")

import tempfile
import uuid
from pathlib import Path

import numpy as np
import torch
import uvicorn
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
logger = logging.getLogger("neuroscope")

app = FastAPI(title="Neuroscope API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path(tempfile.gettempdir()) / "neuroscope_uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

TRIBE_MODEL = None

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
if DEVICE == "cuda" and torch.cuda.device_count() > 1:
    DEVICE = "cuda:1"


def get_model():
    """Lazy-load TRIBE v2 model on first request."""
    global TRIBE_MODEL
    if TRIBE_MODEL is not None:
        return TRIBE_MODEL

    logger.info("Loading TRIBE v2 model (this takes ~60s on first load)...")
    from tribev2.demo_utils import TribeModel

    cache_dir = os.environ.get(
        "NEUROSCOPE_CACHE_DIR",
        str(Path(__file__).resolve().parent.parent / "cache"),
    )
    TRIBE_MODEL = TribeModel.from_pretrained(
        "facebook/tribev2",
        cache_folder=cache_dir,
        device=DEVICE,
    )
    logger.info("TRIBE v2 loaded on %s", DEVICE)
    return TRIBE_MODEL


class TextRequest(BaseModel):
    text: str


class PredictionResponse(BaseModel):
    predictions: list[list[float]]
    n_timesteps: int
    n_vertices: int
    fps: int


def predictions_to_response(preds: np.ndarray) -> PredictionResponse:
    """Normalise raw TRIBE predictions and build a JSON-friendly response."""
    vmin, vmax = float(preds.min()), float(preds.max())
    rng = vmax - vmin if vmax - vmin > 1e-9 else 1.0
    normed = (preds - vmin) / rng

    return PredictionResponse(
        predictions=[[round(float(v), 4) for v in row] for row in normed],
        n_timesteps=int(normed.shape[0]),
        n_vertices=int(normed.shape[1]),
        fps=1,
    )


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "device": DEVICE,
        "model_loaded": TRIBE_MODEL is not None,
    }


@app.post("/api/analyze", response_model=PredictionResponse)
async def analyze_file(file: UploadFile = File(...)):
    """Upload a video or audio file and return predicted brain activations."""
    suffix = Path(file.filename or "upload").suffix.lower()
    allowed = {".mp4", ".avi", ".mkv", ".mov", ".webm", ".wav", ".mp3", ".flac", ".ogg"}
    if suffix not in allowed:
        raise HTTPException(400, f"Unsupported file type: {suffix}")

    file_path = UPLOAD_DIR / f"{uuid.uuid4().hex}{suffix}"
    try:
        content = await file.read()
        file_path.write_bytes(content)
        logger.info("Saved upload: %s (%d KB)", file_path, len(content) // 1024)

        model = get_model()

        video_exts = {".mp4", ".avi", ".mkv", ".mov", ".webm"}
        if suffix in video_exts:
            events = model.get_events_dataframe(video_path=str(file_path))
        else:
            events = model.get_events_dataframe(audio_path=str(file_path))

        preds, segments = model.predict(events=events, verbose=True)
        logger.info("Prediction shape: %s", preds.shape)

        return predictions_to_response(preds)

    except Exception as e:
        logger.exception("Analysis failed")
        raise HTTPException(500, str(e))
    finally:
        file_path.unlink(missing_ok=True)


@app.post("/api/analyze-text", response_model=PredictionResponse)
async def analyze_text(req: TextRequest):
    """Analyze a text string and return predicted brain activations."""
    if not req.text.strip():
        raise HTTPException(400, "Text cannot be empty")

    txt_path = UPLOAD_DIR / f"{uuid.uuid4().hex}.txt"
    try:
        txt_path.write_text(req.text, encoding="utf-8")
        logger.info("Analyzing text: %d chars", len(req.text))

        model = get_model()
        events = model.get_events_dataframe(text_path=str(txt_path))
        preds, segments = model.predict(events=events, verbose=True)
        logger.info("Prediction shape: %s", preds.shape)

        return predictions_to_response(preds)

    except Exception as e:
        logger.exception("Text analysis failed")
        raise HTTPException(500, str(e))
    finally:
        txt_path.unlink(missing_ok=True)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
