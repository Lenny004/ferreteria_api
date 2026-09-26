export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AppError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "No autorizado") {
    super("UNAUTHORIZED", message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Sin permisos") {
    super("FORBIDDEN", message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Recurso no encontrado") {
    super("NOT_FOUND", message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message = "El recurso ya existe") {
    super("CONFLICT", message, 409);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message, 400);
  }
}
