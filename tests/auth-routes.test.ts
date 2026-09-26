import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../src/app.js";
import { signAccessToken } from "../src/shared/jwt.js";

describe("rutas de sesión", () => {
  const token = signAccessToken({ userId: "550e8400-e29b-41d4-a716-446655440000", role: "ADMIN" });

  it("permite renovar CSRF usando Bearer sin exigir CSRF", async () => {
    const response = await request(app)
      .get("/api/v1/auth/csrf")
      .set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
  });

  it("rechaza una mutación con cookie sin cabecera CSRF", async () => {
    const response = await request(app)
      .post("/api/v1/auth/change-password")
      .set("Cookie", `fer_access=${token}`)
      .send({ currentPassword: "a", newPassword: "password-seguro" });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("CSRF_INVALID");
  });
});
