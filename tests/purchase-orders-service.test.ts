import { beforeEach, describe, expect, it, vi } from "vitest";

const supplierId = "650e8400-e29b-41d4-a716-446655440000";
const productId = "750e8400-e29b-41d4-a716-446655440000";
const employeeId = "850e8400-e29b-41d4-a716-446655440000";
const webUserId = "950e8400-e29b-41d4-a716-446655440000";

const prismaMock = {
  $transaction: vi.fn(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock)),
  $queryRaw: vi.fn().mockResolvedValue([]),
  supplier: { findUnique: vi.fn() },
  webUser: { findUnique: vi.fn() },
  employee: { findUnique: vi.fn() },
  product: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  purchaseOrder: {
    create: vi.fn().mockResolvedValue({ id: "a50e8400-e29b-41d4-a716-446655440000" }),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  inventoryMovement: { create: vi.fn() },
  stockAlert: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
};

vi.mock("../src/lib/prisma.js", () => ({ prisma: prismaMock }));

const { purchaseOrdersService } = await import("../src/modules/purchasing/purchase-orders.service.js");

/** Entrada mínima para verificar que el empleado no proviene del body. */
function input() {
  return {
    supplierId,
    lines: [{ productId, quantity: 1, unitCost: 2 }],
  };
}

describe("empleado autenticado al crear órdenes de compra", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.supplier.findUnique.mockResolvedValue({ id: supplierId, isActive: true });
    prismaMock.webUser.findUnique.mockResolvedValue({ employeeId });
    prismaMock.employee.findUnique.mockResolvedValue({ id: employeeId, isActive: true });
    prismaMock.product.findMany.mockResolvedValue([{ id: productId }]);
    prismaMock.product.findUnique.mockResolvedValue({
      id: productId,
      isActive: true,
      currentStock: 0,
      costPrice: 1,
      minStock: 0,
    });
    prismaMock.purchaseOrder.findUnique.mockResolvedValue({
      id: "a50e8400-e29b-41d4-a716-446655440000",
      status: "CONFIRMADA",
      supplierDocNumber: null,
      supplierDocType: null,
      details: [{ productId, quantity: 1, unitCost: 2 }],
    });
    prismaMock.purchaseOrder.update.mockResolvedValue({ id: "a50e8400-e29b-41d4-a716-446655440000", status: "RECIBIDA" });
    prismaMock.inventoryMovement.create.mockResolvedValue({ id: "movement-1" });
    prismaMock.product.update.mockResolvedValue({ id: productId });
    prismaMock.stockAlert.findFirst.mockResolvedValue(null);
    prismaMock.stockAlert.updateMany.mockResolvedValue({ count: 0 });
  });

  it("usa el empleado activo vinculado al WebUser", async () => {
    await purchaseOrdersService.create(input(), { userId: webUserId, role: "ADMIN" });

    expect(prismaMock.purchaseOrder.create.mock.calls[0][0].data.employeeId).toBe(employeeId);
    expect(prismaMock.purchaseOrder.create.mock.calls[0][0].data.createdByWebUserId).toBe(webUserId);
  });

  it.each([
    { employeeId: null, active: true },
    { employeeId, active: false },
  ])("rechaza vínculo inexistente o empleado inactivo: %o", async ({ employeeId: linkedId, active }) => {
    prismaMock.webUser.findUnique.mockResolvedValueOnce({ employeeId: linkedId });
    // Sin vínculo el servicio no consulta empleados: no dejar respuestas "once" pendientes para el siguiente caso.
    if (linkedId) prismaMock.employee.findUnique.mockResolvedValueOnce({ id: employeeId, isActive: active });

    await expect(purchaseOrdersService.create(input(), { userId: webUserId, role: "ACCOUNTANT" }))
      .rejects.toThrow("Tu usuario no está vinculado a un empleado activo");
    expect(prismaMock.purchaseOrder.create).not.toHaveBeenCalled();
  });

  it.each(["ADMIN", "OWNER"])("permite crear sin empleado para %s", async (role) => {
    prismaMock.webUser.findUnique.mockResolvedValueOnce({ employeeId: null });

    await purchaseOrdersService.create(input(), { userId: webUserId, role });

    expect(prismaMock.purchaseOrder.create.mock.calls[0][0].data.employeeId).toBeNull();
    expect(prismaMock.purchaseOrder.create.mock.calls[0][0].data.createdByWebUserId).toBe(webUserId);
  });

  it("rechaza una identidad ausente antes de abrir la transacción", async () => {
    await expect(purchaseOrdersService.create(input(), undefined as never)).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe("WebUser que recibe órdenes de compra", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$queryRaw.mockResolvedValue([]);
    prismaMock.purchaseOrder.findUnique.mockResolvedValue({
      id: "a50e8400-e29b-41d4-a716-446655440000",
      status: "CONFIRMADA",
      supplierDocNumber: null,
      supplierDocType: null,
      details: [{ productId, quantity: 1, unitCost: 2 }],
    });
    prismaMock.product.findUnique.mockResolvedValue({
      id: productId,
      isActive: true,
      currentStock: 0,
      costPrice: 1,
      minStock: 0,
    });
    prismaMock.purchaseOrder.update.mockResolvedValue({ id: "a50e8400-e29b-41d4-a716-446655440000", status: "RECIBIDA" });
    prismaMock.inventoryMovement.create.mockResolvedValue({ id: "movement-1" });
    prismaMock.product.update.mockResolvedValue({ id: productId });
    prismaMock.stockAlert.findFirst.mockResolvedValue(null);
    prismaMock.stockAlert.updateMany.mockResolvedValue({ count: 0 });
  });

  it("registra el WebUser y deja receivedById nulo para ADMIN sin empleado", async () => {
    prismaMock.webUser.findUnique.mockResolvedValueOnce({ employeeId: null });

    await purchaseOrdersService.receive("a50e8400-e29b-41d4-a716-446655440000", {}, webUserId);

    expect(prismaMock.purchaseOrder.update.mock.calls[0][0].data).toMatchObject({
      receivedById: null,
      receivedByWebUserId: webUserId,
    });
  });

  it("registra el WebUser y el empleado activo cuando existe", async () => {
    prismaMock.webUser.findUnique.mockResolvedValueOnce({ employeeId });
    prismaMock.employee.findUnique.mockResolvedValueOnce({ id: employeeId, isActive: true });

    await purchaseOrdersService.receive("a50e8400-e29b-41d4-a716-446655440000", {}, webUserId);

    expect(prismaMock.purchaseOrder.update.mock.calls[0][0].data).toMatchObject({
      receivedById: employeeId,
      receivedByWebUserId: webUserId,
    });
  });

  it("rechaza recibir sin usuario autenticado antes de abrir la transacción", async () => {
    await expect(purchaseOrdersService.receive("a50e8400-e29b-41d4-a716-446655440000", {}, undefined as never))
      .rejects.toMatchObject({ statusCode: 401 });
    expect(prismaMock.purchaseOrder.update).not.toHaveBeenCalled();
  });
});
