"use client"

import useSWR from "swr"
import { UploadZone } from "@/components/upload-zone"
import { TranscriptList, type TranscriptTask } from "@/components/transcript-list"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export default function SpeechToTextPage() {
  const { data: tasks = [], mutate } = useSWR<TranscriptTask[]>("/api/tasks", fetcher, {
    refreshInterval: 1000, // Poll every second for updates
  })
  const { toast } = useToast()

  const handleUpload = async (file: File) => {
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        body: JSON.stringify({ fileName: file.name }),
        headers: { "Content-Type": "application/json" },
      })

      if (response.ok) {
        mutate() // Trigger an immediate re-fetch
        toast({
          title: "Upload successful",
          description: "Your file is being transcribed in the background.",
        })
      }
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "There was an error starting your transcription.",
        variant: "destructive",
      })
    }
  }

  const inProgressTasks = tasks.filter((t) => t.status === "processing")
  const completedTasks = tasks.filter((t) => t.status === "completed")
  const failedTasks = tasks.filter((t) => t.status === "failed")

  return (
    <main className="min-h-screen bg-slate-50/50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Speech to Text</h1>
          <p className="text-muted-foreground">Upload audio files and get high-quality transcripts in minutes.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <Card className="sticky top-8">
              <CardHeader>
                <CardTitle>Upload Audio</CardTitle>
                <CardDescription>Select an audio file to begin transcription</CardDescription>
              </CardHeader>
              <CardContent>
                <UploadZone onUpload={handleUpload} />
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Tabs defaultValue="all" className="w-full">
              <div className="flex items-center justify-between mb-4">
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="active">Active</TabsTrigger>
                  <TabsTrigger value="done">Done</TabsTrigger>
                  <TabsTrigger value="failed">Failed</TabsTrigger>
                </TabsList>
                <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                  {tasks.length} total tasks
                </div>
              </div>

              <TabsContent value="all" className="mt-0">
                <TranscriptList tasks={tasks} />
              </TabsContent>
              <TabsContent value="active" className="mt-0">
                <TranscriptList tasks={inProgressTasks} />
              </TabsContent>
              <TabsContent value="done" className="mt-0">
                <TranscriptList tasks={completedTasks} />
              </TabsContent>
              <TabsContent value="failed" className="mt-0">
                <TranscriptList tasks={failedTasks} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </main>
  )
}
