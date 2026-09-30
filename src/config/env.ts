import { z } from "zod";
import { DEFAULT_BUSINESS_TZ, isValidTimeZone } from "../shared/business-time.js";

const booleanFromString = z.enum(["true", "false"]).transform((value) => value === "true");
const sameSite = z.enum(["lax", "strict", "none"]).default("lax");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().min(1).refine((value) => value.split(",").every((origin) => {
    try {
      const parsed = new URL(origin.trim());
      return ["http:", "https:"].includes(parsed.protocol) && parsed.origin === origin.trim();
    } catch {
      return false;
    }
  }), "CORS_ORIGIN debe ser una lista de orígenes HTTP(S) válidos"),
  COOKIE_DOMAIN: z.string().min(1).optional(),
  COOKIE_SECURE: booleanFromString.default("false"),
  COOKIE_SAMESITE: sameSite,
  EXPOSE_RESET_TOKEN_IN_DEV: booleanFromString.default("false"),
  BUSINESS_TZ: z
    .string()
    .trim()
    .min(1)
    .default(DEFAULT_BUSINESS_TZ)
    .refine(isValidTimeZone, "BUSINESS_TZ debe ser una zona horaria IANA válida (ej. America/El_Salvador)"),
});

/** Configuración validada del proceso; evita arrancar con secretos o URLs ambiguas. */
export type AppEnv = z.infer<typeof envSchema>;

/** Valida las variables obligatorias y rechaza el secreto de ejemplo en producción. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = envSchema.parse(source);
  if (parsed.NODE_ENV === "production" && parsed.JWT_SECRET.includes("cambiar-en-produccion")) {
    throw new Error("JWT_SECRET de ejemplo no es válido en producción");
  }
  return parsed;
}

/** Devuelve la configuración validada del proceso para consumidores de infraestructura. */
export function getEnv(): AppEnv {
  return loadEnv();
}
