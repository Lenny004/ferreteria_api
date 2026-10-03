import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError } from "../src/shared/errors.js";

const orderId = "850e8400-e29b-41d4-a716-446655440000";
const webUserId = "950e8400-e29b-41d4-a716-446655440000";
const referenceAt = new Date("2026-01-15T12:00:00.000Z");

const prismaMock = {
  $transaction: vi.fn(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock)),
  $queryRaw: vi.fn().mockResolvedValue([]),
  shopOrder: {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue({ id: orderId, paymentStatus: "PAGADO" }),
  },
  shopPayment: {
    update: vi.fn(),
    create: vi.fn(),
  },
};

vi.mock("../src/lib/prisma.js", () => ({ prisma: prismaMock }));

const { shopPaymentsService } = await import("../src/modules/shop-payments/shop-payments.service.js");

/** Devuelve un pedido con el pago pendiente que verá el personal en el panel. */
function pendingOrder(customerReference: string | null) {
  return {
    id: orderId,
    paymentStatus: "EN_VERIFICACION",
    status: "PENDIENTE",
    paymentMethod: "TRANSFERENCIA",
    total: new Prisma.Decimal("10.00"),
    payments: [{
      id: "a50e8400-e29b-41d4-a716-446655440000",
      method: "TRANSFERENCIA",
      amount: new Prisma.Decimal("10.00"),
      status: "PENDIENTE",
      providerRef: null,
      customerReference,
      customerReferenceAt: customerReference ? referenceAt : null,
      notes: null,
    }],
  };
}

describe("confirmación de pagos con referencia observada", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.shopOrder.findUnique.mockResolvedValue(pendingOrder("REF-A"));
    prismaMock.shopPayment.update.mockResolvedValue({});
  });

  it("confirma cuando coinciden referencia y fecha, conservando la referencia", async () => {
    await shopPaymentsService.payOrder(orderId, {
      expectedCustomerReference: " REF-A ",
      expectedCustomerReferenceAt: referenceAt.toISOString(),
    }, webUserId);

    const updateData = prismaMock.shopPayment.update.mock.calls[0][0].data;
    expect(updateData.providerRef).toBe("REF-A");
    expect(updateData).not.toHaveProperty("customerReference");
  });

  it.each([
    { expectedCustomerReference: "REF-B", expectedCustomerReferenceAt: referenceAt.toISOString() },
    { expectedCustomerReference: null, expectedCustomerReferenceAt: null },
  ])("rechaza una referencia almacenada que no coincide: %o", async (data) => {
    await expect(shopPaymentsService.payOrder(orderId, data, webUserId))
      .rejects.toBeInstanceOf(ConflictError);
    expect(prismaMock.shopPayment.update).not.toHaveBeenCalled();
  });

  it("confirma sin expected cuando el pago no tiene referencia", async () => {
    prismaMock.shopOrder.findUnique.mockResolvedValueOnce(pendingOrder(null));

    await expect(shopPaymentsService.payOrder(orderId, {}, webUserId)).resolves.toBeDefined();
    expect(prismaMock.shopPayment.update).toHaveBeenCalled();
  });

  it("responde 409 cuando hay más de un pago pendiente", async () => {
    const order = pendingOrder(null);
    prismaMock.shopOrder.findUnique.mockResolvedValueOnce({
      ...order,
      payments: [
        ...order.payments,
        { ...order.payments[0], id: "b50e8400-e29b-41d4-a716-446655440000" },
      ],
    });

    await expect(shopPaymentsService.payOrder(orderId, {}, webUserId))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.shopPayment.update).not.toHaveBeenCalled();
  });
});
