import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { hasPermission, type Module, type Action } from '@/app/middleware/rbac'

export interface SessionUser {
  id: string
  name: string
  email?: string | null
  role: string
}

export async function getAuthSession(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  return session.user as unknown as SessionUser
}

export async function requireAuth(): Promise<SessionUser> {
  const user = await getAuthSession()
  if (!user) {
    throw new UnauthorizedError()
  }
  return user
}

export async function requireRole(...roles: string[]): Promise<SessionUser> {
  const user = await requireAuth()
  if (!roles.includes(user.role)) {
    throw new ForbiddenError('Você não tem permissão para realizar esta ação')
  }
  return user
}

export function checkPermission(user: SessionUser, module: Module, action: Action): boolean {
  return hasPermission(user.role, module, action)
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
}

export function forbidden(message = 'Acesso negado'): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 })
}

export function notFound(message = 'Recurso não encontrado'): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 })
}

export function badRequest(message = 'Requisição inválida'): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 })
}

export function conflict(message = 'Conflito de dados'): NextResponse {
  return NextResponse.json({ error: message }, { status: 409 })
}

export function ok(data: unknown) {
  return NextResponse.json(data)
}

export function created(data: unknown) {
  return NextResponse.json(data, { status: 201 })
}

export function noContent() {
  return new NextResponse(null, { status: 204 })
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Não autorizado')
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Acesso negado') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export function parsePagination(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20))
  return { page, limit }
}