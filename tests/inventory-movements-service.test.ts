import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const productId = "650e8400-e29b-41d4-a716-446655440000";

const product = {
  id: productId,
  code: "TOR-001",
  description: "Tornillo",
  isActive: true,
  currentStock: new Prisma.Decimal("10"),
  minStock: new Prisma.Decimal("2"),
  costPrice: new Prisma.Decimal("3"),
  salePrice: new Prisma.Decimal("5"),
};

const baseMovement = {
  id: "movement-1",
  productId,
  movementType: "AJUSTE_SALIDA",
  quantity: new Prisma.Decimal("-4"),
  unitCost: new Prisma.Decimal("3"),
  totalCost: new Prisma.Decimal("-12"),
  stockBefore: new Prisma.Decimal("10"),
  stockAfter: new Prisma.Decimal("6"),
  reason: null,
  employeeId: null,
  createdAt: new Date(),
};

const prismaMock = {
  $transaction: vi.fn(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock)),
  product: { findUnique: vi.fn(), update: vi.fn() },
  inventoryMovement: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  stockAlert: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
};

vi.mock("../src/lib/prisma.js", () => ({ prisma: prismaMock }));

const { inventoryService } = await import("../src/modules/inventory/inventory.service.js");

function prepareProduct(overrides: Partial<typeof product> = {}) {
  prismaMock.product.findUnique.mockResolvedValue({ ...product, ...overrides });
  prismaMock.product.update.mockResolvedValue({ ...product, ...overrides });
  prismaMock.inventoryMovement.create.mockImplementation(async ({ data }: { data: typeof baseMovement }) => ({
    ...baseMovement,
    ...data,
  }));
  prismaMock.stockAlert.updateMany.mockResolvedValue({ count: 0 });
}

describe("servicio de movimientos de inventario", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prepareProduct();
  });

  it("guarda AJUSTE_SALIDA con magnitudes positivas y baja el stock", async () => {
    const result = await inventoryService.createMovement({
      productId,
      movementType: "AJUSTE_SALIDA",
      quantity: 4,
      unitCost: 3,
    });
    const data = prismaMock.inventoryMovement.create.mock.calls[0][0].data;

    expect(data.quantity).toEqual(new Prisma.Decimal("4"));
    expect(data.totalCost).toEqual(new Prisma.Decimal("12"));
    expect(data.stockAfter).toEqual(new Prisma.Decimal("6"));
    expect(result.quantity).toEqual(new Prisma.Decimal("4"));
    expect(prismaMock.product.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ currentStock: new Prisma.Decimal("6") }),
    }));
  });

  it("rechaza una salida que deja stock negativo antes de escribir", async () => {
    prepareProduct({ currentStock: new Prisma.Decimal("2") });

    await expect(inventoryService.createMovement({
      productId,
      movementType: "AJUSTE_SALIDA",
      quantity: 4,
      unitCost: 3,
    })).rejects.toThrow(/Stock insuficiente/);
    expect(prismaMock.inventoryMovement.create).not.toHaveBeenCalled();
    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });

  it.each(["AJUSTE_ENTRADA", "ENTRADA_COMPRA"] as const)(
    "%s suma stock y recalcula el costo con unitCost",
    async (movementType) => {
      await inventoryService.createMovement({ productId, movementType, quantity: 4, unitCost: 5 });
      const data = prismaMock.inventoryMovement.create.mock.calls[0][0].data;

      expect(data.quantity).toEqual(new Prisma.Decimal("4"));
      expect(data.totalCost).toEqual(new Prisma.Decimal("20"));
      expect(data.stockAfter).toEqual(new Prisma.Decimal("14"));
      expect(prismaMock.product.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ costPrice: new Prisma.Decimal("3.5714") }),
      }));
    },
  );

  it("no recalcula el costo promedio para AJUSTE_SALIDA", async () => {
    await inventoryService.createMovement({
      productId,
      movementType: "AJUSTE_SALIDA",
      quantity: 4,
      unitCost: 9,
    });

    expect(prismaMock.product.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({ costPrice: expect.anything() }),
    }));
  });

  it("importa una salida con cantidad positiva", async () => {
    const result = await inventoryService.importMovements([{
      productCode: product.code,
      movementType: "AJUSTE_SALIDA",
      quantity: 2,
      unitCost: 3,
    }]);
    const data = prismaMock.inventoryMovement.create.mock.calls[0][0].data;

    expect(result.imported).toBe(1);
    expect(data.quantity).toEqual(new Prisma.Decimal("2"));
    expect(data.totalCost).toEqual(new Prisma.Decimal("6"));
  });

  it("lista movimientos antiguos como magnitud y dirección", async () => {
    prismaMock.inventoryMovement.findMany.mockResolvedValue([baseMovement]);
    prismaMock.inventoryMovement.count.mockResolvedValue(1);

    const result = await inventoryService.listMovements({ productId });

    expect(result.items[0].quantity).toEqual(new Prisma.Decimal("4"));
    expect(result.items[0].direction).toBe("SALIDA");
  });

  it("expone magnitud y dirección en kardex para filas antiguas", async () => {
    prismaMock.product.findUnique.mockResolvedValue(product);
    prismaMock.inventoryMovement.findMany.mockResolvedValue([baseMovement]);
    prismaMock.inventoryMovement.count.mockResolvedValue(1);

    const result = await inventoryService.kardex(productId);

    expect(result.items[0].quantity).toEqual(new Prisma.Decimal("4"));
    expect(result.items[0].direction).toBe("SALIDA");
  });
});
