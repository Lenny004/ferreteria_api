import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const customerId = "650e8400-e29b-41d4-a716-446655440000";
const orderId = "750e8400-e29b-41d4-a716-446655440000";
const pendingPaymentId = "850e8400-e29b-41d4-a716-446655440000";

const prismaMock = {
  $transaction: vi.fn(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock)),
  $queryRaw: vi.fn().mockResolvedValue([{ id: orderId }]),
  shopOrder: {
    findFirst: vi.fn(),
    update: vi.fn().mockResolvedValue({ id: orderId, paymentStatus: "EN_VERIFICACION" }),
  },
  shopPayment: {
    update: vi.fn(),
    create: vi.fn(),
  },
};

vi.mock("../src/lib/prisma.js", () => ({ prisma: prismaMock }));

const { shopOrdersService } = await import("../src/modules/shop-orders/shop-orders.service.js");

/** Construye un pedido de transferencia con un solo pago pendiente elegible. */
function transferOrder() {
  return {
    id: orderId,
    shopCustomerId: customerId,
    status: "PENDIENTE",
    paymentStatus: "PENDIENTE",
    paymentMethod: "TRANSFERENCIA",
    total: new Prisma.Decimal("10.00"),
    payments: [
      {
        id: "950e8400-e29b-41d4-a716-446655440000",
        status: "COMPLETADO",
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
      },
      {
        id: pendingPaymentId,
        status: "PENDIENTE",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ],
  };
}

describe("referencia de transferencia en pagos pendientes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$queryRaw.mockResolvedValue([{ id: orderId }]);
    prismaMock.shopOrder.findFirst.mockResolvedValue(transferOrder());
  });

  it("escribe la referencia en el pago pendiente seleccionado", async () => {
    await shopOrdersService.submitTransferReference(customerId, orderId, {
      reference: "TRF-RECIENTE",
    });

    expect(prismaMock.shopPayment.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: pendingPaymentId },
      data: expect.objectContaining({ customerReference: "TRF-RECIENTE" }),
    }));
    expect(prismaMock.shopPayment.create).not.toHaveBeenCalled();
  });

  it("responde 409 cuando hay pagos pendientes duplicados", async () => {
    const order = transferOrder();
    order.payments.push({
      ...order.payments[1],
      id: "a50e8400-e29b-41d4-a716-446655440000",
      createdAt: new Date("2025-12-31T00:00:00.000Z"),
    });
    prismaMock.shopOrder.findFirst.mockResolvedValueOnce(order);

    await expect(shopOrdersService.submitTransferReference(customerId, orderId, {
      reference: "TRF-DUPLICADA",
    })).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.shopPayment.update).not.toHaveBeenCalled();
    expect(prismaMock.shopPayment.create).not.toHaveBeenCalled();
  });
});
