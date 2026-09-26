import { describe, expect, it } from "vitest";
import { signAccessToken, verifyAccessToken } from "../src/shared/jwt.js";
import { createCsrfToken, isValidCsrfToken } from "../src/shared/cookies.js";
import { requireRole } from "../src/middleware/require-role.js";

describe("seguridad compartida", () => {
  const userId = "550e8400-e29b-41d4-a716-446655440000";

  it("firma y verifica JWT con rol", () => {
    const token = signAccessToken({ userId, role: "ADMIN" });
    expect(verifyAccessToken(token)).toMatchObject({ userId, role: "ADMIN" });
  });

  it("liga CSRF al usuario y rechaza otra sesión", () => {
    const token = createCsrfToken(userId);
    expect(isValidCsrfToken(token, token, userId)).toBe(true);
    expect(isValidCsrfToken(token, token, "650e8400-e29b-41d4-a716-446655440000")).toBe(false);
  });

  it("aplica autorización por rol", () => {
    const next = () => undefined;
    const res = { status: () => res, json: () => undefined } as never;
    const middleware = requireRole("ADMIN");
    middleware({ user: { userId, role: "SHOP" } } as never, res, next);
    middleware({ user: { userId, role: "ADMIN" } } as never, res, next);
  });
});
