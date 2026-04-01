"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import Header from "./components/Header";
import UploadForm from "./components/UploadForm";
import Timeline from "./components/Timeline";
import RegionPanel from "./components/RegionPanel";
import type { BrainMeshData, PredictionData } from "./lib/types";

const BrainViewer = dynamic(() => import("./components/BrainViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-zinc-600">
      Initializing 3D viewer...
    </div>
  ),
});

const API_BASE =
  typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : "http://localhost:8000";

export default function Home() {
  const [meshData, setMeshData] = useState<BrainMeshData | null>(null);
  const [predictions, setPredictions] = useState<PredictionData | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/data/brain_mesh.json")
      .then((r) => r.json())
      .then(setMeshData)
      .catch((e) => console.error("Failed to load brain mesh:", e));
  }, []);

  useEffect(() => {
    if (isPlaying && predictions) {
      playRef.current = setInterval(() => {
        setCurrentFrame((f) => {
          const next = f + 1;
          if (next >= predictions.n_timesteps) {
            setIsPlaying(false);
            return 0;
          }
          return next;
        });
      }, 1000 / (predictions.fps || 1));
    }
    return () => {
      if (playRef.current) clearInterval(playRef.current);
    };
  }, [isPlaying, predictions]);

  const currentActivations =
    predictions && predictions.predictions[currentFrame]
      ? predictions.predictions[currentFrame]
      : null;

  const handleDemoLoad = useCallback(() => {
    setStatusText("Loading demo data...");
    fetch("/data/mock_predictions.json")
      .then((r) => r.json())
      .then((data: PredictionData) => {
        setPredictions(data);
        setCurrentFrame(0);
        setIsPlaying(false);
        setStatusText(null);
      })
      .catch((e) => {
        console.error("Failed to load demo:", e);
        setStatusText("Failed to load demo data");
      });
  }, []);

  const handleFileSelected = useCallback(async (file: File) => {
    setIsProcessing(true);
    setStatusText(`Uploading ${file.name}...`);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const data = await new Promise<PredictionData>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API_BASE}/api/analyze`);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setStatusText(`Uploading ${file.name}... ${pct}%`);
          }
        };

        xhr.upload.onload = () => {
          setStatusText("Upload complete! Processing with TRIBE v2...");
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText)); }
            catch { reject(new Error("Invalid response from server")); }
          } else {
            reject(new Error(xhr.responseText || "Server error: " + xhr.status));
          }
        };

        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.ontimeout = () => reject(new Error("Request timed out"));
        xhr.send(formData);
      });

      setPredictions(data);
      setCurrentFrame(0);
      setIsPlaying(false);
      setStatusText(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setStatusText(`Error: ${msg}`);
      setTimeout(() => setStatusText(null), 5000);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleTextSubmit = useCallback(async (text: string) => {
    setIsProcessing(true);
    setStatusText("Sending text for analysis...");

    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 900000);
      const res = await fetch(`${API_BASE}/api/analyze-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: ctrl.signal,
      });
      clearTimeout(tid);

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || `Server error: ${res.status}`);
      }

      setStatusText("Running TRIBE v2 inference...");
      const data: PredictionData = await res.json();
      setPredictions(data);
      setCurrentFrame(0);
      setIsPlaying(false);
      setStatusText(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setStatusText(`Error: ${msg}`);
      setTimeout(() => setStatusText(null), 5000);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col relative">
          <BrainViewer meshData={meshData} activations={currentActivations} />

          {statusText && !statusText.startsWith("Error") && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-zinc-900/90 border border-zinc-700 text-xs text-zinc-300 backdrop-blur">
              {statusText}
            </div>
          )}

          {predictions && (
            <div className="absolute top-4 right-4 px-3 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-xs text-zinc-400 font-mono backdrop-blur">
              {predictions.n_vertices.toLocaleString()} vertices ·{" "}
              {predictions.n_timesteps}s
            </div>
          )}
        </div>

        <div className="w-80 border-l border-zinc-800 flex flex-col bg-zinc-900/30 overflow-y-auto">
          <div className="border-b border-zinc-800">
            <UploadForm
              onFileSelected={handleFileSelected}
              onTextSubmit={handleTextSubmit}
              onDemoLoad={handleDemoLoad}
              isProcessing={isProcessing}
            />
          </div>
          <RegionPanel activations={currentActivations} meshData={meshData} />
        </div>
      </div>

      <Timeline
        currentFrame={currentFrame}
        totalFrames={predictions?.n_timesteps ?? 0}
        isPlaying={isPlaying}
        onFrameChange={(f) => {
          setCurrentFrame(f);
          setIsPlaying(false);
        }}
        onPlayToggle={() => setIsPlaying((p) => !p)}
      />
    </div>
  );
}
