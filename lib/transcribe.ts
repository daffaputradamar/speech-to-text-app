/**
 * Local transcription helpers
 */

// Supported audio formats
const SUPPORTED_EXTENSIONS = [".mp3", ".wav", ".m4a", ".flac", ".ogg", ".webm", ".aac", ".aiff"];

/**
 * Check if a file format is supported
 */
export function isSupportedFormat(fileName: string): boolean {
  const ext = fileName.toLowerCase().substring(fileName.lastIndexOf("."));
  return SUPPORTED_EXTENSIONS.includes(ext);
}
