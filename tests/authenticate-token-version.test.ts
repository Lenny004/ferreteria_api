import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { signAccessToken } from "../src/shared/jwt.js";
import { authenticate } from "../src/middleware/authenticate.js";
import { authenticateShop } from "../src/middleware/authenticate-shop.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";

/** Crea un JWT legado sin `tv` para verificar que el middleware lo invalida. */
function signLegacyToken(): string {
  return jwt.sign({ userId, role: "ADMIN" }, process.env.JWT_SECRET!, { expiresIn: "8h" });
}
const prismaMock = vi.hoisted(() => ({
  webUser: { findUnique: vi.fn() },
  shopCustomer: { findUnique: vi.fn() },
}));
vi.mock("../src/lib/prisma.js", () => ({ prisma: prismaMock }));

function responseMock() {
  const response = {
    statusCode: 200,
    status(code: number) { this.statusCode = code; return this; },
    json() { return this; },
  };
  return response as never;
}

describe("revocación de tokens por versión y estado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.webUser.findUnique.mockResolvedValue({ isActive: true, role: "ADMIN", tokenVersion: 3 });
    prismaMock.shopCustomer.findUnique.mockResolvedValue({ isActive: true, tokenVersion: 2 });
  });

  it("acepta panel activo y rechaza rol, versión, tv ausente y usuario borrado", async () => {
    const next = vi.fn();
    await authenticate({ headers: { authorization: `Bearer ${signAccessToken({ userId, role: "ADMIN", tv: 3 })}` }, method: "GET", header: () => undefined } as never, responseMock(), next);
    expect(next).toHaveBeenCalledOnce();

    const roleResponse = responseMock();
    prismaMock.webUser.findUnique.mockResolvedValueOnce({ isActive: true, role: "ACCOUNTANT", tokenVersion: 3 });
    await authenticate({ headers: { authorization: `Bearer ${signAccessToken({ userId, role: "ADMIN", tv: 3 })}` }, method: "GET", header: () => undefined } as never, roleResponse, vi.fn());
    expect((roleResponse as { statusCode: number }).statusCode).toBe(401);

    const inactiveResponse = responseMock();
    prismaMock.webUser.findUnique.mockResolvedValueOnce({ isActive: false, role: "ADMIN", tokenVersion: 3 });
    await authenticate({ headers: { authorization: `Bearer ${signAccessToken({ userId, role: "ADMIN", tv: 3 })}` }, method: "GET", header: () => undefined } as never, inactiveResponse, vi.fn());
    expect((inactiveResponse as { statusCode: number }).statusCode).toBe(401);

    const oldResponse = responseMock();
    prismaMock.webUser.findUnique.mockResolvedValueOnce({ isActive: true, role: "ADMIN", tokenVersion: 4 });
    await authenticate({ headers: { authorization: `Bearer ${signAccessToken({ userId, role: "ADMIN", tv: 3 })}` }, method: "GET", header: () => undefined } as never, oldResponse, vi.fn());
    expect((oldResponse as { statusCode: number }).statusCode).toBe(401);

    const noTvResponse = responseMock();
    await authenticate({ headers: { authorization: `Bearer ${signLegacyToken()}` }, method: "GET", header: () => undefined } as never, noTvResponse, vi.fn());
    expect((noTvResponse as { statusCode: number }).statusCode).toBe(401);

    const deletedResponse = responseMock();
    prismaMock.webUser.findUnique.mockResolvedValueOnce(null);
    await authenticate({ headers: { authorization: `Bearer ${signAccessToken({ userId, role: "ADMIN", tv: 3 })}` }, method: "GET", header: () => undefined } as never, deletedResponse, vi.fn());
    expect((deletedResponse as { statusCode: number }).statusCode).toBe(401);
  });

  it("aplica las mismas reglas a clientes de tienda", async () => {
    const next = vi.fn();
    await authenticateShop({ headers: { authorization: `Bearer ${signAccessToken({ userId, role: "SHOP", tv: 2 })}` }, method: "GET", header: () => undefined } as never, responseMock(), next);
    expect(next).toHaveBeenCalledOnce();

    const response = responseMock();
    prismaMock.shopCustomer.findUnique.mockResolvedValueOnce({ isActive: true, tokenVersion: 3 });
    await authenticateShop({ headers: { authorization: `Bearer ${signAccessToken({ userId, role: "SHOP", tv: 2 })}` }, method: "GET", header: () => undefined } as never, response, vi.fn());
    expect((response as { statusCode: number }).statusCode).toBe(401);
  });
});
