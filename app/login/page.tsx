"use client"

import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LogIn, Mic } from "lucide-react"

export default function LoginPage() {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-md items-center justify-center p-4">
      <Card className="w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 p-3 bg-primary/10 rounded-xl border border-primary/20 w-fit">
            <Mic className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Speech to Text</CardTitle>
          <CardDescription>
            Sign in with your Keycloak account to access the transcription service.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={() => signIn("keycloak", { callbackUrl: "/" })}
            className="w-full gap-2"
            size="lg"
          >
            <LogIn className="h-4 w-4" />
            Sign in with Keycloak
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            By signing in, you can upload audio files and access your transcription history.
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
