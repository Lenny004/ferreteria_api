import { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const productId = "650e8400-e29b-41d4-a716-446655440000";
const countId = "750e8400-e29b-41d4-a716-446655440000";
const userId = "850e8400-e29b-41d4-a716-446655440000";
const lineId = "950e8400-e29b-41d4-a716-446655440000";

const product = {
  id: productId,
  code: "TOR-001",
  description: "Tornillo",
  currentStock: new Prisma.Decimal("10"),
  minStock: new Prisma.Decimal("2"),
  costPrice: new Prisma.Decimal("3.25"),
  measurementType: { unitLabel: "pza", decimals: 0 },
};

const line = {
  id: lineId,
  countId,
  productId,
  systemStockAtStart: new Prisma.Decimal("10"),
  countedQuantity: new Prisma.Decimal("12"),
  systemStockAtCount: new Prisma.Decimal("10"),
  countedAt: new Date(),
  countedByWebUserId: userId,
  varianceQuantity: null,
  unitCostAtApply: null,
  adjustmentMovementId: null,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  product,
};

const count = {
  id: countId,
  folio: 12,
  name: "Conteo semanal",
  status: "ABIERTO",
  notes: null,
  lines: [line],
};

const prismaMock = {
  $transaction: vi.fn(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock)),
  $queryRaw: vi.fn().mockResolvedValue([]),
  $executeRaw: vi.fn().mockResolvedValue(1),
  product: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  inventoryCount: { create: vi.fn(), findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  inventoryCountLine: { findMany: vi.fn(), createMany: vi.fn(), update: vi.fn() },
  inventoryMovement: { create: vi.fn() },
  stockAlert: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  webUser: { findUnique: vi.fn() },
};

vi.mock("../src/lib/prisma.js", () => ({ prisma: prismaMock }));

const { inventoryCountsService } = await import("../src/modules/inventory/inventory-counts.service.js");

describe("servicio de conteos físicos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.product.findMany.mockResolvedValue([product]);
    prismaMock.inventoryCountLine.findMany.mockResolvedValue([]);
    prismaMock.inventoryCount.create.mockResolvedValue({ id: countId });
    prismaMock.inventoryCountLine.createMany.mockResolvedValue({ count: 1 });
    prismaMock.inventoryCount.findUnique.mockResolvedValue(count);
  });

  it("rechaza crear sin alcance y alcance vacío", async () => {
    await expect(inventoryCountsService.create({ name: "Conteo", webUserId: userId })).rejects.toThrow(/familyId|subfamilyId|productIds/);
    prismaMock.product.findMany.mockResolvedValueOnce([]);
    await expect(inventoryCountsService.create({ familyId: productId, name: "Conteo", webUserId: userId })).rejects.toThrow(/vacío/);
  });

  it("rechaza productos ocupados y crea el snapshot inicial", async () => {
    prismaMock.inventoryCountLine.findMany.mockResolvedValueOnce([{ product: { code: "TOR-001", description: "Tornillo" } }]);
    await expect(inventoryCountsService.create({ familyId: productId, name: "Conteo", webUserId: userId })).rejects.toThrow(/TOR-001/);

    prismaMock.inventoryCountLine.findMany.mockResolvedValueOnce([]);
    await inventoryCountsService.create({ familyId: productId, name: "Conteo", webUserId: userId });
    expect(prismaMock.inventoryCountLine.createMany).toHaveBeenCalledWith({
      data: [{ countId, productId, systemStockAtStart: product.currentStock }],
    });
    expect(prismaMock.$executeRaw).toHaveBeenCalledWith(expect.anything());
    expect(prismaMock.$transaction).toHaveBeenLastCalledWith(expect.any(Function), { maxWait: 10_000, timeout: 60_000 });
  });

  it("captura, valida decimales y rechaza productos fuera del conteo", async () => {
    prismaMock.inventoryCount.findUnique.mockResolvedValueOnce({ id: countId, status: "APLICADO" });
    await expect(inventoryCountsService.captureLines(countId, userId, [{ productId, countedQuantity: 2 }])).rejects.toThrow(/ABIERTO/);

    prismaMock.inventoryCount.findUnique.mockResolvedValueOnce({ id: countId, status: "ABIERTO" });
    prismaMock.inventoryCountLine.findMany.mockResolvedValueOnce([line]);
    await expect(inventoryCountsService.captureLines(countId, userId, [{ productId, countedQuantity: 2.5 }])).rejects.toThrow(/decimales/);

    prismaMock.inventoryCount.findUnique.mockResolvedValueOnce({ id: countId, status: "ABIERTO" });
    prismaMock.inventoryCountLine.findMany.mockResolvedValueOnce([]);
    await expect(inventoryCountsService.captureLines(countId, userId, [{ productId, countedQuantity: 2 }]))
      .rejects.toMatchObject({ statusCode: 404 });

    prismaMock.inventoryCount.findUnique.mockResolvedValueOnce({ id: countId, status: "ABIERTO" });
    prismaMock.inventoryCountLine.findMany.mockResolvedValueOnce([line]);
    prismaMock.inventoryCountLine.update.mockResolvedValueOnce(line);
    await inventoryCountsService.captureLines(countId, userId, [{ productId, countedQuantity: 12 }]);
    expect(prismaMock.inventoryCountLine.update).toHaveBeenCalled();
    expect(prismaMock.inventoryCountLine.update.mock.calls[0][0].data.systemStockAtCount).toEqual(product.currentStock);
    expect(prismaMock.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(prismaMock.inventoryCount.findUnique.mock.invocationCallOrder[0]);
  });

  it("rechaza lote duplicado, estado aplicado y demasiados decimales", async () => {
    await expect(inventoryCountsService.captureLines(countId, userId, [
      { productId, countedQuantity: 2 },
      { productId, countedQuantity: 3 },
    ])).rejects.toMatchObject({ statusCode: 400 });

    prismaMock.inventoryCount.findUnique.mockResolvedValueOnce({ id: countId, status: "APLICADO" });
    await expect(inventoryCountsService.captureLines(countId, userId, [{ productId, countedQuantity: 2 }]))
      .rejects.toMatchObject({ statusCode: 409 });

    prismaMock.inventoryCount.findUnique.mockResolvedValueOnce({ id: countId, status: "ABIERTO" });
    prismaMock.inventoryCountLine.findMany.mockResolvedValueOnce([line]);
    await expect(inventoryCountsService.captureLines(countId, userId, [{ productId, countedQuantity: 2.5 }]))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it("aplica ajustes firmados, conserva costo y sincroniza alertas", async () => {
    prismaMock.inventoryCount.findUnique.mockResolvedValueOnce({ ...count, lines: [line] });
    prismaMock.product.findMany.mockResolvedValueOnce([product]);
    prismaMock.webUser.findUnique.mockResolvedValueOnce({ employeeId: null });
    prismaMock.inventoryMovement.create.mockResolvedValueOnce({ id: "movement-1" });
    prismaMock.product.update.mockResolvedValueOnce(product);
    prismaMock.stockAlert.updateMany.mockResolvedValueOnce({ count: 0 });
    prismaMock.inventoryCountLine.update.mockResolvedValueOnce({ ...line, varianceQuantity: new Prisma.Decimal("2") });
    prismaMock.inventoryCount.update.mockResolvedValueOnce({ ...count, status: "APLICADO" });

    const result = await inventoryCountsService.apply(countId, { confirm: true, webUserId: userId });
    expect(result.movementsCreated).toBe(1);
    expect(prismaMock.inventoryMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ movementType: "AJUSTE_ENTRADA", quantity: new Prisma.Decimal("2") }),
    }));
    expect(prismaMock.inventoryMovement.create.mock.calls[0][0].data.quantity.greaterThan(0)).toBe(true);
    expect(prismaMock.inventoryMovement.create.mock.calls[0][0].data.stockBefore).toEqual(new Prisma.Decimal("10"));
    expect(prismaMock.inventoryMovement.create.mock.calls[0][0].data.stockAfter).toEqual(new Prisma.Decimal("12"));
    expect(prismaMock.product.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.not.objectContaining({ costPrice: expect.anything() }) }));
    expect(prismaMock.stockAlert.updateMany).toHaveBeenCalled();
  });

  it("crea salida con cantidad positiva y alerta nueva bajo mínimo", async () => {
    const shortage = {
      ...line,
      product: { ...product, currentStock: new Prisma.Decimal("2") },
      countedQuantity: new Prisma.Decimal("9"),
      systemStockAtCount: new Prisma.Decimal("10"),
    };
    prismaMock.inventoryCount.findUnique.mockResolvedValueOnce({ ...count, lines: [shortage] });
    prismaMock.product.findMany.mockResolvedValueOnce([{ ...product, currentStock: new Prisma.Decimal("2") }]);
    prismaMock.webUser.findUnique.mockResolvedValueOnce({ employeeId: null });
    prismaMock.inventoryMovement.create.mockResolvedValueOnce({ id: "movement-shortage" });
    prismaMock.product.update.mockResolvedValueOnce(product);
    prismaMock.stockAlert.findFirst.mockResolvedValueOnce(null);
    prismaMock.stockAlert.create.mockResolvedValueOnce({ id: "alert-1" });
    prismaMock.inventoryCountLine.update.mockResolvedValueOnce({ ...shortage, varianceQuantity: new Prisma.Decimal("-1") });
    prismaMock.inventoryCount.update.mockResolvedValueOnce({ ...count, status: "APLICADO" });

    await inventoryCountsService.apply(countId, { confirm: true, webUserId: userId });
    const movement = prismaMock.inventoryMovement.create.mock.calls[0][0].data;
    expect(movement.movementType).toBe("AJUSTE_SALIDA");
    expect(movement.quantity.greaterThan(0)).toBe(true);
    expect(movement.quantity).toEqual(new Prisma.Decimal("1"));
    expect(movement.stockBefore).toEqual(new Prisma.Decimal("2"));
    expect(movement.stockAfter).toEqual(new Prisma.Decimal("1"));
    expect(prismaMock.stockAlert.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ currentStock: new Prisma.Decimal("1"), minStock: new Prisma.Decimal("2") }),
    }));
  });

  it("omite pendientes y ceros, pero actualiza las líneas capturadas", async () => {
    const pending = { ...line, id: "pending-line", countedQuantity: null, systemStockAtCount: null };
    const zero = { ...line, id: "zero-line", countedQuantity: new Prisma.Decimal("10") };
    const surplus = { ...line, id: "surplus-line" };
    prismaMock.inventoryCount.findUnique.mockResolvedValueOnce({ ...count, lines: [pending, zero, surplus] });
    prismaMock.product.findMany.mockResolvedValueOnce([product]);
    prismaMock.inventoryMovement.create.mockResolvedValueOnce({ id: "movement-surplus" });
    prismaMock.product.update.mockResolvedValueOnce(product);
    prismaMock.inventoryCountLine.update.mockImplementation(async ({ where, data }) => ({ ...line, id: where.id, ...data }));
    prismaMock.inventoryCount.update.mockResolvedValueOnce({ ...count, status: "APLICADO" });

    await inventoryCountsService.apply(countId, { confirm: true, webUserId: userId });
    expect(prismaMock.inventoryMovement.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.inventoryCountLine.update).toHaveBeenCalledTimes(2);
    expect(prismaMock.inventoryCountLine.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: pending.id } }));
    expect(prismaMock.inventoryCountLine.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: zero.id } }));
  });

  it("exige confirmación y aborta todo si el stock resultaría negativo", async () => {
    await expect(inventoryCountsService.apply(countId, { confirm: false, webUserId: userId }))
      .rejects.toMatchObject({ statusCode: 400 });

    const shortage = { ...line, countedQuantity: new Prisma.Decimal("1"), systemStockAtCount: new Prisma.Decimal("10") };
    prismaMock.inventoryCount.findUnique.mockResolvedValueOnce({ ...count, lines: [shortage] });
    prismaMock.product.findMany.mockResolvedValueOnce([{ ...product, currentStock: new Prisma.Decimal("2") }]);
    await expect(inventoryCountsService.apply(countId, { confirm: true, webUserId: userId })).rejects.toThrow(/negativo/);
    expect(prismaMock.inventoryMovement.create).not.toHaveBeenCalled();
    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });

  it("rechaza aplicar o cancelar un conteo que no está abierto", async () => {
    prismaMock.inventoryCount.findUnique.mockResolvedValueOnce({ ...count, status: "CANCELADO" });
    await expect(inventoryCountsService.apply(countId, { confirm: true, webUserId: userId })).rejects.toMatchObject({ statusCode: 409 });
    prismaMock.inventoryCount.findUnique.mockResolvedValueOnce({ ...count, status: "APLICADO" });
    await expect(inventoryCountsService.cancel(countId, userId, "duplicado")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("lista líneas con búsqueda y filtros de avance", async () => {
    const pending = { ...line, id: "pending-line", countedQuantity: null, systemStockAtCount: null };
    const counted = { ...line, id: "counted-line", countedQuantity: new Prisma.Decimal("10") };
    const variance = { ...line, id: "variance-line" };
    prismaMock.inventoryCount.findUnique.mockResolvedValue({ id: countId });
    prismaMock.inventoryCountLine.findMany.mockResolvedValue([pending, counted, variance]);

    const all = await inventoryCountsService.listLines(countId, { q: "TOR", filter: "all" });
    const pendingResult = await inventoryCountsService.listLines(countId, { filter: "pending" });
    const countedResult = await inventoryCountsService.listLines(countId, { filter: "counted" });
    const varianceResult = await inventoryCountsService.listLines(countId, { filter: "variance" });
    expect(all.total).toBe(3);
    expect(pendingResult.items.map((item) => item.id)).toEqual([pending.id]);
    expect(countedResult.total).toBe(2);
    expect(varianceResult.items.map((item) => item.id)).toEqual([variance.id]);
    expect(prismaMock.inventoryCountLine.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ product: expect.objectContaining({ OR: expect.any(Array) }) }),
    }));
  });

  it("agrega el motivo al cancelar y exporta un XLSX con folio y totales", async () => {
    const cancelCount = { ...count, notes: "nota previa" };
    prismaMock.inventoryCount.findUnique.mockResolvedValueOnce(cancelCount);
    prismaMock.inventoryCount.update.mockResolvedValueOnce({ ...cancelCount, status: "CANCELADO" });
    await inventoryCountsService.cancel(countId, userId, "ajuste físico");
    expect(prismaMock.inventoryCount.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ notes: "nota previa\nMotivo de cancelación: ajuste físico" }),
    }));

    prismaMock.inventoryCount.findUnique.mockResolvedValueOnce({ ...count, lines: [line] });
    const exported = await inventoryCountsService.exportXlsx(countId);
    expect(exported.folio).toBe(12);
    expect(exported.buffer.subarray(0, 2).toString()).toBe("PK");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(exported.buffer);
    const worksheet = workbook.getWorksheet("Conteo");
    expect(worksheet).toBeDefined();
    expect(worksheet?.getCell("A1").value).toBe("Código");
    expect(worksheet?.getCell("B4").value).toBe("TOTALES");
  });
});
