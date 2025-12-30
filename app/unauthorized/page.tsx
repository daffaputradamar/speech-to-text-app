import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ShieldAlert } from "lucide-react"
import Link from "next/link"

export default async function UnauthorizedPage() {
  const session = await auth()

  // If not authenticated, redirect to login
  if (!session?.user) {
    redirect("/login")
  }

  // If approved, redirect to home
  if (session.user.status === "APPROVED") {
    redirect("/")
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6 text-red-500" />
          </div>
          <CardTitle>Access Denied</CardTitle>
          <CardDescription>
            You do not have permission to access this page
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            If you believe this is an error, please contact the system administrator.
          </p>

          <div className="flex gap-2">
            <Button asChild variant="outline" className="flex-1">
              <Link href="/">Back to Home</Link>
            </Button>
            <form action={async () => {
              "use server"
              const { signOut } = await import("@/auth")
              await signOut({ redirectTo: "/login" })
            }} className="flex-1">
              <Button type="submit" variant="default" className="w-full">
                Sign Out
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
