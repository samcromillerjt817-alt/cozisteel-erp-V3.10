import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"

// ADR-027 — bloqueio de conta por força bruta (por username, sobrevive a restart do PM2 porque
// fica no banco, não em memória — complementa o rate limit por IP do middleware, que sozinho não
// pega um atacante trocando de IP).
const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_MINUTES = 15

async function ensureDefaultAdminUser() {
  const existingUsers = await db.user.count()
  if (existingUsers > 0) return null

  // ADR-027 — a senha padrão hardcoded ("cozisteel2024") ficou insegura no momento em que o sistema
  // passou a ser exposto publicamente: qualquer um acessando a tela de login poderia, em teoria,
  // provocar esse bootstrap (só dispara se a tabela de usuários estiver vazia, mas não custa nada
  // fechar). Agora exige `DEFAULT_ADMIN_PASSWORD` explicitamente configurado — sem valor no ambiente,
  // o bootstrap simplesmente não cria ninguém, em vez de cair num valor padrão adivinhável.
  const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD
  if (!defaultPassword) return null

  const hashedPassword = await bcrypt.hash(defaultPassword, 10)

  return db.user.create({
    data: {
      username: "admin",
      name: "Administrador",
      email: "admin@mobsteel.com.br",
      password: hashedPassword,
      role: "admin",
      active: true,
    },
  })
}

/**
 * Núcleo do login, extraído do callback `authorize` do NextAuth pra ser testável diretamente (o
 * `CredentialsProvider` não expõe essa função de nenhum outro jeito). Devolve `null` pra QUALQUER
 * falha (usuário inexistente, inativo, bloqueado, ou senha errada) — nunca diferencia o motivo pra
 * quem chama, de propósito (ADR-027): diferenciar a mensagem seria um jeito de confirmar se um
 * username existe ou está bloqueado.
 */
export async function authorizeCredentials(
  username: string | undefined,
  password: string | undefined
): Promise<{ id: string; name: string; email: string; role: string } | null> {
  if (!username || !password) return null

  const normalizedUsername = username.trim()

  let user = await db.user.findUnique({ where: { username: normalizedUsername } })
  if (!user && normalizedUsername.toLowerCase() === "admin") {
    user = await ensureDefaultAdminUser()
  }

  if (!user || !user.active) return null

  // Conta bloqueada — falha silenciosamente igual a senha errada (nunca revela que a conta existe
  // e está bloqueada, pra não virar um jeito de confirmar username válido).
  if (user.lockedUntil && user.lockedUntil > new Date()) return null

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) {
    const attempts = user.failedLoginAttempts + 1
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: shouldLock ? 0 : attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : user.lockedUntil,
      },
    })
    return null
  }

  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await db.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } })
  }

  return { id: user.id, name: user.name, email: user.email, role: user.role }
}

// Auditoria de segurança (2ª rodada) — antes, o cookie ficar `Secure` dependia só do NextAuth
// interpretar corretamente o protocolo de `NEXTAUTH_URL` (que num deploy real chegou a ficar
// configurado como `http://<ip-interno>` por engano, derrubando a proteção de todos os cookies,
// inclusive o de sessão). Agora é explícito e não depende de mais nada além de `APP_ENV` estar
// certo — o mesmo valor que já governa o bloqueio de `/dev/*` em `src/middleware.ts`. Em dev
// (`APP_ENV` ausente/`development`), continua `false` — cookie sem `Secure` funciona normalmente
// por HTTP local.
const isProductionDeploy = process.env.APP_ENV === "production"

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: { username: { label: "Usuario", type: "text" }, password: { label: "Senha", type: "password" } },
      authorize: (credentials) => authorizeCredentials(credentials?.username, credentials?.password),
    })
  ],
  useSecureCookies: isProductionDeploy,
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