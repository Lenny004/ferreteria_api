import { beforeEach, describe, expect, it, vi } from "vitest";

const familyId = "750e8400-e29b-41d4-a716-446655440000";
const otherFamilyId = "760e8400-e29b-41d4-a716-446655440000";
const subfamilyId = "770e8400-e29b-41d4-a716-446655440000";
const measurementTypeId = "850e8400-e29b-41d4-a716-446655440000";
const productId = "650e8400-e29b-41d4-a716-446655440000";

const prismaMock = vi.hoisted(() => ({
  product: {
    findMany: vi.fn(),
    count: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  subfamily: { findUnique: vi.fn() },
  family: { findMany: vi.fn() },
  measurementType: { findMany: vi.fn() },
}));

vi.mock("../src/lib/prisma.js", () => ({ prisma: prismaMock }));

const { productsService } = await import("../src/modules/products/products.service.js");

describe("productsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.product.findMany.mockResolvedValue([]);
    prismaMock.product.count.mockResolvedValue(0);
    prismaMock.product.create.mockResolvedValue({ id: productId });
    prismaMock.product.update.mockResolvedValue({ id: productId });
  });

  it("lista solo activos por defecto y todos con includeInactive", async () => {
    await productsService.list({});
    expect(prismaMock.product.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );

    await productsService.list({ includeInactive: true });
    expect(prismaMock.product.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: {} }));
  });

  it("devuelve familias y unidades de medida para el formulario", async () => {
    prismaMock.family.findMany.mockResolvedValue([{ id: familyId, code: "HER", name: "Herramientas", subfamilies: [] }]);
    prismaMock.measurementType.findMany.mockResolvedValue([{ id: measurementTypeId, code: "UND", name: "Unidad", unitLabel: "und", decimals: 0 }]);

    const options = await productsService.listFormOptions();

    expect(options.families).toHaveLength(1);
    expect(options.measurementTypes[0].code).toBe("UND");
    expect(prismaMock.family.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
  });

  it("rechaza una subfamilia de otra familia al crear", async () => {
    prismaMock.subfamily.findUnique.mockResolvedValue({ familyId: otherFamilyId });

    await expect(
      productsService.create({ code: "P-1", description: "Martillo", familyId, measurementTypeId, subfamilyId }),
    ).rejects.toThrow("La subfamilia no pertenece a la familia seleccionada");
    expect(prismaMock.product.create).not.toHaveBeenCalled();
  });

  it("crea el producto cuando la subfamilia es coherente", async () => {
    prismaMock.subfamily.findUnique.mockResolvedValue({ familyId });

    await productsService.create({ code: "P-1", description: "Martillo", familyId, measurementTypeId, subfamilyId });

    expect(prismaMock.product.create).toHaveBeenCalledTimes(1);
  });

  it("valida la subfamilia vigente cuando la edición solo cambia la familia", async () => {
    prismaMock.product.findUnique.mockResolvedValue({ id: productId, familyId, subfamilyId });
    prismaMock.subfamily.findUnique.mockResolvedValue({ familyId });

    await expect(productsService.update(productId, { familyId: otherFamilyId })).rejects.toThrow(
      "La subfamilia no pertenece a la familia seleccionada",
    );
    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });

  it("no consulta subfamilias si la edición no toca la clasificación", async () => {
    prismaMock.product.findUnique.mockResolvedValue({ id: productId, familyId, subfamilyId });

    await productsService.update(productId, { salePrice: 12 });

    expect(prismaMock.subfamily.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.product.update).toHaveBeenCalledTimes(1);
  });
});
