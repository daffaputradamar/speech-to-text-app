"use client"

import useSWR from "swr"
import { UploadZone } from "@/components/upload-zone"
import { TranscriptList } from "@/components/transcript-list"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { Mic, Sparkles, Globe, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import type { TranscriptTask } from "@/types/transcription"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export default function SpeechToTextPage() {
  const { data: tasks = [], mutate } = useSWR<TranscriptTask[]>("/api/tasks", fetcher, {
    refreshInterval: (data) => {
      // Only poll if there are tasks in progress
      const hasActiveTask = data?.some(t => 
        t.status === "processing" || t.status === "uploading" || t.status === "pending"
      )
      return hasActiveTask ? 2000 : 0 // Poll every 2s when active, stop when idle
    },
  })
  const { toast } = useToast()
  const { theme, setTheme } = useTheme()

  const handleUpload = async (file: File) => {
    try {
      const formData = new FormData()
      formData.append("audio", file)

      const response = await fetch("/api/tasks", {
        method: "POST",
        body: formData,
      })

      if (response.ok) {
        mutate() // Trigger an immediate re-fetch
        toast({
          title: "Upload successful",
          description: "Your file is being transcribed. This may take a few minutes.",
        })
      } else {
        const error = await response.json()
        toast({
          title: "Upload failed",
          description: error.error || "There was an error starting your transcription.",
          variant: "destructive",
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

  const inProgressTasks = tasks.filter((t) => t.status === "processing" || t.status === "uploading" || t.status === "pending")
  const completedTasks = tasks.filter((t) => t.status === "completed")
  const failedTasks = tasks.filter((t) => t.status === "failed")

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col gap-6 pt-8 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-primary/10 rounded-xl border border-primary/20">
                <Mic className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight gradient-text">
                  Speech to Text
                </h1>
                <p className="text-sm text-muted-foreground">Local transcription with Whisper</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="rounded-full"
            >
              <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </Button>
          </div>

          {/* Feature badges */}
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/5 border border-primary/10 rounded-full text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              AI Transcription
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/5 border border-blue-500/10 rounded-full text-xs font-medium text-blue-600 dark:text-blue-400">
              <Globe className="h-3.5 w-3.5" />
              Multi-language
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <Card className="sticky top-8 glass-card shadow-lg">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <div className="audio-wave">
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  Upload Audio
                </CardTitle>
                <CardDescription>
                  Drop your audio file or click to browse. We support MP3, WAV, M4A, FLAC, and more.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UploadZone onUpload={handleUpload} />
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Tabs defaultValue="all" className="w-full">
              <div className="flex items-center justify-between mb-4">
                <TabsList className="bg-muted backdrop-blur-sm">
                  <TabsTrigger className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4" value="all">All</TabsTrigger>
                  <TabsTrigger className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4" value="active">
                    Active
                    {inProgressTasks.length > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-primary/20 text-primary rounded-full">
                        {inProgressTasks.length}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4" value="done">Done</TabsTrigger>
                  <TabsTrigger className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4" value="failed">Failed</TabsTrigger>
                </TabsList>
                <div className="text-xs text-muted-foreground bg-muted/50 backdrop-blur-sm px-3 py-1.5 rounded-full border border-border/50">
                  {tasks.length} total
                </div>
              </div>

              <TabsContent value="all" className="mt-0">
                <TranscriptList tasks={tasks} onChange={() => void mutate()} />
              </TabsContent>
              <TabsContent value="active" className="mt-0">
                <TranscriptList tasks={inProgressTasks} onChange={() => void mutate()} />
              </TabsContent>
              <TabsContent value="done" className="mt-0">
                <TranscriptList tasks={completedTasks} onChange={() => void mutate()} />
              </TabsContent>
              <TabsContent value="failed" className="mt-0">
                <TranscriptList tasks={failedTasks} onChange={() => void mutate()} />
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center py-8 text-sm text-muted-foreground">
          <p>Built with ❤️ using Next.js and Whisper</p>
        </footer>
      </div>
    </main>
  )
}
