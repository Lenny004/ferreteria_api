import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const productId = "650e8400-e29b-41d4-a716-446655440000";
const customerId = "750e8400-e29b-41d4-a716-446655440000";

const product = {
  id: productId,
  code: "TOR-001",
  description: "Tornillo",
  isActive: true,
  currentStock: new Prisma.Decimal("3"),
  minStock: new Prisma.Decimal("2"),
  costPrice: new Prisma.Decimal("4.25"),
  salePrice: new Prisma.Decimal("7.50"),
};

const cartItem = { shopCustomerId: customerId, productId, quantity: new Prisma.Decimal("2"), product };

const prismaMock = {
  $transaction: vi.fn(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock)),
  $queryRaw: vi.fn().mockResolvedValue([]),
  setting: { findUnique: vi.fn() },
  shopCartItem: { findMany: vi.fn(), deleteMany: vi.fn() },
  shopOrder: { create: vi.fn() },
  product: { findUnique: vi.fn(), update: vi.fn() },
  inventoryMovement: { create: vi.fn() },
  stockAlert: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
};

vi.mock("../src/lib/prisma.js", () => ({ prisma: prismaMock }));

const { shopOrdersService } = await import("../src/modules/shop-orders/shop-orders.service.js");

describe("movimiento de inventario del checkout de tienda", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.setting.findUnique.mockResolvedValue({ value: "13" });
    prismaMock.shopCartItem.findMany.mockResolvedValue([cartItem]);
    prismaMock.shopOrder.create.mockResolvedValue({ id: "order-1" });
    prismaMock.product.findUnique.mockResolvedValue(product);
    prismaMock.product.update.mockResolvedValue(product);
    prismaMock.inventoryMovement.create.mockResolvedValue({ id: "movement-1" });
    prismaMock.stockAlert.findFirst.mockResolvedValue(null);
    prismaMock.stockAlert.create.mockResolvedValue({ id: "alert-1" });
    prismaMock.stockAlert.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.shopCartItem.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("crea SALIDA_VENTA positiva, baja stock y sincroniza una alerta", async () => {
    await shopOrdersService.checkout(customerId);
    const movement = prismaMock.inventoryMovement.create.mock.calls[0][0].data;
    const stockUpdate = prismaMock.product.update.mock.calls[0][0].data;

    expect(movement.movementType).toBe("SALIDA_VENTA");
    expect(movement.quantity).toEqual(new Prisma.Decimal("2"));
    expect(movement.totalCost).toEqual(new Prisma.Decimal("8.5"));
    expect(movement.stockBefore).toEqual(new Prisma.Decimal("3"));
    expect(movement.stockAfter).toEqual(new Prisma.Decimal("1"));
    expect(stockUpdate.currentStock).toEqual(new Prisma.Decimal("1"));
    expect(prismaMock.stockAlert.findFirst).toHaveBeenCalled();
    expect(prismaMock.stockAlert.create).toHaveBeenCalledTimes(1);
  });

  it("mantiene el error de stock insuficiente y no inicia el checkout", async () => {
    prismaMock.shopCartItem.findMany.mockResolvedValueOnce([{
      ...cartItem,
      product: { ...product, currentStock: new Prisma.Decimal("1") },
    }]);
    prismaMock.product.findUnique.mockResolvedValueOnce({
      ...product,
      currentStock: new Prisma.Decimal("1"),
    });

    await expect(shopOrdersService.checkout(customerId)).rejects.toThrow(/Stock insuficiente/);
    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(prismaMock.inventoryMovement.create).not.toHaveBeenCalled();
  });
});
