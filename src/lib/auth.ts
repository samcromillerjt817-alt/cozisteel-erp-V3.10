import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"

async function ensureDefaultAdminUser() {
  const existingUsers = await db.user.count()
  if (existingUsers > 0) return null

  const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || "cozisteel2024"
  const hashedPassword = await bcrypt.hash(defaultPassword, 10)

  return db.user.create({
    data: {
      username: "admin",
      name: "Administrador",
      email: "admin@cozisteel.com.br",
      password: hashedPassword,
      role: "admin",
      active: true,
    },
  })
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: { username: { label: "Usuario", type: "text" }, password: { label: "Senha", type: "password" } },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null

        const normalizedUsername = credentials.username.trim()
        const password = credentials.password

        let user = await db.user.findUnique({ where: { username: normalizedUsername } })
        if (!user && normalizedUsername.toLowerCase() === "admin") {
          user = await ensureDefaultAdminUser()
        }

        if (!user || !user.active) return null

        const valid = await bcrypt.compare(password, user.password)
        if (!valid) return null

        return { id: user.id, name: user.name, email: user.email, role: user.role }
      }
    })
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as unknown as Record<string, unknown>).id as string
        token.role = (user as unknown as Record<string, unknown>).role as string
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as Record<string, unknown>).id = token.id as unknown
        (session.user as Record<string, unknown>).role = token.role as unknown
      }
      return session
    }
  },
  pages: { signIn: "/" },
  secret: process.env.NEXTAUTH_SECRET,
}