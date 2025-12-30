"use client"

import useSWR from "swr"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { UploadZone } from "@/components/upload-zone"
import { TranscriptList } from "@/components/transcript-list"
import { UserBar } from "@/components/user-bar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { Sparkles, Globe, Loader2 } from "lucide-react"
import type { TranscriptTask } from "@/types/transcription"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export default function SpeechToTextPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { data: tasks = [], mutate } = useSWR<TranscriptTask[]>(
    session?.user ? "/api/tasks" : null, 
    fetcher, 
    {
      refreshInterval: (data) => {
        // Only poll if there are tasks in progress
        const hasActiveTask = data?.some(t => 
          t.status === "processing" || t.status === "uploading" || t.status === "pending"
        )
        return hasActiveTask ? 2000 : 0 // Poll every 2s when active, stop when idle
      },
    }
  )
  const { toast } = useToast()

  // Redirect based on auth status
  useEffect(() => {
    if (status === "loading") return
    
    if (!session?.user) {
      router.push("/login")
      return
    }

    if (session.user.status === "PENDING" || session.user.status === "REJECTED") {
      router.push("/pending")
      return
    }
  }, [session, status, router])

  // Show loading state while checking auth
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // Don't render main content until authenticated
  if (!session?.user || session.user.status !== "APPROVED") {
    return null
  }

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
        {/* User Header */}
        <div className="pt-4">
          <UserBar />
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
