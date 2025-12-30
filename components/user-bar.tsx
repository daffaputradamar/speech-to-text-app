"use client"

import { useSession, signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Building2, GitBranch, LogOut, ShieldCheck, Mic } from "lucide-react"
import { ThemeToggler } from "./theme-toggler"

export function UserBar() {
  const { data: session } = useSession()

  if (!session?.user) return null

  return (
    <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-background/50 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-primary/10 rounded-xl border border-primary/20">
          <Mic className="h-6 w-6 text-primary" />
        </div>
        <div>
          <span className="font-semibold text-foreground">Speech to Text</span>
          <p className="text-xs text-muted-foreground">Local transcription with Whisper</p>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2 justify-end">
            <span className="text-foreground font-semibold text-sm truncate">
              {session.user?.name || "User"}
            </span>
            {session.user?.isAdmin && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 text-xs font-medium">
                <ShieldCheck className="size-3" />
                Admin
              </span>
            )}
          </div>
          <span className="text-muted-foreground text-xs leading-none truncate">
            {session.user?.email}
          </span>
          {(session.user?.divisionNames?.length > 0 || session.user?.departmentNames?.length > 0) && (
            <div className="flex flex-wrap gap-2 justify-end pt-1">
              {session.user?.divisionNames && session.user.divisionNames.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-medium">
                  <Building2 className="size-3" />
                  <span className="truncate max-w-32">{session.user.divisionNames.join(", ")}</span>
                </span>
              )}
              {session.user?.departmentNames && session.user.departmentNames.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 text-xs font-medium">
                  <GitBranch className="size-3" />
                  <span className="truncate max-w-32">{session.user.departmentNames.join(", ")}</span>
                </span>
              )}
            </div>
          )}
        </div>
        <div className="w-px h-10 bg-border" />
        <ThemeToggler />
        <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: "/login" })}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
  )
}
