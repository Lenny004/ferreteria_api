/**
 * Servicio de favoritos de productos para clientes de la tienda en línea.
 */

import { prisma } from "../../lib/prisma.js";
import { ConflictError, NotFoundError } from "../../shared/errors.js";

const favoriteInclude = {
  product: {
    select: {
      id: true,
      code: true,
      description: true,
      salePrice: true,
      currentStock: true,
      family: { select: { id: true, name: true } },
      measurementType: { select: { unitLabel: true } },
    },
  },
} as const;

export const favoritesService = {
  /** Lista productos favoritos del cliente ordenados por fecha de alta. */
  async list(shopCustomerId: string) {
    return prisma.productFavorite.findMany({
      where: { shopCustomerId },
      include: favoriteInclude,
      orderBy: { createdAt: "desc" },
    });
  },

  /** Agrega producto activo a favoritos (único por cliente+producto). */
  async add(shopCustomerId: string, productId: string) {
    const product = await prisma.product.findFirst({
      where: { id: productId, isActive: true },
      select: { id: true },
    });
    if (!product) throw new NotFoundError("Producto no encontrado");

    const existing = await prisma.productFavorite.findUnique({
      where: {
        shopCustomerId_productId: { shopCustomerId, productId },
      },
    });
    if (existing) throw new ConflictError("El producto ya está en favoritos");

    return prisma.productFavorite.create({
      data: { shopCustomerId, productId },
      include: favoriteInclude,
    });
  },

  /** Quita un producto de favoritos. */
  async remove(shopCustomerId: string, productId: string) {
    const existing = await prisma.productFavorite.findUnique({
      where: {
        shopCustomerId_productId: { shopCustomerId, productId },
      },
    });
    if (!existing) throw new NotFoundError("Favorito no encontrado");
    await prisma.productFavorite.delete({ where: { id: existing.id } });
    return { removed: true };
  },
};
