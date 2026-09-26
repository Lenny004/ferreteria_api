import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { signAccessToken } from "../src/shared/jwt.js";
import { authenticate } from "../src/middleware/authenticate.js";
import { authenticateShop } from "../src/middleware/authenticate-shop.js";
import { requireRole } from "../src/middleware/require-role.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import { loginRateLimiter } from "../src/middleware/rate-limit.js";
import { AppError } from "../src/shared/errors.js";
import { ZodError, z } from "zod";

const userId = "550e8400-e29b-41d4-a716-446655440000";

function responseMock() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    setHeader: vi.fn(),
    getHeader: vi.fn(),
    end: vi.fn(),
    headersSent: false,
  } as never;
}

describe("middleware de seguridad", () => {
  it("autentica Bearer, rechaza ausencia, token inválido y role SHOP", () => {
    const next = vi.fn();
    const valid = signAccessToken({ userId, role: "ADMIN" });
    const res = responseMock();
    authenticate({ headers: { authorization: `Bearer ${valid}` }, method: "GET", header: () => undefined } as never, res, next);
    expect(next).toHaveBeenCalledOnce();
    authenticate({ headers: {}, cookies: {}, method: "GET", header: () => undefined } as never, res, next);
    expect(res.statusCode).toBe(401);
    authenticate({ headers: { authorization: "Bearer invalid" }, method: "GET", header: () => undefined } as never, res, next);
    expect(res.statusCode).toBe(401);
    const shop = signAccessToken({ userId, role: "SHOP" });
    authenticate({ headers: { authorization: `Bearer ${shop}` }, method: "GET", header: () => undefined } as never, res, next);
    expect(res.statusCode).toBe(403);
  });

  it("autentica por cookie y exige CSRF en mutaciones", () => {
    const token = signAccessToken({ userId, role: "ADMIN" });
    const next = vi.fn();
    const res = responseMock();
    authenticate({ headers: {}, cookies: { fer_access: token }, method: "POST", header: () => undefined } as never, res, next);
    expect(res.statusCode).toBe(403);
    authenticate({ headers: {}, cookies: { fer_access: token }, method: "GET", header: () => undefined } as never, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("aplica el middleware SHOP y sus respuestas 401/403", () => {
    const next = vi.fn();
    const res = responseMock();
    authenticateShop({ headers: {}, cookies: {}, method: "GET", header: () => undefined } as never, res, next);
    expect(res.statusCode).toBe(401);
    const admin = signAccessToken({ userId, role: "ADMIN" });
    authenticateShop({ headers: { authorization: `Bearer ${admin}` }, method: "GET", header: () => undefined } as never, res, next);
    expect(res.statusCode).toBe(403);
    const shop = signAccessToken({ userId, role: "SHOP" });
    authenticateShop({ headers: { authorization: `Bearer ${shop}` }, method: "GET", header: () => undefined } as never, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("autoriza roles y bloquea rol ausente", () => {
    const res = responseMock();
    const next = vi.fn();
    requireRole("ADMIN")({ user: { userId, role: "SHOP" } } as never, res, next);
    expect(res.statusCode).toBe(403);
    requireRole("ADMIN")({ user: { userId, role: "ADMIN" } } as never, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("normaliza errores Zod, AppError, JSON inválido y desconocidos", () => {
    const res = responseMock();
    const next = vi.fn();
    errorHandler(new ZodError(z.string().safeParse(1).error?.issues ?? []), {} as never, res, next);
    expect(res.statusCode).toBe(400);
    errorHandler(new AppError("BUSINESS", "no", 422), {} as never, res, next);
    expect(res.statusCode).toBe(422);
    errorHandler({ type: "entity.parse.failed" }, {} as never, res, next);
    expect(res.statusCode).toBe(400);
    errorHandler(new Error("secret"), {} as never, res, next);
    expect(res.statusCode).toBe(500);
  });

  it("devuelve 429 con mensaje en español tras exceder el límite", async () => {
    // Se usa una app Express real con supertest: express-rate-limit valida req.ip y usa res.send.
    const app = express();
    app.post("/login", loginRateLimiter, (_req, res) => { res.json({ ok: true }); });
    let last = await request(app).post("/login");
    for (let i = 0; i < 10; i += 1) last = await request(app).post("/login");
    expect(last.status).toBe(429);
    expect(last.body.error).toBe("RATE_LIMITED");
    expect(last.body.message).toContain("Demasiados intentos");
    expect(last.headers["ratelimit-policy"] ?? last.headers["ratelimit"]).toBeDefined();
  });
});
