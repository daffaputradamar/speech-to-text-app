"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { FileAudio, CheckCircle2, Clock, AlertCircle } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

export type TranscriptStatus = "processing" | "completed" | "failed"

export interface TranscriptTask {
  id: string
  fileName: string
  status: TranscriptStatus
  progress: number
  createdAt: Date
  transcript?: string
  error?: string
}

interface TranscriptListProps {
  tasks: TranscriptTask[]
}

export function TranscriptList({ tasks }: TranscriptListProps) {
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed rounded-lg">
        <FileAudio className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
        <h3 className="text-lg font-medium">No transcriptions yet</h3>
        <p className="text-sm text-muted-foreground">Upload an audio file to get started</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {tasks.map((task) => (
        <Card key={task.id} className="overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <FileAudio className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-sm font-medium">{task.fileName}</CardTitle>
                  <CardDescription className="text-xs">
                    {formatDistanceToNow(task.createdAt, { addSuffix: true })}
                  </CardDescription>
                </div>
              </div>
              <StatusBadge status={task.status} />
            </div>
          </CardHeader>
          <CardContent>
            {task.status === "processing" && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Converting audio to text...</span>
                  <span>{task.progress}%</span>
                </div>
                <Progress value={task.progress} className="h-1.5" />
              </div>
            )}

            {task.status === "completed" && (
              <div className="bg-muted/50 p-3 rounded-md border text-sm text-muted-foreground italic line-clamp-2">
                "{task.transcript}"
              </div>
            )}

            {task.status === "failed" && (
              <div className="flex items-center gap-2 text-xs text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span>{task.error || "Transcription failed. Please try again."}</span>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function StatusBadge({ status }: { status: TranscriptStatus }) {
  switch (status) {
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
