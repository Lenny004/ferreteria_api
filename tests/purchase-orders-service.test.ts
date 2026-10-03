import { beforeEach, describe, expect, it, vi } from "vitest";

const supplierId = "650e8400-e29b-41d4-a716-446655440000";
const productId = "750e8400-e29b-41d4-a716-446655440000";
const employeeId = "850e8400-e29b-41d4-a716-446655440000";
const webUserId = "950e8400-e29b-41d4-a716-446655440000";

const prismaMock = {
  $transaction: vi.fn(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock)),
  supplier: { findUnique: vi.fn() },
  webUser: { findUnique: vi.fn() },
  employee: { findUnique: vi.fn() },
  product: { findMany: vi.fn() },
  purchaseOrder: { create: vi.fn().mockResolvedValue({ id: "a50e8400-e29b-41d4-a716-446655440000" }) },
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
  });

  it("usa el empleado activo vinculado al WebUser", async () => {
    await purchaseOrdersService.create(input(), webUserId);

    expect(prismaMock.purchaseOrder.create.mock.calls[0][0].data.employeeId).toBe(employeeId);
  });

  it.each([
    { employeeId: null, active: true },
    { employeeId, active: false },
  ])("rechaza vínculo inexistente o empleado inactivo: %o", async ({ employeeId: linkedId, active }) => {
    prismaMock.webUser.findUnique.mockResolvedValueOnce({ employeeId: linkedId });
    // Sin vínculo el servicio no consulta empleados: no dejar respuestas "once" pendientes para el siguiente caso.
    if (linkedId) prismaMock.employee.findUnique.mockResolvedValueOnce({ id: employeeId, isActive: active });

    await expect(purchaseOrdersService.create(input(), webUserId))
      .rejects.toThrow("Tu usuario no está vinculado a un empleado activo");
    expect(prismaMock.purchaseOrder.create).not.toHaveBeenCalled();
  });
});
