/**
 * Jerarquía de errores de aplicación con código HTTP y código de error API.
 * Usar subclases en servicios; el error-handler las serializa a JSON.
 */

/** Error base con `code`, `message` y `statusCode` para respuestas API. */
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

/** 401 — Sesión ausente, token inválido o credenciales incorrectas. */
export class UnauthorizedError extends AppError {
  constructor(message = "No autorizado") {
    super("UNAUTHORIZED", message, 401);
  }
}

/** 403 — Usuario autenticado sin permiso para la operación. */
export class ForbiddenError extends AppError {
  constructor(message = "Sin permisos") {
    super("FORBIDDEN", message, 403);
  }
}

/** 404 — Recurso solicitado no existe. */
export class NotFoundError extends AppError {
  constructor(message = "Recurso no encontrado") {
    super("NOT_FOUND", message, 404);
  }
}

/** 409 — Conflicto de unicidad o estado incompatible (p. ej. email duplicado). */
export class ConflictError extends AppError {
  constructor(message = "El recurso ya existe") {
    super("CONFLICT", message, 409);
  }
}

/** 400 — Validación de negocio o entrada inválida. */
export class BadRequestError extends AppError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message, 400);
  }
}
