/**
 * Atribución de movimientos manuales (QA P1-8): el empleado se toma del
 * usuario autenticado y nunca de un `employeeId` enviado en el body.
 */
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const productId = "650e8400-e29b-41d4-a716-446655440010";
const webUserId = "650e8400-e29b-41d4-a716-446655440011";
const linkedEmployeeId = "650e8400-e29b-41d4-a716-446655440012";
const forgedEmployeeId = "650e8400-e29b-41d4-a716-446655440013";

const product = {
  id: productId,
  code: "ATR-001",
  description: "Producto atribución",
  isActive: true,
  currentStock: new Prisma.Decimal("10"),
  minStock: new Prisma.Decimal("0"),
  costPrice: new Prisma.Decimal("3"),
  salePrice: new Prisma.Decimal("5"),
};

const prismaMock = {
  $transaction: vi.fn(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock)),
  $queryRaw: vi.fn().mockResolvedValue([]),
  product: { findUnique: vi.fn(), update: vi.fn() },
  inventoryMovement: { create: vi.fn() },
  stockAlert: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  webUser: { findUnique: vi.fn() },
  employee: { findUnique: vi.fn() },
};

vi.mock("../src/lib/prisma.js", () => ({ prisma: prismaMock }));

const { inventoryService } = await import("../src/modules/inventory/inventory.service.js");

describe("atribución de movimientos de inventario", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.product.findUnique.mockResolvedValue(product);
    prismaMock.product.update.mockResolvedValue(product);
    prismaMock.inventoryMovement.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "m-1", ...data }));
    prismaMock.stockAlert.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.stockAlert.findFirst.mockResolvedValue(null);
  });

  it("usa el empleado vinculado al usuario autenticado e ignora el employeeId del body", async () => {
    prismaMock.webUser.findUnique.mockResolvedValue({ employeeId: linkedEmployeeId });
    prismaMock.employee.findUnique.mockResolvedValue({ id: linkedEmployeeId, isActive: true });

    const forgedInput = {
      productId,
      movementType: "AJUSTE_ENTRADA",
      quantity: 1,
      employeeId: forgedEmployeeId,
    } as unknown as Parameters<typeof inventoryService.createMovement>[0];
    await inventoryService.createMovement(forgedInput, webUserId);

    expect(prismaMock.webUser.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: webUserId } }));
    const data = prismaMock.inventoryMovement.create.mock.calls[0][0].data;
    expect(data.employeeId).toBe(linkedEmployeeId);
    expect(data.employeeId).not.toBe(forgedEmployeeId);
  });

  it("deja employeeId nulo si el usuario no tiene empleado vinculado", async () => {
    prismaMock.webUser.findUnique.mockResolvedValue({ employeeId: null });

    await inventoryService.createMovement(
      { productId, movementType: "AJUSTE_ENTRADA", quantity: 1 },
      webUserId,
    );

    const data = prismaMock.inventoryMovement.create.mock.calls[0][0].data;
    expect(data.employeeId ?? null).toBeNull();
  });
});
