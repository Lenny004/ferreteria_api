/**
 * CRUD de productos (`inventory.Products`): búsqueda, precios, stock y relaciones de catálogo.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { BadRequestError, NotFoundError } from "../../shared/errors.js";

const productInclude = {
  family: { select: { id: true, code: true, name: true } },
  subfamily: { select: { id: true, name: true } },
  measurementType: { select: { id: true, code: true, name: true, unitLabel: true } },
} as const;

/**
 * Verifica que la subfamilia elegida pertenezca a la familia del producto.
 * Sin esta comprobación la base aceptaría combinaciones incoherentes, porque cada
 * llave foránea se valida por separado.
 *
 * @param familyId - Familia efectiva del producto.
 * @param subfamilyId - Subfamilia solicitada; `null`/`undefined` no requieren validación.
 * @throws {BadRequestError} Si la subfamilia no existe o pertenece a otra familia.
 */
async function assertSubfamilyBelongsToFamily(
  familyId: string,
  subfamilyId: string | null | undefined,
): Promise<void> {
  if (!subfamilyId) return;
  const subfamily = await prisma.subfamily.findUnique({
    where: { id: subfamilyId },
    select: { familyId: true },
  });
  if (!subfamily || subfamily.familyId !== familyId) {
    throw new BadRequestError("La subfamilia no pertenece a la familia seleccionada");
  }
}

export const productsService = {
  /**
   * Lista productos con paginación; `take` máximo 200.
   * Por defecto solo activos; `includeInactive` agrega los desactivados.
   */
  async list(params: {
    q?: string;
    familyId?: string;
    subfamilyId?: string;
    minPrice?: number;
    maxPrice?: number;
    inStock?: boolean;
    includeInactive?: boolean;
    take?: number;
    skip?: number;
  }) {
    const where: Prisma.ProductWhereInput = params.includeInactive ? {} : { isActive: true };
    if (params.q) {
      where.OR = [
        { code: { contains: params.q, mode: "insensitive" } },
        { description: { contains: params.q, mode: "insensitive" } },
        { barcode: { contains: params.q } },
      ];
    }
    if (params.familyId) where.familyId = params.familyId;
    if (params.subfamilyId) where.subfamilyId = params.subfamilyId;
    if (params.minPrice != null || params.maxPrice != null) {
      where.salePrice = {};
      if (params.minPrice != null) where.salePrice.gte = params.minPrice;
      if (params.maxPrice != null) where.salePrice.lte = params.maxPrice;
    }
    if (params.inStock === true) where.currentStock = { gt: 0 };

    const take = Math.min(params.take ?? 50, 200);
    const skip = params.skip ?? 0;
    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: { code: "asc" },
        take,
        skip,
      }),
      prisma.product.count({ where }),
    ]);
    return { items, total, take, skip };
  },

  /**
   * Obtiene un producto por id.
   *
   * @throws {NotFoundError} Si no existe.
   */
  async getById(id: string) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });
    if (!product) throw new NotFoundError("Producto no encontrado");
    return product;
  },

  /**
   * Catálogos necesarios para dar de alta o editar productos: familias activas con sus
   * subfamilias activas y todas las unidades de medida.
   *
   * @returns Familias ordenadas por `sortOrder`/nombre y unidades ordenadas por nombre.
   */
  async listFormOptions() {
    const [families, measurementTypes] = await Promise.all([
      prisma.family.findMany({
        where: { isActive: true },
        select: {
          id: true,
          code: true,
          name: true,
          subfamilies: {
            where: { isActive: true },
            select: { id: true, code: true, name: true },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          },
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.measurementType.findMany({
        select: { id: true, code: true, name: true, unitLabel: true, decimals: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return { families, measurementTypes };
  },

  /**
   * Crea un producto; precios y stock en cero si no se envían.
   *
   * @throws {BadRequestError} Si la subfamilia no pertenece a la familia indicada.
   */
  async create(data: {
    code: string;
    description: string;
    familyId: string;
    measurementTypeId: string;
    subfamilyId?: string | null;
    barcode?: string | null;
    salePrice?: number;
    costPrice?: number;
    currentStock?: number;
    minStock?: number;
    notes?: string | null;
  }) {
    await assertSubfamilyBelongsToFamily(data.familyId, data.subfamilyId);
    return prisma.product.create({
      data: {
        code: data.code,
        description: data.description,
        familyId: data.familyId,
        measurementTypeId: data.measurementTypeId,
        subfamilyId: data.subfamilyId ?? undefined,
        barcode: data.barcode ?? undefined,
        salePrice: data.salePrice ?? 0,
        costPrice: data.costPrice ?? 0,
        currentStock: data.currentStock ?? 0,
        minStock: data.minStock ?? 0,
        notes: data.notes ?? undefined,
      },
      include: productInclude,
    });
  },

  /**
   * Actualización parcial de un producto. El stock no es editable aquí: cambia solo por movimientos.
   *
   * @throws {NotFoundError} Si no existe.
   * @throws {BadRequestError} Si la subfamilia resultante no pertenece a la familia resultante.
   */
  async update(
    id: string,
    data: Partial<{
      code: string;
      description: string;
      familyId: string;
      measurementTypeId: string;
      subfamilyId: string | null;
      barcode: string | null;
      salePrice: number;
      costPrice: number;
      minStock: number;
      maxStock: number | null;
      reorderPoint: number | null;
      notes: string | null;
      isActive: boolean;
    }>,
  ) {
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Producto no encontrado");
    // Si solo cambia la familia, la subfamilia vigente también debe seguir siendo coherente.
    const familyId = data.familyId ?? existing.familyId;
    const subfamilyId = data.subfamilyId !== undefined ? data.subfamilyId : existing.subfamilyId;
    if (data.familyId !== undefined || data.subfamilyId !== undefined) {
      await assertSubfamilyBelongsToFamily(familyId, subfamilyId);
    }
    return prisma.product.update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
      include: productInclude,
    });
  },
};
