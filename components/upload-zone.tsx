"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Upload, FileAudio, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface UploadZoneProps {
  onUpload: (file: File) => void
}

export function UploadZone({ onUpload }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    const files = e.dataTransfer.files
    if (files.length > 0 && files[0].type.startsWith("audio/")) {
      setSelectedFile(files[0])
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      setSelectedFile(files[0])
    }
  }

  const handleUpload = () => {
    if (selectedFile) {
      onUpload(selectedFile)
      setSelectedFile(null)
    }
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-8 transition-all flex flex-col items-center justify-center text-center gap-4",
          isDragging
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-muted-foreground/20 hover:border-muted-foreground/40",
          selectedFile && "border-primary/50 bg-primary/5",
        )}
      >
        <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="audio/*" className="hidden" />

        {selectedFile ? (
          <>
            <div className="p-4 bg-primary/10 rounded-full">
              <FileAudio className="h-8 w-8 text-primary" />
            </div>
            <div>
              <p className="font-medium">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2"
              onClick={() => setSelectedFile(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <div className="p-4 bg-muted rounded-full">
              <Upload className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Click or drag audio file to upload</p>
              <p className="text-xs text-muted-foreground mt-1">MP3, WAV, M4A (Max 50MB)</p>
            </div>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              Select File
            </Button>
          </>
        )}
      </div>

      <Button className="w-full" disabled={!selectedFile} onClick={handleUpload}>
        Start Transcription
      </Button>
    </div>
  )
}
