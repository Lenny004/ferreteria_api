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
