import request from "supertest";
import bcrypt from "bcryptjs";
import { beforeAll, describe, expect, it, vi } from "vitest";

const customerId = "650e8400-e29b-41d4-a716-446655440000";
const passwordHash = bcrypt.hashSync("password", 4);
const customer = {
  id: customerId,
  email: "cliente@example.com",
  passwordHash,
  fullName: "Cliente Tienda",
  phone: null,
  isActive: true,
  tokenVersion: 0,
  onboardingCompletedAt: null,
  lastLoginAt: null,
  createdAt: new Date("2025-01-01T00:00:00Z"),
  updatedAt: new Date("2025-01-01T00:00:00Z"),
};

const prismaMock = {
  shopCustomer: {
    findUnique: vi.fn().mockResolvedValue(customer),
    update: vi.fn().mockResolvedValue({ ...customer, tokenVersion: 1 }),
    updateMany: vi.fn(async ({ where }: { where: { id: string; tokenVersion: number } }) => {
      if (customer.id !== where.id || customer.tokenVersion !== where.tokenVersion) return { count: 0 };
      customer.tokenVersion += 1;
      return { count: 1 };
    }),
  },
};

vi.mock("../src/lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../src/lib/mail.js", () => ({
  buildPasswordResetEmail: vi.fn(),
  sendMail: vi.fn(),
}));

function cookieParts(response: { headers: Record<string, string[] | undefined> }): string[] {
  return ([] as string[]).concat(response.headers["set-cookie"] ?? []).map((cookie) => cookie.split(";")[0]);
}

function cookieValue(cookies: string[], name: string): string {
  const cookie = cookies.find((value) => value.startsWith(`${name}=`));
  return cookie?.slice(name.length + 1) ?? "";
}

describe("sesión de tienda", () => {
  // Precarga la app (Express + Prisma mockeado) una vez: la primera importación en frío
  // con cobertura puede superar el timeout por test; los tests siguen midiendo solo la petición.
  beforeAll(async () => {
    await import("../src/app.js");
  }, 30_000);

  it("login emite solo cookies de tienda y devuelve su CSRF", async () => {
    const { default: app } = await import("../src/app.js");
    const response = await request(app)
      .post("/api/v1/shop/auth/login")
      .send({ email: customer.email, password: "password" });

    const cookies = cookieParts(response);
    const csrf = cookieValue(cookies, "fer_shop_csrf");
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveProperty("accessToken");
    expect(response.body.data.csrfToken).toBe(csrf);
    expect(response.headers["set-cookie"]).toEqual(expect.arrayContaining([
      expect.stringContaining("fer_shop_access="),
      expect.stringContaining("fer_shop_csrf="),
      expect.stringContaining("Path=/api/v1/shop"),
    ]));
    expect(response.headers["set-cookie"]).not.toEqual(expect.arrayContaining([
      expect.stringContaining("fer_access="),
      expect.stringContaining("fer_csrf="),
    ]));
  });

  it("protege mutaciones por cookie y permite Bearer sin CSRF", async () => {
    const { default: app } = await import("../src/app.js");
    const login = await request(app)
      .post("/api/v1/shop/auth/login")
      .send({ email: customer.email, password: "password" });
    const cookies = cookieParts(login);
    const access = cookieValue(cookies, "fer_shop_access");
    const csrf = cookieValue(cookies, "fer_shop_csrf");

    const missingCsrf = await request(app)
      .post("/api/v1/shop/auth/change-password")
      .set("Cookie", [`fer_shop_access=${access}`, `fer_shop_csrf=${csrf}`])
      .send({ currentPassword: "password", newPassword: "password-nuevo" });
    expect(missingCsrf.status).toBe(403);
    expect(missingCsrf.body.error).toBe("CSRF_INVALID");

    const validCsrf = await request(app)
      .post("/api/v1/shop/auth/change-password")
      .set("Cookie", [`fer_shop_access=${access}`, `fer_shop_csrf=${csrf}`])
      .set("X-CSRF-Token", csrf)
      .send({ currentPassword: "password", newPassword: "password-nuevo" });
    expect(validCsrf.status).toBe(200);

    prismaMock.shopCustomer.findUnique.mockResolvedValueOnce({ ...customer, tokenVersion: 1 });
    const bearer = await request(app)
      .post("/api/v1/shop/auth/change-password")
      .set("Authorization", `Bearer ${validCsrf.body.data.accessToken}`)
      .send({ currentPassword: "password", newPassword: "password-nuevo" });
    expect(bearer.status).toBe(200);
  });

  it("rota CSRF, exige CSRF al cerrar por cookie e invalida el token", async () => {
    const { default: app } = await import("../src/app.js");
    const login = await request(app)
      .post("/api/v1/shop/auth/login")
      .send({ email: customer.email, password: "password" });
    const cookies = cookieParts(login);
    const access = cookieValue(cookies, "fer_shop_access");
    const csrf = cookieValue(cookies, "fer_shop_csrf");
    const cookieHeader = [`fer_shop_access=${access}`, `fer_shop_csrf=${csrf}`];

    const rotated = await request(app)
      .get("/api/v1/shop/auth/csrf")
      .set("Cookie", cookieHeader);
    expect(rotated.status).toBe(200);
    expect(rotated.body.data.csrfToken).not.toBe(csrf);
    expect(rotated.headers["set-cookie"]).toEqual(expect.arrayContaining([
      expect.stringContaining("fer_shop_csrf="),
      expect.stringContaining("Path=/api/v1/shop"),
    ]));

    const updatesBeforeRejected = prismaMock.shopCustomer.updateMany.mock.calls.length;
    const rejectedLogout = await request(app)
      .post("/api/v1/shop/auth/logout")
      .set("Cookie", cookieHeader);

    expect(rejectedLogout.status).toBe(403);
    expect(rejectedLogout.body.error).toBe("CSRF_INVALID");
    expect(prismaMock.shopCustomer.updateMany).toHaveBeenCalledTimes(updatesBeforeRejected);

    const rotatedCsrf = rotated.body.data.csrfToken as string;
    const logout = await request(app)
      .post("/api/v1/shop/auth/logout")
      .set("Cookie", [`fer_shop_access=${access}`, `fer_shop_csrf=${rotatedCsrf}`])
      .set("X-CSRF-Token", rotatedCsrf);
    expect(logout.status).toBe(200);
    expect(logout.body.data).toEqual({ loggedOut: true });
    expect(logout.headers["set-cookie"]).toEqual(expect.arrayContaining([
      expect.stringContaining("fer_shop_access=;"),
      expect.stringContaining("fer_shop_csrf=;"),
    ]));
    const invalidated = await request(app)
      .get("/api/v1/shop/auth/me")
      .set("Authorization", `Bearer ${access}`);
    expect(invalidated.status).toBe(401);

    const updatesBeforeObsolete = prismaMock.shopCustomer.updateMany.mock.calls.length;
    const obsoleteLogout = await request(app)
      .post("/api/v1/shop/auth/logout")
      .set("Cookie", [`fer_shop_access=${access}`]);
    expect(obsoleteLogout.status).toBe(200);
    expect(obsoleteLogout.body.data).toEqual({ loggedOut: true });
    expect(prismaMock.shopCustomer.updateMany).toHaveBeenCalledTimes(updatesBeforeObsolete);
  });

  it("logout sin token o con token inválido no consulta la BD", async () => {
    const { default: app } = await import("../src/app.js");
    const before = prismaMock.shopCustomer.updateMany.mock.calls.length;
    const withoutToken = await request(app).post("/api/v1/shop/auth/logout");
    const invalid = await request(app)
      .post("/api/v1/shop/auth/logout")
      .set("Authorization", "Bearer token-invalido");
    expect(withoutToken.status).toBe(200);
    expect(invalid.status).toBe(200);
    expect(prismaMock.shopCustomer.updateMany).toHaveBeenCalledTimes(before);
  });
});
