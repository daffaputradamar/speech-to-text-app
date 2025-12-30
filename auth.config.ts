import type { NextAuthConfig } from "next-auth"
import Keycloak from "next-auth/providers/keycloak"
import { db } from "@/lib/db"
import { users } from "@/db/schema"
import { eq } from "drizzle-orm"

// Module augmentation for NextAuth types
declare module "next-auth" {
  interface Session {
    user: {
      id: string
      npk?: string
      email: string
      name?: string
      isAdmin: boolean
      roles: string[]
      divisionIds: number[]
      departmentIds: number[]
      divisionNames: string[]
      departmentNames: string[]
      status: "PENDING" | "APPROVED" | "REJECTED"
    }
  }

  interface User {
    id: string
    npk?: string
    email?: string
    name?: string
    isAdmin?: boolean
    roles?: string[]
    divisionIds?: number[]
    departmentIds?: number[]
    divisionNames?: string[]
    departmentNames?: string[]
    status?: "PENDING" | "APPROVED" | "REJECTED"
  }

  interface JWT {
    id?: string
    npk?: string
    email?: string
    name?: string
    isAdmin?: boolean
    roles?: string[]
    divisionIds?: number[]
    departmentIds?: number[]
    divisionNames?: string[]
    departmentNames?: string[]
    status?: "PENDING" | "APPROVED" | "REJECTED"
  }
}

export default {
  providers: [
    Keycloak({
      clientId: process.env.KEYCLOAK_CLIENT_ID!,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!,
      issuer: process.env.KEYCLOAK_ISSUER!,
      wellKnown: `${process.env.KEYCLOAK_ISSUER!}/.well-known/openid-configuration`,
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.id = profile?.sub
        token.email = profile?.email
        token.name = profile?.name
      }

      // Fetch user divisions and departments from portal API
      const email = token.email || profile?.email
      if (email && process.env.PORTAL_API_URL) {
        try {
          const response = await fetch(
            `${process.env.PORTAL_API_URL}/api/user/divisions-departments?email=${encodeURIComponent(email as string)}`,
            {
              headers: {
                "X-Auth-Token": process.env.INTERNAL_API_TOKEN || "",
              },
            }
          )

          if (response.ok) {
            const data = await response.json()
            token.npk = data.npk || undefined
            token.isAdmin = data.isAdmin || false
            token.roles = data.roles || []
            token.divisionIds = data.divisionIds || []
            token.departmentIds = data.departmentIds || []
            token.divisionNames = data.divisionNames || []
            token.departmentNames = data.departmentNames || []
            token.status = data.status || "APPROVED" // Default to approved if not specified
          } else {
            console.warn(`Failed to fetch divisions/departments: ${response.status}`)
            // Set defaults if fetch fails
            token.isAdmin = token.isAdmin || false
            token.roles = token.roles || []
            token.divisionIds = token.divisionIds || []
            token.departmentIds = token.departmentIds || []
            token.divisionNames = token.divisionNames || []
            token.departmentNames = token.departmentNames || []
            token.status = token.status || "APPROVED"
          }
        } catch (error) {
          console.error("Failed to fetch user divisions/departments:", error)
          // Preserve existing data if fetch fails
          token.isAdmin = token.isAdmin || false
          token.roles = token.roles || []
          token.divisionIds = token.divisionIds || []
          token.departmentIds = token.departmentIds || []
          token.divisionNames = token.divisionNames || []
          token.departmentNames = token.departmentNames || []
          token.status = token.status || "APPROVED"
        }
      }

      return token
    },

    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string
        session.user.npk = token.npk as string | undefined
        session.user.email = token.email as string
        session.user.name = token.name as string | undefined
        session.user.isAdmin = (token.isAdmin as boolean) || false
        session.user.roles = (token.roles as string[]) || []
        session.user.divisionIds = (token.divisionIds as number[]) || []
        session.user.departmentIds = (token.departmentIds as number[]) || []
        session.user.divisionNames = (token.divisionNames as string[]) || []
        session.user.departmentNames = (token.departmentNames as string[]) || []
        session.user.status = (token.status as "PENDING" | "APPROVED" | "REJECTED") || "APPROVED"

        // Ensure user exists in database (fire and forget)
        if (token.id && token.email && db) {
          db.insert(users)
            .values({
              id: token.id as string,
              email: token.email as string,
              name: (token.name as string) || null,
              npk: (token.npk as string) || null,
              status: token.status as "PENDING" | "APPROVED" | "REJECTED" || "APPROVED",
            })
            .onConflictDoUpdate({
              target: users.id,
              set: {
                email: token.email as string,
                name: (token.name as string) || null,
                npk: (token.npk as string) || null,
                updatedAt: new Date(),
              },
            })
            .catch((error) => {
              console.error("Failed to upsert user:", error)
            })
        }
      }

      return session
    },
  },
  pages: {
    signIn: "/login",
  },
} satisfies NextAuthConfig
