"use client";

interface TimelineProps {
  currentFrame: number;
  totalFrames: number;
  isPlaying: boolean;
  onFrameChange: (frame: number) => void;
  onPlayToggle: () => void;
}

export default function Timeline({
  currentFrame,
  totalFrames,
  isPlaying,
  onFrameChange,
  onPlayToggle,
}: TimelineProps) {
  if (totalFrames <= 0) return null;

  return (
    <div className="flex items-center gap-4 px-6 py-4 bg-zinc-900/80 backdrop-blur border-t border-zinc-800">
      <button
        onClick={onPlayToggle}
        className="w-10 h-10 flex items-center justify-center rounded-full bg-violet-600 hover:bg-violet-500 transition-colors shrink-0"
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <rect x="1" y="1" width="4" height="12" rx="1" />
            <rect x="9" y="1" width="4" height="12" rx="1" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <polygon points="2,0 14,7 2,14" />
          </svg>
        )}
      </button>

      <input
        type="range"
        min={0}
        max={totalFrames - 1}
        value={currentFrame}
        onChange={(e) => onFrameChange(Number(e.target.value))}
        className="flex-1"
      />

      <span className="text-xs font-mono text-zinc-400 tabular-nums w-20 text-right shrink-0">
        {currentFrame + 1} / {totalFrames}s
      </span>
    </div>
  );
}
