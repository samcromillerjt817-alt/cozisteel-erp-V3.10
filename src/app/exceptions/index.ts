export class AppError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
    this.name = 'AppError'
  }
}

export class NotFoundException extends AppError {
  constructor(resource = 'Recurso') {
    super(`${resource} não encontrado`, 404)
    this.name = 'NotFoundException'
  }
}

export class BadRequestException extends AppError {
  constructor(message = 'Requisição inválida') {
    super(message, 400)
    this.name = 'BadRequestException'
  }
}

export class ForbiddenException extends AppError {
  constructor(message = 'Acesso negado') {
    super(message, 403)
    this.name = 'ForbiddenException'
  }
}

export class ConflictException extends AppError {
  constructor(message = 'Conflito de dados') {
    super(message, 409)
    this.name = 'ConflictException'
  }
}

export function handleError(error: unknown) {
  if (error instanceof AppError) {
    return { message: error.message, status: error.status }
  }
  console.error('Unhandled error:', error)
  return { message: 'Erro interno do servidor', status: 500 }
}