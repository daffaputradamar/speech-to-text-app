"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { FileAudio, CheckCircle2, Clock, AlertCircle, ChevronDown, ChevronUp, Upload, User, Copy, Check, Download, Trash2, Loader2 } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import type { TranscriptTask, TranscriptStatus, TranscriptSegment } from "@/types/transcription"

// Re-export the types for backward compatibility
export type { TranscriptTask, TranscriptStatus }

interface TranscriptListProps {
  tasks: TranscriptTask[]
  onChange?: () => void | Promise<void>
}

export function TranscriptList({ tasks, onChange }: TranscriptListProps) {
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-border/50 rounded-xl bg-muted/20 backdrop-blur-sm">
        <div className="p-4 bg-muted/50 rounded-full mb-4">
          <FileAudio className="h-10 w-10 text-muted-foreground opacity-50" />
        </div>
        <h3 className="text-lg font-medium">No transcriptions yet</h3>
        <p className="text-sm text-muted-foreground mt-1">Upload an audio file to get started</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {tasks.map((task) => (
        <TranscriptCard key={task.id} task={task} onChange={onChange} />
      ))}
    </div>
  )
}

function TranscriptCard({ task, onChange }: { task: TranscriptTask; onChange?: () => void | Promise<void> }) {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleCopyTranscript = async () => {
    if (!task.result) return

    const fullTranscript = task.result.segments
      .map((s) => `[${s.timestamp}] ${s.speaker}: ${s.content}`)
      .join("\n")

    await navigator.clipboard.writeText(fullTranscript)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDelete = async () => {
    if (isDeleting) return
    setIsDeleting(true)
    try {
      await fetch(`/api/tasks?id=${task.id}`, { method: "DELETE" })
      if (onChange) await onChange()
    } catch (error) {
      console.error("Failed to delete task", error)
    } finally {
      setIsDeleting(false)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  return (
    <Card className="overflow-hidden glass-card shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl border border-primary/10">
              <FileAudio className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm font-medium">{task.fileName}</CardTitle>
              <CardDescription className="text-xs flex items-center gap-2">
                <span>{formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}</span>
                {task.fileSize && (
                  <>
                    <span>•</span>
                    <span>{formatFileSize(task.fileSize)}</span>
                  </>
                )}
              </CardDescription>
            </div>
          </div>
          <StatusBadge status={task.status} />
        </div>
      </CardHeader>
      <CardContent>
        {(task.status === "uploading" || task.status === "pending") && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Uploading file...</span>
          </div>
        )}

        {task.status === "processing" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Processing with Gemini AI...</span>
          </div>
        )}

        {task.status === "completed" && task.result && (
          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <div className="space-y-3">
              {/* Summary */}
              <div className="bg-muted/50 p-3 rounded-md border">
                <p className="text-sm font-medium mb-1">Summary</p>
                <p className="text-sm text-muted-foreground">{task.result.summary}</p>
              </div>

              {/* Preview of first segment */}
              {!isOpen && task.result.segments.length > 0 && (
                <div className="text-sm text-muted-foreground italic line-clamp-2">
                  "{task.result.segments[0].content}"
                </div>
              )}

              {/* Full transcript */}
              <CollapsibleContent>
                <div className="space-y-2 mt-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Full Transcript</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleCopyTranscript}
                    >
                      {copied ? (
                        <>
                          <Check className="h-3 w-3 mr-1" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3 mr-1" />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {task.result.segments.map((segment, index) => (
                      <SegmentItem key={index} segment={segment} />
                    ))}
                  </div>
                </div>
              </CollapsibleContent>

              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full text-xs">
                  {isOpen ? (
                    <>
                      <ChevronUp className="h-4 w-4 mr-1" />
                      Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4 mr-1" />
                      Show full transcript ({task.result.segments.length} segments)
                    </>
                  )}
                </Button>
              </CollapsibleTrigger>

              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Button variant="outline" size="sm" asChild>
                  <a href={`/api/tasks/${task.id}/download`} download>
                    <Download className="h-4 w-4 mr-2" />
                    Download TXT
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {isDeleting ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </div>
          </Collapsible>
        )}

        {task.status === "failed" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>{task.error || "Transcription failed. Please try again."}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting}
                className="text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {isDeleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SegmentItem({ segment }: { segment: TranscriptSegment }) {
  const emotionColors: Record<string, string> = {
    happy: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    sad: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    angry: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    neutral: "bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-400",
  }

  return (
    <div className="bg-muted/30 p-3 rounded-md border text-sm space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <User className="h-3 w-3 text-muted-foreground" />
          <span className="font-medium text-xs">{segment.speaker}</span>
          <span className="text-xs text-muted-foreground">{segment.timestamp}</span>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {segment.language}
          </Badge>
          <Badge className={`text-[10px] px-1.5 py-0 ${emotionColors[segment.emotion] || emotionColors.neutral}`}>
            {segment.emotion}
          </Badge>
        </div>
      </div>
      <p className="text-muted-foreground">{segment.content}</p>
      {segment.translation && segment.language_code !== "en" && (
        <p className="text-xs text-muted-foreground/70 italic border-t pt-1 mt-1">
          Translation: {segment.translation}
        </p>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: TranscriptStatus }) {
  switch (status) {
    case "pending":
    case "uploading":
      return (
        <Badge variant="outline" className="gap-1">
          <Upload className="h-3 w-3" />
          Uploading
        </Badge>
      )
    case "processing":
      return (
        <Badge variant="outline" className="gap-1 animate-pulse">
          <Clock className="h-3 w-3" />
          Processing
        </Badge>
      )
    case "completed":
      return (
        <Badge
          variant="secondary"
          className="gap-1 bg-green-500/10 text-green-600 border-green-200 dark:border-green-900"
        >
          <CheckCircle2 className="h-3 w-3" />
          Done
        </Badge>
      )
    case "failed":
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          Failed
        </Badge>
      )
  }
}
