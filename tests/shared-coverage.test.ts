import { describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { jsonSuccess, jsonSuccessEmpty } from "../src/shared/api-response.js";
import {
  accessCookieMaxAge,
  clearAuthCookies,
  createCsrfToken,
  isValidCsrfToken,
  setAuthCookies,
  setCsrfCookie,
} from "../src/shared/cookies.js";
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../src/shared/errors.js";
import { loadEnv } from "../src/config/env.js";
import { parsePaginationQuery, parseParams, parseUuidParam, uuidParam } from "../src/shared/validation.js";

function responseMock() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    cookie: vi.fn().mockReturnThis(),
    clearCookie: vi.fn().mockReturnThis(),
  } as never;
}

describe("shared: respuestas, cookies, errores y entorno", () => {
  const userId = "550e8400-e29b-41d4-a716-446655440000";

  it("construye respuestas exitosas con y sin datos", () => {
    const res = responseMock();
    jsonSuccess(res, { ok: true }, 201);
    jsonSuccessEmpty(res, 204);
    expect(res.status).toHaveBeenNthCalledWith(1, 201);
    expect(res.status).toHaveBeenNthCalledWith(2, 204);
  });

  it("valida CSRF, rechaza formato y tokens cruzados", () => {
    const token = createCsrfToken(userId);
    expect(isValidCsrfToken(token, token, userId)).toBe(true);
    expect(isValidCsrfToken(token, undefined, userId)).toBe(false);
    expect(isValidCsrfToken(token, `${token}x`, userId)).toBe(false);
    expect(isValidCsrfToken(token, "bad", userId)).toBe(false);
    expect(isValidCsrfToken(token, token, "650e8400-e29b-41d4-a716-446655440000")).toBe(false);
  });

  it("emite y limpia cookies con maxAge derivado del JWT", () => {
    const token = jwt.sign({ userId, role: "ADMIN" }, process.env.JWT_SECRET!, { expiresIn: "1h" });
    const res = responseMock();
    expect(accessCookieMaxAge(token)).toBeGreaterThan(0);
    setAuthCookies(res, token);
    setCsrfCookie(res, userId, 1000);
    clearAuthCookies(res);
    expect(res.cookie).toHaveBeenCalledWith("fer_access", token, expect.objectContaining({ httpOnly: true }));
    expect(res.cookie).toHaveBeenCalledWith("fer_csrf", expect.any(String), expect.objectContaining({ httpOnly: false }));
    expect(res.clearCookie).toHaveBeenCalledTimes(2);
    expect(() => accessCookieMaxAge("not-a-jwt")).toThrow();
  });

  it("expone la jerarquía de errores de API", () => {
    expect(new AppError("X", "x").statusCode).toBe(500);
    expect(new UnauthorizedError().code).toBe("UNAUTHORIZED");
    expect(new ForbiddenError().statusCode).toBe(403);
    expect(new NotFoundError().statusCode).toBe(404);
    expect(new ConflictError().statusCode).toBe(409);
    expect(new BadRequestError("x").statusCode).toBe(400);
  });

  it("rechaza configuración inválida y secreto de ejemplo en producción", () => {
    const base = {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
      JWT_SECRET: "12345678901234567890123456789012",
      CORS_ORIGIN: "http://localhost:3000",
    };
    expect(loadEnv(base).COOKIE_SAMESITE).toBe("lax");
    expect(() => loadEnv({ ...base, DATABASE_URL: "bad" })).toThrow();
    expect(() => loadEnv({ ...base, CORS_ORIGIN: "javascript:bad" })).toThrow();
    expect(() => loadEnv({ ...base, NODE_ENV: "production", JWT_SECRET: "cambiar-en-produccion-123456789012345" })).toThrow();
  });

  it("aplica schemas estrictos y paginación acotada", () => {
    expect(parsePaginationQuery({})).toEqual({ page: 1, pageSize: 20 });
    expect(parseUuidParam({ id: userId })).toEqual({ id: userId });
    expect(parseParams(uuidParam, { id: userId })).toEqual({ id: userId });
    expect(() => parseParams(uuidParam, { id: userId, extra: true })).toThrow();
    expect(() => parsePaginationQuery({ page: 0 })).toThrow();
  });
});
