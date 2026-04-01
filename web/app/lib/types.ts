export interface BrainMeshData {
  vertices: number[];
  faces: number[];
  n_left: number;
  n_vertices: number;
  n_faces: number;
}

export interface PredictionData {
  predictions: number[][];
  n_timesteps: number;
  n_vertices: number;
  fps: number;
}

export type JobStatus = "idle" | "uploading" | "processing" | "done" | "error";

export interface AnalysisJob {
  id: string;
  status: JobStatus;
  progress: number;
  error?: string;
  predictions?: PredictionData;
}
