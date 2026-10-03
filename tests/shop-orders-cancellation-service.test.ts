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

const { appendCancellationNote, shopOrdersService } = await import(
  "../src/modules/shop-orders/shop-orders.service.js"
);

/** Construye un pedido mínimo para las reglas de cancelación administrativa. */
function order(status = "PENDIENTE", paymentStatus = "EN_VERIFICACION", adminNotes: string | null = null) {
  return {
    id: orderId,
    status,
    paymentStatus,
    adminNotes,
  };
}

describe("nota de cancelación con pago en verificación", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$queryRaw.mockResolvedValue([]);
    prismaMock.shopOrder.findUnique.mockResolvedValue(order());
    prismaMock.product.findMany.mockResolvedValue([{
      id: productId,
      currentStock: new Prisma.Decimal("3"),
      minStock: new Prisma.Decimal("0"),
    }]);
    prismaMock.product.update.mockResolvedValue({});
    prismaMock.inventoryMovement.create.mockResolvedValue({});
    prismaMock.stockAlert.updateMany.mockResolvedValue({ count: 0 });
  });

  it("responde 409 sin nota y no repone inventario", async () => {
    await expect(shopOrdersService.updateAdmin(orderId, { status: "CANCELADA" }))
      .rejects.toMatchObject({ statusCode: 409 });

    expect(prismaMock.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it("agrega la nota al historial existente con el prefijo de verificación", async () => {
    prismaMock.shopOrder.findUnique.mockResolvedValueOnce(order("PENDIENTE", "EN_VERIFICACION", "Nota previa"));
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
      cancellationNote: " Motivo verificado ",
    });

    expect(prismaMock.shopOrder.update.mock.calls[0][0].data.adminNotes)
      .toBe("Nota previa\nCancelación con pago en verificación: Motivo verificado");
    expect(prismaMock.inventoryMovement.create).toHaveBeenCalled();
  });

  it("usa adminNotes de la misma petición como base de la línea", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await shopOrdersService.updateAdmin(orderId, {
      status: "CANCELADA",
      adminNotes: "Nota enviada ahora",
      cancellationNote: "Motivo de cancelación",
    });

    expect(prismaMock.shopOrder.update.mock.calls[0][0].data.adminNotes)
      .toBe("Nota enviada ahora\nCancelación con pago en verificación: Motivo de cancelación");
  });

  it("guarda solo la línea cuando no había notas previas", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await shopOrdersService.updateAdmin(orderId, {
      status: "CANCELADA",
      cancellationNote: "Motivo verificado",
    });

    expect(prismaMock.shopOrder.update.mock.calls[0][0].data.adminNotes)
      .toBe("Cancelación con pago en verificación: Motivo verificado");
  });

  it("rechaza cancellationNote si no se solicita CANCELADA", async () => {
    await expect(shopOrdersService.updateAdmin(orderId, {
      status: "PENDIENTE",
      cancellationNote: "No corresponde",
    })).rejects.toMatchObject({ statusCode: 400 });

    expect(prismaMock.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it("no vuelve a agregar la nota ni repone al cancelar un pedido ya cancelado", async () => {
    prismaMock.shopOrder.findUnique.mockResolvedValueOnce(order("CANCELADA", "EN_VERIFICACION", "Nota previa"));

    await shopOrdersService.updateAdmin(orderId, {
      status: "CANCELADA",
      cancellationNote: "Duplicada",
    });

    expect(prismaMock.inventoryMovement.create).not.toHaveBeenCalled();
    expect(prismaMock.shopOrder.update.mock.calls[0][0].data).not.toHaveProperty("adminNotes");
  });

  it("usa el prefijo general para un pedido PENDIENTE", async () => {
    prismaMock.shopOrder.findUnique.mockResolvedValueOnce(order("PENDIENTE", "PENDIENTE"));
    prismaMock.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await shopOrdersService.updateAdmin(orderId, {
      status: "CANCELADA",
      cancellationNote: "Sin pago recibido",
    });

    expect(prismaMock.shopOrder.update.mock.calls[0][0].data.adminNotes)
      .toBe("Cancelación: Sin pago recibido");
  });
});

describe("appendCancellationNote", () => {
  it.each([
    [null, "Nota", "PENDIENTE", "Cancelación: Nota"],
    ["", " Nota ", "EN_VERIFICACION", "Cancelación con pago en verificación: Nota"],
    ["   ", "Nota", "PAGADO", "Cancelación: Nota"],
    ["Previas", "Nota", "PENDIENTE", "Previas\nCancelación: Nota"],
    [" Previas \n", " Nota ", "EN_VERIFICACION", "Previas\nCancelación con pago en verificación: Nota"],
  ])("normaliza base y nota: %o", (base, note, paymentStatus, expected) => {
    expect(appendCancellationNote(base, note, paymentStatus)).toBe(expected);
  });
});
