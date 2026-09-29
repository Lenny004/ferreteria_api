import request from "supertest";
import bcrypt from "bcryptjs";
import { beforeAll, describe, expect, it, vi } from "vitest";

const userId = "550e8400-e29b-41d4-a716-446655440000";
const passwordHash = bcrypt.hashSync("password", 4); // coste bajo solo en el fixture: evita timeouts en frio sin cambiar la logica
const user = {
  id: userId,
  username: "admin",
  email: "admin@example.com",
  passwordHash,
  role: "ADMIN",
  employeeId: null,
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date("2025-01-01T00:00:00Z"),
  updatedAt: new Date("2025-01-01T00:00:00Z"),
};

const prismaMock = {
  webUser: {
    findFirst: vi.fn().mockResolvedValue(user),
    findUnique: vi.fn().mockResolvedValue(user),
    update: vi.fn().mockResolvedValue(user),
  },
  employee: {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
  },
};

vi.mock("../src/lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../src/lib/mail.js", () => ({
  buildPasswordResetEmail: vi.fn(),
  sendMail: vi.fn(),
}));

describe("contrato de autenticación del panel", () => {
  // Precarga la app (Express + Prisma mockeado) una vez: la primera importación en frío
  // con cobertura puede superar el timeout por test; los tests siguen midiendo solo la petición.
  beforeAll(async () => {
    await import("../src/app.js");
  }, 30_000);

  it("login devuelve cuerpo intacto y cookies fer_access/fer_csrf seguras", async () => {
    const { default: app } = await import("../src/app.js");
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ login: "admin", password: "password" });

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveProperty("accessToken");
    const cookies = ([] as string[]).concat(response.headers["set-cookie"] ?? []);
    const csrfCookie = cookies.find((c) => c.startsWith("fer_csrf="))?.split(";")[0].slice("fer_csrf=".length);
    // El panel en otro origen usa el token del cuerpo; debe coincidir con la cookie double-submit.
    expect(response.body.data.csrfToken).toBe(csrfCookie);
    expect(response.body.data.user).toMatchObject({ id: userId, username: "admin", role: "ADMIN" });
    expect(response.headers["set-cookie"]).toEqual(expect.arrayContaining([
      expect.stringContaining("fer_access="),
      expect.stringContaining("fer_csrf="),
    ]));
  });

  it("logout limpia ambas cookies y csrf/me respetan el token", async () => {
    const { default: app } = await import("../src/app.js");
    const login = await request(app).post("/api/v1/auth/login").send({ login: "admin", password: "password" });
    const token = login.body.data.accessToken;
    const csrf = await request(app).get("/api/v1/auth/csrf").set("Authorization", `Bearer ${token}`);
    const me = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${token}`);
    const logout = await request(app).post("/api/v1/auth/logout");
    expect(csrf.status).toBe(200);
    expect(csrf.body.data.csrfToken).toMatch(/^[a-f0-9]{64}\.[a-f0-9]{64}$/);
    expect(me.status).toBe(200);
    expect(me.body.data).toMatchObject({ id: userId, username: "admin" });
    expect(logout.status).toBe(200);
    expect(logout.headers["set-cookie"]).toEqual(expect.arrayContaining([
      expect.stringContaining("fer_access=;"),
      expect.stringContaining("fer_csrf=;"),
    ]));
  });

  it("ruta protegida por requireRole permite ADMIN y usa Prisma mockeado", async () => {
    const { default: app } = await import("../src/app.js");
    const login = await request(app).post("/api/v1/auth/login").send({ login: "admin", password: "password" });
    const response = await request(app)
      .get("/api/v1/employees")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`);
    expect(response.status).toBe(200);
    expect(prismaMock.employee.findMany).toHaveBeenCalled();
    expect(prismaMock.employee.count).toHaveBeenCalled();
  });
});
