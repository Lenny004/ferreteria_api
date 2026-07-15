import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { BadRequestError, NotFoundError } from "../../shared/errors.js";

const cartInclude = {
  product: {
    select: {
      id: true,
      code: true,
      description: true,
      salePrice: true,
      currentStock: true,
      isActive: true,
      measurementType: { select: { unitLabel: true } },
    },
  },
} as const;

export const cartService = {
  async list(shopCustomerId: string) {
    const items = await prisma.shopCartItem.findMany({
      where: { shopCustomerId },
      include: cartInclude,
      orderBy: { updatedAt: "desc" },
    });
    const subtotal = items.reduce((acc, item) => {
      const price = Number(item.product.salePrice);
      const qty = Number(item.quantity);
      return acc + price * qty;
    }, 0);
    return { items, subtotal, itemCount: items.length };
  },

  async upsert(shopCustomerId: string, productId: string, quantity: number) {
    if (quantity <= 0) {
      throw new BadRequestError("La cantidad debe ser mayor a cero");
    }
    const product = await prisma.product.findFirst({
      where: { id: productId, isActive: true },
    });
    if (!product) throw new NotFoundError("Producto no encontrado");
    if (Number(product.currentStock) < quantity) {
      throw new BadRequestError("Stock insuficiente para la cantidad solicitada");
    }

    return prisma.shopCartItem.upsert({
      where: {
        shopCustomerId_productId: { shopCustomerId, productId },
      },
      create: {
        shopCustomerId,
        productId,
        quantity: new Prisma.Decimal(quantity),
      },
      update: {
        quantity: new Prisma.Decimal(quantity),
        updatedAt: new Date(),
      },
      include: cartInclude,
    });
  },

  async remove(shopCustomerId: string, productId: string) {
    const existing = await prisma.shopCartItem.findUnique({
      where: { shopCustomerId_productId: { shopCustomerId, productId } },
    });
    if (!existing) throw new NotFoundError("Ítem no está en el carrito");
    await prisma.shopCartItem.delete({ where: { id: existing.id } });
    return { removed: true };
  },

  async clear(shopCustomerId: string) {
    await prisma.shopCartItem.deleteMany({ where: { shopCustomerId } });
    return { cleared: true };
  },
};
