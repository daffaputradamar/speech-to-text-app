"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Upload, FileAudio, X, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface UploadZoneProps {
  onUpload: (file: File) => Promise<void>
}

const SUPPORTED_FORMATS = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/aiff",
  "audio/x-aiff",
  "audio/aac",
  "audio/ogg",
  "audio/flac",
  "audio/x-flac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/webm",
]

const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB

export function UploadZone({ onUpload }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const validateFile = (file: File): string | null => {
    if (!SUPPORTED_FORMATS.includes(file.type) && !file.name.match(/\.(mp3|wav|aiff|aac|ogg|flac|m4a|webm)$/i)) {
      return "Unsupported format. Please use MP3, WAV, AIFF, AAC, OGG, FLAC, M4A, or WEBM."
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.`
    }
    return null
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    setError(null)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      const file = files[0]
      const validationError = validateFile(file)
      if (validationError) {
        setError(validationError)
        return
      }
      setSelectedFile(file)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    const files = e.target.files
    if (files && files.length > 0) {
      const file = files[0]
      const validationError = validateFile(file)
      if (validationError) {
        setError(validationError)
        return
      }
      setSelectedFile(file)
    }
  }

  const handleUpload = async () => {
    if (selectedFile && !isUploading) {
      setIsUploading(true)
      setError(null)
      try {
        await onUpload(selectedFile)
        setSelectedFile(null)
        // Reset the file input
        if (fileInputRef.current) {
          fileInputRef.current.value = ""
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed")
      } finally {
        setIsUploading(false)
      }
    }
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative border-2 border-dashed rounded-2xl p-8 transition-all duration-300 flex flex-col items-center justify-center text-center gap-4 bg-gradient-to-br from-muted/30 to-muted/10",
          isDragging
            ? "border-primary bg-primary/10 scale-[1.02] shadow-lg shadow-primary/10"
            : "border-border/50 hover:border-primary/50 hover:bg-muted/40",
          selectedFile && "border-primary/50 bg-primary/5",
          error && "border-destructive/50 bg-destructive/5",
        )}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept="audio/*,.mp3,.wav,.aiff,.aac,.ogg,.flac,.m4a,.webm"
          className="hidden"
          disabled={isUploading}
        />

        {selectedFile ? (
          <>
            <div className="p-4 bg-gradient-to-br from-primary/20 to-primary/10 rounded-2xl border border-primary/20">
              <FileAudio className="h-8 w-8 text-primary" />
            </div>
            <div>
              <p className="font-medium">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
            </div>
            {!isUploading && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 rounded-full hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  setSelectedFile(null)
                  setError(null)
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </>
        ) : (
          <>
            <div className="p-4 bg-muted/50 rounded-2xl border border-border/50">
              <Upload className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Click or drag audio file to upload</p>
              <p className="text-xs text-muted-foreground mt-1">MP3, WAV, M4A, FLAC, OGG, AAC (Max 500MB)</p>
            </div>
            <Button variant="outline" className="rounded-full px-6" onClick={() => fileInputRef.current?.click()}>
              Select File
            </Button>
          </>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}

      <Button
        className="w-full rounded-xl h-11 text-base font-medium shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300"
        disabled={!selectedFile || isUploading}
        onClick={handleUpload}
      >
        {isUploading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Uploading...
          </>
        ) : (
          "Start Transcription"
        )}
      </Button>
    </div>
  )
}
