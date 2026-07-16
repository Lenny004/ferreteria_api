/**
 * Catálogo público de la tienda en línea (sin autenticación).
 * Expone familias, subfamilias y productos activos con precio y stock.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { NotFoundError } from "../../shared/errors.js";

const publicProductSelect = {
  id: true,
  code: true,
  description: true,
  salePrice: true,
  currentStock: true,
  familyId: true,
  subfamilyId: true,
  family: { select: { id: true, code: true, name: true } },
  subfamily: { select: { id: true, name: true } },
  measurementType: { select: { id: true, code: true, name: true, unitLabel: true } },
} as const;

/** Parámetros de búsqueda y paginación del listado público de productos. */
export type PublicCatalogListParams = {
  q?: string;
  familyId?: string;
  subfamilyId?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  take?: number;
  skip?: number;
  sort?: "price_asc" | "price_desc" | "name_asc" | "name_desc";
};

export const publicCatalogService = {
  /** Lista familias activas ordenadas por nombre. */
  async listFamilies() {
    return prisma.family.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, description: true },
      orderBy: { name: "asc" },
    });
  },

  /** Lista subfamilias activas; opcionalmente filtradas por familia. */
  async listSubfamilies(familyId?: string) {
    return prisma.subfamily.findMany({
      where: {
        isActive: true,
        ...(familyId ? { familyId } : {}),
      },
      select: { id: true, familyId: true, code: true, name: true },
      orderBy: { name: "asc" },
    });
  },

  /**
   * Lista productos activos con filtros de texto, categoría, precio y disponibilidad.
   * `inStock: true` exige `currentStock > 0`.
   */
  async listProducts(params: PublicCatalogListParams) {
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
    if (params.inStock === true) {
      where.currentStock = { gt: 0 };
    }

    let orderBy: Prisma.ProductOrderByWithRelationInput = { description: "asc" };
    switch (params.sort) {
      case "price_asc":
        orderBy = { salePrice: "asc" };
        break;
      case "price_desc":
        orderBy = { salePrice: "desc" };
        break;
      case "name_desc":
        orderBy = { description: "desc" };
        break;
      default:
        orderBy = { description: "asc" };
    }

    const take = Math.min(params.take ?? 24, 100);
    const skip = params.skip ?? 0;
    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        select: publicProductSelect,
        orderBy,
        take,
        skip,
      }),
      prisma.product.count({ where }),
    ]);
    return { items, total, take, skip };
  },

  /** Detalle de un producto activo por ID. */
  async getProduct(id: string) {
    const product = await prisma.product.findFirst({
      where: { id, isActive: true },
      select: publicProductSelect,
    });
    if (!product) throw new NotFoundError("Producto no encontrado");
    return product;
  },
};
