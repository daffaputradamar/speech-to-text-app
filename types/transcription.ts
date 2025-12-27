/**
 * Types for Speech-to-Text Transcription Results
 */

export type Emotion = "happy" | "sad" | "angry" | "neutral";

export interface TranscriptSegment {
  speaker: string;
  timestamp: string;
  content: string;
  language: string;
  language_code: string;
  translation?: string;
  emotion: Emotion;
}

export interface TranscriptionResult {
  summary: string;
  segments: TranscriptSegment[];
}

export interface SimpleTranscriptionResult {
  transcript: string;
}

export type TranscriptStatus = "pending" | "uploading" | "processing" | "completed" | "failed";

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
