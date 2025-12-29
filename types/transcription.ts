/**
 * Types for Speech-to-Text Transcription Results
 */

export type TranscriptionResult = string;

export type TranscriptStatus = "pending" | "uploading" | "processing" | "completed" | "failed" | "cancelled";

export interface TranscriptTask {
  id: string;
  fileName: string;
  fileSize: number;
  status: TranscriptStatus;
  progress: number;
  createdAt: string | Date;
  result?: TranscriptionResult;
  error?: string;
}
