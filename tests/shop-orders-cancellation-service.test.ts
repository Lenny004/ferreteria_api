import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const orderId = "650e8400-e29b-41d4-a716-446655440000";
const productId = "750e8400-e29b-41d4-a716-446655440000";

const prismaMock = {
  $transaction: vi.fn(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock)),
  $queryRaw: vi.fn(),
  shopOrder: {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue({ id: orderId, status: "CANCELADA" }),
  },
  product: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  inventoryMovement: { create: vi.fn() },
  stockAlert: {
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
};

vi.mock("../src/lib/prisma.js", () => ({ prisma: prismaMock }));

const { shopOrdersService } = await import("../src/modules/shop-orders/shop-orders.service.js");

/** Pedido en verificación usado para probar la nota obligatoria de cancelación. */
function verificationOrder(adminNotes: string | null = null) {
  return {
    id: orderId,
    status: "PENDIENTE",
    paymentStatus: "EN_VERIFICACION",
    adminNotes,
  };
}

describe("nota de cancelación con pago en verificación", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$queryRaw.mockResolvedValue([]);
    prismaMock.shopOrder.findUnique.mockResolvedValue(verificationOrder());
    prismaMock.product.findMany.mockResolvedValue([{
      id: productId,
      currentStock: new Prisma.Decimal("3"),
      minStock: new Prisma.Decimal("0"),
    }]);
    prismaMock.product.update.mockResolvedValue({});
    prismaMock.inventoryMovement.create.mockResolvedValue({});
    prismaMock.stockAlert.updateMany.mockResolvedValue({ count: 0 });
  });

  it("responde 400 sin nota y no repone inventario", async () => {
    await expect(shopOrdersService.updateAdmin(orderId, { status: "CANCELADA" }))
      .rejects.toMatchObject({ statusCode: 400 });

    expect(prismaMock.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it("responde 400 si la nota no es nueva", async () => {
    prismaMock.shopOrder.findUnique.mockResolvedValueOnce(verificationOrder("Nota previa"));

    await expect(shopOrdersService.updateAdmin(orderId, {
      status: "CANCELADA",
      adminNotes: " Nota previa ",
    })).rejects.toMatchObject({ statusCode: 400 });

    expect(prismaMock.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it("permite cancelar con una nota nueva y guarda la nota", async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        productId,
        movementType: "SALIDA_VENTA",
        quantity: "2.000",
        unitCost: "2.0000",
      }])
      .mockResolvedValueOnce([]);

    await shopOrdersService.updateAdmin(orderId, {
      status: "CANCELADA",
      adminNotes: " Motivo verificado ",
    });

    expect(prismaMock.inventoryMovement.create).toHaveBeenCalled();
    expect(prismaMock.shopOrder.update.mock.calls[0][0].data.adminNotes).toBe("Motivo verificado");
  });
});
