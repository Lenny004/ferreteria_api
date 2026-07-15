/**
 * Rate limiters por ruta (fuerza bruta / abuso).
 */

import rateLimit from "express-rate-limit";

/** POST /auth/login — 10 intentos / 15 min por IP. */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "RATE_LIMITED",
    message: "Demasiados intentos de inicio de sesión. Espera 15 minutos e inténtalo de nuevo.",
  },
});

/** Limita spam del formulario Contáctanos (por IP). */
export const contactRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "RATE_LIMIT",
    message: "Demasiados mensajes. Intenta de nuevo en unos minutos.",
  },
});

/** Limita solicitudes de recuperación de contraseña. */
export const forgotPasswordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "RATE_LIMIT",
    message: "Demasiados intentos. Intenta de nuevo en unos minutos.",
  },
});
