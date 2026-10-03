import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError } from "../src/shared/errors.js";
import { signAccessToken } from "../src/shared/jwt.js";

const customerId = "650e8400-e29b-41d4-a716-446655440000";
const otherCustomerId = "750e8400-e29b-41d4-a716-446655440000";
const orderId = "850e8400-e29b-41d4-a716-446655440000";

const prismaMock = {
  shopCustomer: {
    findUnique: vi.fn().mockResolvedValue({ isActive: true, tokenVersion: 0 }),
  },
};
const submitTransferReferenceMock = vi.fn();

vi.mock("../src/lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../src/modules/shop-orders/shop-orders.service.js", () => ({
  shopOrdersService: {
    submitTransferReference: submitTransferReferenceMock,
  },
}));

describe("referencia de transferencia del cliente", () => {
  let app: typeof import("../src/app.js").default;

  beforeAll(async () => {
    ({ default: app } = await import("../src/app.js"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    submitTransferReferenceMock.mockResolvedValue({ id: orderId, paymentStatus: "EN_VERIFICACION" });
  });

  it("permite al dueño enviar referencia y deja el pago en verificación", async () => {
    const response = await request(app)
      .post(`/api/v1/shop/orders/${orderId}/transfer-reference`)
      .set("Authorization", `Bearer ${signAccessToken({ userId: customerId, role: "SHOP", tv: 0 })}`)
      .send({ reference: "TRF-123", notes: "Banco QA" });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ paymentStatus: "EN_VERIFICACION" });
    expect(submitTransferReferenceMock).toHaveBeenCalledWith(customerId, orderId, {
      reference: "TRF-123",
      notes: "Banco QA",
    });
  });

  it("propaga 404 si el pedido no pertenece al cliente", async () => {
    submitTransferReferenceMock.mockRejectedValueOnce(new NotFoundError("Pedido no encontrado"));
    const response = await request(app)
      .post(`/api/v1/shop/orders/${orderId}/transfer-reference`)
      .set("Authorization", `Bearer ${signAccessToken({ userId: otherCustomerId, role: "SHOP", tv: 0 })}`)
      .send({ reference: "TRF-123" });

    expect(response.status).toBe(404);
  });

  it.each([
    "El pedido no usa transferencia bancaria",
    "El estado de pago del pedido no permite registrar una referencia",
  ])("propaga 409 para una precondición inválida: %s", async (message) => {
    submitTransferReferenceMock.mockRejectedValueOnce(new ConflictError(message));
    const response = await request(app)
      .post(`/api/v1/shop/orders/${orderId}/transfer-reference`)
      .set("Authorization", `Bearer ${signAccessToken({ userId: customerId, role: "SHOP", tv: 0 })}`)
      .send({ reference: "TRF-123" });

    expect(response.status).toBe(409);
  });

  it("no permite que el endpoint cliente marque el pedido como PAGADO", async () => {
    submitTransferReferenceMock.mockResolvedValueOnce({ id: orderId, paymentStatus: "EN_VERIFICACION" });
    const response = await request(app)
      .post(`/api/v1/shop/orders/${orderId}/transfer-reference`)
      .set("Authorization", `Bearer ${signAccessToken({ userId: customerId, role: "SHOP", tv: 0 })}`)
      .send({ reference: "TRF-123" });

    expect(response.status).toBe(200);
    expect(response.body.data.paymentStatus).not.toBe("PAGADO");
  });
});
