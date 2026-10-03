import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { signAccessToken } from "../src/shared/jwt.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";
const orderId = "650e8400-e29b-41d4-a716-446655440000";
const receiveMock = vi.fn().mockResolvedValue({ id: orderId, status: "RECIBIDA", receivedById: null });
const createMock = vi.fn().mockResolvedValue({ id: orderId, status: "BORRADOR" });

const prismaMock = {
  webUser: {
    findUnique: vi.fn().mockResolvedValue({ isActive: true, role: "ADMIN", tokenVersion: 0 }),
  },
};

vi.mock("../src/lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../src/modules/purchasing/purchase-orders.service.js", () => ({
  purchaseOrdersService: {
    receive: receiveMock,
    create: createMock,
  },
}));

describe("recepción de órdenes de compra", () => {
  let app: typeof import("../src/app.js").default;

  beforeAll(async () => {
    ({ default: app } = await import("../src/app.js"));
  });

  beforeEach(() => vi.clearAllMocks());

  it("ignora receivedById enviado por el cliente", async () => {
    const response = await request(app)
      .post(`/api/v1/purchase-orders/${orderId}/receive`)
      .set("Authorization", `Bearer ${signAccessToken({ userId, role: "ADMIN", tv: 0 })}`)
      .send({ receivedById: "750e8400-e29b-41d4-a716-446655440000" });

    expect(response.status).toBe(200);
    expect(receiveMock).toHaveBeenCalledWith(orderId, {}, userId);
  });

  it("ignora employeeId enviado por el cliente y usa el usuario autenticado", async () => {
    const supplierId = "750e8400-e29b-41d4-a716-446655440000";
    const productId = "850e8400-e29b-41d4-a716-446655440000";
    const response = await request(app)
      .post("/api/v1/purchase-orders")
      .set("Authorization", `Bearer ${signAccessToken({ userId, role: "ADMIN", tv: 0 })}`)
      .send({
        supplierId,
        employeeId: "950e8400-e29b-41d4-a716-446655440000",
        lines: [{ productId, quantity: 1, unitCost: 2 }],
      });

    expect(response.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith({
      supplierId,
      lines: [{ productId, quantity: 1, unitCost: 2 }],
    }, userId);
  });
});
