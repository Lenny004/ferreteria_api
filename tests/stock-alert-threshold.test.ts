import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const productId = "650e8400-e29b-41d4-a716-446655440000";
const customerId = "750e8400-e29b-41d4-a716-446655440000";
const countId = "850e8400-e29b-41d4-a716-446655440000";
const countLineId = "950e8400-e29b-41d4-a716-446655440000";
const employeeId = "a50e8400-e29b-41d4-a716-446655440000";

const minimum = new Prisma.Decimal("2");

const product = {
  id: productId,
  code: "TOR-001",
  description: "Tornillo",
  isActive: true,
  currentStock: new Prisma.Decimal("3"),
  minStock: minimum,
  costPrice: new Prisma.Decimal("3"),
  salePrice: new Prisma.Decimal("5"),
  measurementType: { unitLabel: "pza", decimals: 0 },
};

const prismaMock = {
  $transaction: vi.fn(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock)),
  $queryRaw: vi.fn().mockResolvedValue([]),
  product: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  inventoryMovement: { create: vi.fn() },
  stockAlert: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  employee: { findUnique: vi.fn(), findFirst: vi.fn() },
  purchaseOrder: { findUnique: vi.fn(), update: vi.fn() },
  shopCartItem: { findMany: vi.fn(), deleteMany: vi.fn() },
  shopOrder: { create: vi.fn() },
  setting: { findUnique: vi.fn() },
  inventoryCount: { findUnique: vi.fn(), update: vi.fn() },
  inventoryCountLine: { update: vi.fn() },
  webUser: { findUnique: vi.fn() },
};
const transactionClient = prismaMock as unknown as Prisma.TransactionClient;

vi.mock("../src/lib/prisma.js", () => ({ prisma: prismaMock }));

const { isAtOrBelowMinimum, syncStockAlert, inventoryService } = await import(
  "../src/modules/inventory/inventory.service.js"
);
const { purchaseOrdersService } = await import("../src/modules/purchasing/purchase-orders.service.js");
const { inventoryCountsService } = await import("../src/modules/inventory/inventory-counts.service.js");
const { countProductsAtOrBelowMinimum } = await import("../src/modules/dashboard/dashboard.service.js");
const { shopOrdersService } = await import("../src/modules/shop-orders/shop-orders.service.js");

function resetMocks(): void {
  vi.clearAllMocks();
  prismaMock.stockAlert.findFirst.mockResolvedValue(null);
  prismaMock.stockAlert.create.mockResolvedValue({ id: "alert-1" });
  prismaMock.stockAlert.update.mockResolvedValue({ id: "alert-1" });
  prismaMock.stockAlert.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.product.findUnique.mockResolvedValue(product);
  prismaMock.product.findMany.mockResolvedValue([product]);
  prismaMock.product.update.mockResolvedValue(product);
  prismaMock.inventoryMovement.create.mockResolvedValue({ id: "movement-1" });
  prismaMock.employee.findUnique.mockResolvedValue({ id: employeeId, isActive: true });
  prismaMock.purchaseOrder.update.mockResolvedValue({ id: "purchase-order-1" });
  prismaMock.shopCartItem.deleteMany.mockResolvedValue({ count: 1 });
  prismaMock.shopOrder.create.mockResolvedValue({ id: "shop-order-1" });
  prismaMock.setting.findUnique.mockResolvedValue({ value: "13" });
  prismaMock.inventoryCountLine.update.mockImplementation(async ({ where, data }) => ({
    id: where.id,
    ...data,
  }));
  prismaMock.inventoryCount.update.mockResolvedValue({ id: countId, status: "APLICADO" });
  prismaMock.webUser.findUnique.mockResolvedValue({ employeeId: null });
}

describe("umbral de alertas de stock", () => {
  beforeEach(resetMocks);

  it("considera debajo, igual y encima del mínimo, incluidos decimales", () => {
    expect(isAtOrBelowMinimum(new Prisma.Decimal("2.499"), new Prisma.Decimal("2.5"))).toBe(true);
    expect(isAtOrBelowMinimum(new Prisma.Decimal("2.500"), new Prisma.Decimal("2.5"))).toBe(true);
    expect(isAtOrBelowMinimum(new Prisma.Decimal("2.501"), new Prisma.Decimal("2.5"))).toBe(false);
    expect(isAtOrBelowMinimum(new Prisma.Decimal("0"), new Prisma.Decimal("0"))).toBe(true);
  });

  it("crea una alerta cuando el stock queda exactamente en el mínimo y no hay una abierta", async () => {
    await syncStockAlert(
      transactionClient,
      productId,
      new Prisma.Decimal("2.500"),
      new Prisma.Decimal("2.5"),
    );

    expect(prismaMock.stockAlert.create).toHaveBeenCalledWith({
      data: {
        productId,
        currentStock: new Prisma.Decimal("2.500"),
        minStock: new Prisma.Decimal("2.5"),
      },
    });
    expect(prismaMock.stockAlert.updateMany).not.toHaveBeenCalled();
  });

  it("actualiza la alerta abierta cuando el stock queda exactamente en el mínimo", async () => {
    prismaMock.stockAlert.findFirst.mockResolvedValue({ id: "alert-open" });

    await syncStockAlert(transactionClient, productId, new Prisma.Decimal("2"), minimum);

    expect(prismaMock.stockAlert.update).toHaveBeenCalledWith({
      where: { id: "alert-open" },
      data: { currentStock: new Prisma.Decimal("2"), minStock: minimum },
    });
    expect(prismaMock.stockAlert.create).not.toHaveBeenCalled();
    expect(prismaMock.stockAlert.updateMany).not.toHaveBeenCalled();
  });

  it("resuelve las alertas abiertas cuando el stock supera el mínimo", async () => {
    await syncStockAlert(transactionClient, productId, new Prisma.Decimal("2.001"), minimum);

    expect(prismaMock.stockAlert.updateMany).toHaveBeenCalledWith({
      where: { productId, isResolved: false },
      data: { isResolved: true, resolvedAt: expect.any(Date) },
    });
    expect(prismaMock.stockAlert.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.stockAlert.create).not.toHaveBeenCalled();
  });

  it("mantiene la alerta al mínimo en un movimiento manual de salida", async () => {
    await inventoryService.createMovement({
      productId,
      movementType: "AJUSTE_SALIDA",
      quantity: 1,
    });

    expect(prismaMock.product.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ currentStock: minimum }),
    }));
    expect(prismaMock.stockAlert.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ currentStock: minimum, minStock: minimum }),
    }));
    expect(prismaMock.stockAlert.updateMany).not.toHaveBeenCalled();
  });

  it("mantiene la alerta al mínimo al recibir una compra", async () => {
    const order = {
      id: "purchase-order-1",
      status: "CONFIRMADA",
      employeeId,
      details: [{ productId, quantity: new Prisma.Decimal("1"), unitCost: new Prisma.Decimal("4") }],
    };
    prismaMock.purchaseOrder.findUnique.mockResolvedValue(order);
    prismaMock.product.findUnique.mockResolvedValue({ ...product, currentStock: new Prisma.Decimal("1") });

    await purchaseOrdersService.receive("purchase-order-1", {}, "b50e8400-e29b-41d4-a716-446655440000");

    expect(prismaMock.stockAlert.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ currentStock: minimum, minStock: minimum }),
    }));
    expect(prismaMock.stockAlert.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.purchaseOrder.update).toHaveBeenCalled();
  });

  it("mantiene la alerta al mínimo al aplicar un conteo físico", async () => {
    const countLine = {
      id: countLineId,
      countId,
      productId,
      systemStockAtStart: new Prisma.Decimal("3"),
      countedQuantity: new Prisma.Decimal("2"),
      systemStockAtCount: new Prisma.Decimal("3"),
      countedAt: new Date(),
      countedByWebUserId: null,
      varianceQuantity: null,
      unitCostAtApply: null,
      adjustmentMovementId: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      product: { ...product, currentStock: new Prisma.Decimal("3") },
    };
    prismaMock.inventoryCount.findUnique.mockResolvedValue({
      id: countId,
      folio: 1,
      name: "Conteo mínimo",
      status: "ABIERTO",
      notes: null,
      lines: [countLine],
    });
    prismaMock.product.findMany.mockResolvedValue([{ ...product, currentStock: new Prisma.Decimal("3") }]);

    await inventoryCountsService.apply(countId, { confirm: true, webUserId: employeeId });

    expect(prismaMock.stockAlert.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ currentStock: minimum, minStock: minimum }),
    }));
    expect(prismaMock.stockAlert.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it("mantiene la alerta al mínimo durante el checkout de tienda", async () => {
    prismaMock.shopCartItem.findMany.mockResolvedValue([{
      shopCustomerId: customerId,
      productId,
      quantity: new Prisma.Decimal("1"),
      product,
    }]);

    await shopOrdersService.checkout(customerId);

    expect(prismaMock.stockAlert.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ currentStock: minimum, minStock: minimum }),
    }));
    expect(prismaMock.stockAlert.updateMany).not.toHaveBeenCalled();
  });

  it("cuenta en belowMin un producto exactamente en el mínimo", () => {
    expect(countProductsAtOrBelowMinimum([
      { currentStock: new Prisma.Decimal("2.500"), minStock: new Prisma.Decimal("2.5") },
      { currentStock: new Prisma.Decimal("2.501"), minStock: new Prisma.Decimal("2.5") },
    ])).toBe(1);
  });
});
