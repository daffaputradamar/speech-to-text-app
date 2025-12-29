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

import dotenv from "dotenv";
dotenv.config();

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
      logWithTs(`🔄 ${label} (attempt ${i + 1}/${attempts})...`);
      return await fn();
    } catch (err) {
      lastError = err;
      const code = (err as any)?.cause?.code || (err as any)?.code;
      const message = (err as any)?.message || String(err);
      const statusCode = (err as any)?.status || (err as any)?.statusCode;
      
      logErrorWithTs(`❌ ${label} failed:`, {
        code,
        statusCode,
        message,
        attempt: `${i + 1}/${attempts}`,
      });

      const retryable = 
        code === "UND_ERR_HEADERS_TIMEOUT" || 
        code === "ECONNRESET" || 
        message.includes("fetch failed") ||
        message.includes("ECONNREFUSED") ||
        message.includes("ETIMEDOUT") ||
        message.includes("ERR_HTTP") ||
        (statusCode >= 500 && statusCode < 600);
      
      if (!retryable || i === attempts - 1) {
        throw err;
      }

      const delay = baseDelayMs * Math.pow(2, i);
      logWithTs(`⏳ Retrying in ${(delay / 1000).toFixed(1)}s...`);
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

// Model selection (configurable via env)
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

const TRANSCRIPTION_PROMPT = `
Transcribe the audio content as plain text with speaker diarization.

IMPORTANT: Return ONLY plain text. Do NOT return JSON, summaries, or structured data.

Format requirements:
- Each line should be: [HH:MM:SS] Speaker X: <speech content>
- Use consistent speaker labels (Speaker 1, Speaker 2, etc.)
- Include timestamps in HH:MM:SS or MM:SS format
- Preserve conversation flow and order
- Return plain text only, no JSON formatting

Example output:
[00:01] Speaker 1: Hello, how are you today?
[00:05] Speaker 2: I'm doing well, thanks for asking.
[00:10] Speaker 1: Great to hear from you.
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
  const fileStats = await fs.promises.stat(filePath);
  logWithTs(`   File size: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB`);

  try {
    const file = await retryWithBackoff("Gemini upload", () =>
      ai.files.upload({
        file: filePath,
        config: {
          mimeType: mimeType,
        },
      }),
      5, // 5 attempts for uploads
      3000 // 3 second initial delay
    );

    logWithTs(`✅ Upload complete. File URI: ${file.uri}`);
    logWithTs(`   File name: ${file.name}`);
    return {
      uri: file.uri!,
      mimeType: file.mimeType!,
      name: file.name!,
    };
  } catch (error) {
    logErrorWithTs(`Failed to upload file to Gemini:`, error);
    throw error;
  }
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
  logWithTs(`⏳ Waiting for file to be ready in Gemini...`);

  for (let attempts = 0; attempts < maxAttempts; attempts++) {
    try {
      const fileInfo = await ai.files.get({ name: fileName });

      if (fileInfo.state === "ACTIVE") {
        logWithTs(`✅ File is ready (${attempts + 1} checks)`);
        return;
      }

      if (fileInfo.state !== "PROCESSING") {
        throw new Error(`File processing failed. State: ${fileInfo.state}`);
      }

      if (attempts % 10 === 0) {
        logWithTs(
          `   File state: ${fileInfo.state} (check ${attempts + 1}/${maxAttempts})`
        );
      }
      
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
    } catch (error) {
      logErrorWithTs(`Error checking file status:`, error);
      throw error;
    }
  }

  throw new Error("File processing timed out after 30 minutes");
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
      model: GEMINI_MODEL,
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
    })
  );

  const responseText = response.text;
  logWithTs(`📄 Gemini response (${responseText?.length || 0} chars)`);

  if (!responseText) {
    throw new Error("Gemini API returned empty response");
  }

  return responseText;
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

    logWithTs(
      `🔄 Processing transcription (this may take several minutes for 2-hour audio)...`
    );

    try {
      const response = await retryWithBackoff("Gemini file transcription", () => {
        logWithTs(`   Sending transcription request to Gemini...`);
        return ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [
            {
              parts: [
                {
                  fileData: {
                    fileUri: uploadedFile!.uri,
                    mimeType: uploadedFile!.mimeType,
                  },
                },
                {
                  text: TRANSCRIPTION_PROMPT,
                },
              ],
            },
          ],
        });
      });

      const responseText = response.text;
      logWithTs(`📄 Gemini file API response received (${responseText?.length || 0} chars)`);

      if (!responseText) {
        throw new Error("Gemini API returned empty response");
      }

      return responseText;
    } catch (error) {
      logErrorWithTs(`❌ Transcription request failed:`, error);
      throw error;
    }
  } finally {
    // Clean up: delete file from Gemini
    if (uploadedFile) {
      try {
        await deleteFromGemini(uploadedFile.name);
      } catch (cleanupError) {
        logErrorWithTs(`Warning: Failed to cleanup file from Gemini:`, cleanupError);
      }
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

  logWithTs(`Using Gemini model: ${GEMINI_MODEL}`);
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
          model: GEMINI_MODEL,
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
      model: GEMINI_MODEL,
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
