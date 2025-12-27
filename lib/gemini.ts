/**
 * Gemini Speech-to-Text Transcription Library
 *
 * Uses Google Gemini API with Files API support for large audio files.
 */

import { GoogleGenAI, Type } from "@google/genai";
import type { TranscriptionResult } from "@/types/transcription";
import fs from "fs";
import path from "path";
import os from "os";
import { logWithTs, logErrorWithTs } from "@/lib/logger";

// Basic retry helper for transient network errors (e.g., headers timeout)
async function retryWithBackoff<T>(
  label: string,
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 2000
): Promise<T> {
  let lastError: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const code = (err as any)?.cause?.code || (err as any)?.code;
      const retryable = code === "UND_ERR_HEADERS_TIMEOUT" || code === "ECONNRESET";
      logErrorWithTs(`Retryable error during ${label}:`, err);

      if (!retryable || i === attempts - 1) {
        throw err;
      }

      const delay = baseDelayMs * Math.pow(2, i);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// Initialize Google GenAI client
const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY || "",
});

// Supported audio MIME types
const MIME_TYPES: Record<string, string> = {
  ".mp3": "audio/mp3",
  ".wav": "audio/wav",
  ".aiff": "audio/aiff",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".webm": "audio/webm",
};

// Emotion enum values
const EmotionValues = ["happy", "sad", "angry", "neutral"] as const;

// Transcription schema for structured output
const transcriptionSchema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "A concise summary of the audio content.",
    },
    segments: {
      type: Type.ARRAY,
      description: "List of transcribed segments with speaker and timestamp.",
      items: {
        type: Type.OBJECT,
        properties: {
          speaker: { type: Type.STRING },
          timestamp: { type: Type.STRING },
          content: { type: Type.STRING },
          language: { type: Type.STRING },
          language_code: { type: Type.STRING },
          translation: { type: Type.STRING },
          emotion: {
            type: Type.STRING,
            enum: [...EmotionValues],
          },
        },
        required: [
          "speaker",
          "timestamp",
          "content",
          "language",
          "language_code",
          "emotion",
        ],
      },
    },
  },
  required: ["summary", "segments"],
};

const TRANSCRIPTION_PROMPT = `
Process the audio file and generate a detailed transcription.

Requirements:
1. Identify distinct speakers (e.g., Speaker 1, Speaker 2, or names if context allows).
2. Provide accurate timestamps for each segment (Format: MM:SS).
3. Detect the primary language of each segment.
4. If the segment is in a language different than English, also provide the English translation.
5. Identify the primary emotion of the speaker in this segment. You MUST choose exactly one of the following: happy, sad, angry, neutral.
6. Provide a brief summary of the entire audio at the beginning.
`;

/**
 * Get MIME type from file extension or filename
 */
export function getMimeType(fileNameOrPath: string): string {
  const ext = path.extname(fileNameOrPath).toLowerCase();
  return MIME_TYPES[ext] || "audio/mp3";
}

/**
 * Check if the file extension is supported
 */
export function isSupportedFormat(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return ext in MIME_TYPES;
}

/**
 * Save buffer to a temporary file
 */
export async function saveToTempFile(
  buffer: Buffer,
  fileName: string
): Promise<string> {
  const tempDir = os.tmpdir();
  const ext = path.extname(fileName);
  const tempFileName = `stt-${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`;
  const tempPath = path.join(tempDir, tempFileName);

  await fs.promises.writeFile(tempPath, new Uint8Array(buffer));
  return tempPath;
}

/**
 * Clean up temporary file
 */
export async function cleanupTempFile(filePath: string): Promise<void> {
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    console.error(`Failed to cleanup temp file: ${filePath}`, error);
  }
}

/**
 * Upload file to Gemini Files API (for large files)
 */
async function uploadToGemini(
  filePath: string,
  mimeType: string
): Promise<{ uri: string; mimeType: string; name: string }> {
  logWithTs(`📤 Uploading file to Gemini Files API...`);

  const file = await retryWithBackoff("Gemini upload", () =>
    ai.files.upload({
      file: filePath,
      config: {
        mimeType: mimeType,
      },
    })
  );

  logWithTs(`✅ Upload complete. File URI: ${file.uri}`);
  return {
    uri: file.uri!,
    mimeType: file.mimeType!,
    name: file.name!,
  };
}

/**
 * Delete file from Gemini Files API
 */
async function deleteFromGemini(fileName: string): Promise<void> {
  try {
    await ai.files.delete({ name: fileName });
    console.log(`🗑️ Deleted file from Gemini: ${fileName}`);
  } catch (err) {
    logErrorWithTs(`Failed to delete file from Gemini:`, err);
  }
}

/**
 * Wait for file to be ready in Gemini
 */
async function waitForFileReady(
  fileName: string,
  maxAttempts = 360 // ~30 minutes at 5s intervals
): Promise<void> {
  logWithTs(`⏳ Waiting for file to be ready...`);

  for (let attempts = 0; attempts < maxAttempts; attempts++) {
    const fileInfo = await ai.files.get({ name: fileName });

    if (fileInfo.state === "ACTIVE") {
      logWithTs(`✅ File is ready`);
      return;
    }

    if (fileInfo.state !== "PROCESSING") {
      throw new Error(`File processing failed. State: ${fileInfo.state}`);
    }

    logWithTs(
      `   File state: ${fileInfo.state} (attempt ${attempts + 1}/${maxAttempts})`
    );
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
  }

  throw new Error("File processing timed out");
}

/**
 * Transcribe audio from a buffer (inline data for small files)
 */
async function transcribeInline(
  buffer: Buffer,
  mimeType: string
): Promise<TranscriptionResult> {
  const base64Audio = buffer.toString("base64");

  const response = await retryWithBackoff("Gemini inline transcription", () =>
    ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Audio,
              },
            },
            {
              text: TRANSCRIPTION_PROMPT,
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: transcriptionSchema,
      },
    })
  );

  return JSON.parse(response.text!) as TranscriptionResult;
}

/**
 * Transcribe using Gemini Files API (for large files)
 */
async function transcribeWithFilesAPI(
  filePath: string,
  mimeType: string
): Promise<TranscriptionResult> {
  let uploadedFile: { uri: string; mimeType: string; name: string } | null = null;

  try {
    // Upload file to Gemini
    uploadedFile = await uploadToGemini(filePath, mimeType);

    // Wait for file to be processed
    await waitForFileReady(uploadedFile.name);

    console.log(
      `🔄 Processing transcription (this may take several minutes for long audio)...`
    );

    const response = await retryWithBackoff("Gemini file transcription", () =>
      ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            parts: [
              {
                fileData: {
                  fileUri: uploadedFile.uri,
                  mimeType: uploadedFile.mimeType,
                },
              },
              {
                text: TRANSCRIPTION_PROMPT,
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: transcriptionSchema,
        },
      })
    );

    return JSON.parse(response.text!) as TranscriptionResult;
  } finally {
    // Clean up: delete file from Gemini
    if (uploadedFile) {
      await deleteFromGemini(uploadedFile.name);
    }
  }
}

/**
 * Main transcription function
 * Uses inline data for files < 15MB, Files API for larger files
 */
export async function transcribeAudio(
  buffer: Buffer,
  fileName: string
): Promise<TranscriptionResult> {
  const mimeType = getMimeType(fileName);
  const fileSizeMB = buffer.length / (1024 * 1024);

  logWithTs(`📊 File size: ${fileSizeMB.toFixed(2)} MB`);
  logWithTs(`📁 MIME type: ${mimeType}`);

  // For files larger than 15MB, use Files API
  if (fileSizeMB > 15) {
    logWithTs(`📤 Using Files API for large file...`);

    // Save to temp file
    const tempPath = await saveToTempFile(buffer, fileName);

    try {
      return await transcribeWithFilesAPI(tempPath, mimeType);
    } finally {
      // Clean up temp file
      await cleanupTempFile(tempPath);
    }
  }

  // For smaller files, use inline data
  logWithTs(`📝 Using inline data for transcription...`);
  return await transcribeInline(buffer, mimeType);
}

/**
 * Get simple transcript (plain text without structured data)
 */
export async function transcribeAudioSimple(
  buffer: Buffer,
  fileName: string
): Promise<string> {
  const mimeType = getMimeType(fileName);
  const fileSizeMB = buffer.length / (1024 * 1024);

  if (fileSizeMB > 15) {
    const tempPath = await saveToTempFile(buffer, fileName);

    try {
      const uploadedFile = await uploadToGemini(tempPath, mimeType);
      await waitForFileReady(uploadedFile.name);

      const response = await retryWithBackoff("Gemini simple file transcript", () =>
        ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [
            {
              parts: [
                {
                  fileData: {
                    fileUri: uploadedFile.uri,
                    mimeType: uploadedFile.mimeType,
                  },
                },
                {
                  text: "Generate a transcript of the speech.",
                },
              ],
            },
          ],
        })
      );

      await deleteFromGemini(uploadedFile.name);
      return response.text!;
    } finally {
      await cleanupTempFile(tempPath);
    }
  }

  const base64Audio = buffer.toString("base64");

  const response = await retryWithBackoff("Gemini simple inline transcript", () =>
    ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Audio,
              },
            },
            {
              text: "Generate a transcript of the speech.",
            },
          ],
        },
      ],
    })
  );

  return response.text!;
}
