/**
 * CRUD de productos (`inventory.Products`): búsqueda, precios, stock y relaciones de catálogo.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { NotFoundError } from "../../shared/errors.js";

const productInclude = {
  family: { select: { id: true, code: true, name: true } },
  subfamily: { select: { id: true, name: true } },
  measurementType: { select: { id: true, code: true, name: true, unitLabel: true } },
} as const;

export const productsService = {
  /** Lista productos activos con paginación; `take` máximo 200. */
  async list(params: {
    q?: string;
    familyId?: string;
    subfamilyId?: string;
    minPrice?: number;
    maxPrice?: number;
    inStock?: boolean;
    take?: number;
    skip?: number;
  }) {
    const where: Prisma.ProductWhereInput = { isActive: true };
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

  /** Crea un producto; precios y stock en cero si no se envían. */
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
   * Actualización parcial de un producto.
   *
   * @throws {NotFoundError} Si no existe.
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
    return prisma.product.update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
      include: productInclude,
    });
  },
};
