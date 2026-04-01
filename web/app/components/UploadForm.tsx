"use client";

import { useState, useRef } from "react";

interface UploadFormProps {
  onFileSelected: (file: File) => void;
  onTextSubmit: (text: string) => void;
  onDemoLoad: () => void;
  isProcessing: boolean;
}

const ACCEPTED_VIDEO = ".mp4,.avi,.mkv,.mov,.webm";
const ACCEPTED_AUDIO = ".wav,.mp3,.flac,.ogg";

type InputMode = "file" | "text";

export default function UploadForm({
  onFileSelected,
  onTextSubmit,
  onDemoLoad,
  isProcessing,
}: UploadFormProps) {
  const [mode, setMode] = useState<InputMode>("file");
  const [text, setText] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) onFileSelected(file);
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex gap-1 bg-zinc-800 rounded-lg p-0.5">
        <button
          onClick={() => setMode("file")}
          className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${
            mode === "file"
              ? "bg-violet-600 text-white"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Video / Audio
        </button>
        <button
          onClick={() => setMode("text")}
          className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${
            mode === "text"
              ? "bg-violet-600 text-white"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Text
        </button>
      </div>

      {mode === "file" ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
            dragActive
              ? "border-violet-500 bg-violet-500/10"
              : "border-zinc-700 hover:border-zinc-500 bg-zinc-900/50"
          }`}
        >
          <svg
            className="w-8 h-8 text-zinc-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <span className="text-sm text-zinc-400">
            Drop a video or audio file
          </span>
          <span className="text-xs text-zinc-600">
            MP4, AVI, MOV, WAV, MP3, FLAC
          </span>
          <input
            ref={fileRef}
            type="file"
            accept={`${ACCEPTED_VIDEO},${ACCEPTED_AUDIO}`}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFileSelected(file);
            }}
            disabled={isProcessing}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter a sentence or paragraph to see how the brain processes it..."
            className="w-full h-28 rounded-xl bg-zinc-900/50 border border-zinc-700 p-3 text-sm text-zinc-200 placeholder-zinc-600 resize-none focus:outline-none focus:border-violet-500 transition-colors"
            disabled={isProcessing}
          />
          <button
            onClick={() => text.trim() && onTextSubmit(text.trim())}
            disabled={!text.trim() || isProcessing}
            className="w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
          >
            Analyze Text
          </button>
        </div>
      )}

      <div className="relative flex items-center gap-3 my-1">
        <div className="flex-1 h-px bg-zinc-800" />
        <span className="text-xs text-zinc-600">or</span>
        <div className="flex-1 h-px bg-zinc-800" />
      </div>

      <button
        onClick={onDemoLoad}
        disabled={isProcessing}
        className="w-full py-2.5 rounded-lg border border-zinc-700 hover:border-violet-500/50 hover:bg-violet-500/5 text-sm text-zinc-300 transition-colors disabled:opacity-40"
      >
        Load Demo Visualization
      </button>

      {isProcessing && (
        <div className="flex items-center gap-2 text-xs text-violet-400 mt-1">
          <div className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
          Processing with TRIBE v2...
        </div>
      )}
    </div>
  );
}
