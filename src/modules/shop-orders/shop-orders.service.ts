import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { BadRequestError, NotFoundError } from "../../shared/errors.js";

const orderInclude = {
  lines: {
    include: {
      product: {
        select: { id: true, code: true, description: true },
      },
    },
  },
  shopCustomer: {
    select: { id: true, email: true, fullName: true, phone: true },
  },
} as const;

async function getIvaRate(): Promise<number> {
  const setting = await prisma.setting.findUnique({ where: { key: "IvaPercentage" } });
  const n = Number(setting?.value ?? "13");
  return Number.isFinite(n) ? n / 100 : 0.13;
}

export const shopOrdersService = {
  async checkout(shopCustomerId: string, customerNotes?: string | null) {
    const cart = await prisma.shopCartItem.findMany({
      where: { shopCustomerId },
      include: {
        product: true,
      },
    });
    if (cart.length === 0) {
      throw new BadRequestError("El carrito está vacío");
    }

    for (const item of cart) {
      if (!item.product.isActive) {
        throw new BadRequestError(`Producto inactivo: ${item.product.code}`);
      }
      if (Number(item.product.currentStock) < Number(item.quantity)) {
        throw new BadRequestError(
          `Stock insuficiente para ${item.product.code} (disponible: ${item.product.currentStock})`,
        );
      }
    }

    const ivaRate = await getIvaRate();
    let subtotal = 0;
    const linesData = cart.map((item) => {
      const unitPrice = Number(item.product.salePrice);
      const quantity = Number(item.quantity);
      const lineSubtotal = unitPrice * quantity;
      subtotal += lineSubtotal;
      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.product.salePrice,
        subtotal: new Prisma.Decimal(lineSubtotal.toFixed(2)),
        unitCost: item.product.costPrice,
      };
    });
    const taxAmount = Number((subtotal * ivaRate).toFixed(2));
    const total = Number((subtotal + taxAmount).toFixed(2));

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.shopOrder.create({
        data: {
          shopCustomerId,
          status: "PENDIENTE",
          subtotal,
          taxAmount,
          total,
          customerNotes: customerNotes?.trim() || null,
          lines: {
            create: linesData.map(({ productId, quantity, unitPrice, subtotal: lineSub }) => ({
              productId,
              quantity,
              unitPrice,
              subtotal: lineSub,
            })),
          },
        },
        include: orderInclude,
      });

      for (const item of cart) {
        const qty = Number(item.quantity);
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) throw new NotFoundError("Producto no encontrado durante checkout");
        const stockBefore = Number(product.currentStock);
        if (stockBefore < qty) {
          throw new BadRequestError(`Stock insuficiente para ${product.code}`);
        }
        const stockAfter = stockBefore - qty;
        const unitCost = Number(product.costPrice);
        await tx.product.update({
          where: { id: product.id },
          data: {
            currentStock: stockAfter,
            updatedAt: new Date(),
          },
        });
        await tx.inventoryMovement.create({
          data: {
            productId: product.id,
            movementType: "VENTA",
            quantity: -qty,
            unitCost,
            totalCost: -(unitCost * qty),
            stockBefore,
            stockAfter,
            reason: `Pedido tienda ${created.id}`,
          },
        });
        if (stockAfter <= Number(product.minStock)) {
          await tx.stockAlert.create({
            data: {
              productId: product.id,
              currentStock: stockAfter,
              minStock: product.minStock,
            },
          });
        }
      }

      await tx.shopCartItem.deleteMany({ where: { shopCustomerId } });
      return created;
    });

    return order;
  },

  async listMine(shopCustomerId: string) {
    return prisma.shopOrder.findMany({
      where: { shopCustomerId },
      include: orderInclude,
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  },

  async getMine(shopCustomerId: string, orderId: string) {
    const order = await prisma.shopOrder.findFirst({
      where: { id: orderId, shopCustomerId },
      include: orderInclude,
    });
    if (!order) throw new NotFoundError("Pedido no encontrado");
    return order;
  },

  async listAdmin(params: { status?: string; q?: string; take?: number; skip?: number }) {
    const where: Prisma.ShopOrderWhereInput = {};
    if (params.status) where.status = params.status;
    if (params.q) {
      where.OR = [
        { shopCustomer: { fullName: { contains: params.q, mode: "insensitive" } } },
        { shopCustomer: { email: { contains: params.q, mode: "insensitive" } } },
        { id: { equals: params.q } },
      ];
    }
    const take = Math.min(params.take ?? 50, 200);
    const skip = params.skip ?? 0;
    const [items, total] = await Promise.all([
      prisma.shopOrder.findMany({
        where,
        include: orderInclude,
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.shopOrder.count({ where }),
    ]);
    return { items, total, take, skip };
  },

  async updateAdmin(
    orderId: string,
    data: Partial<{ status: string; adminNotes: string | null }>,
  ) {
    const existing = await prisma.shopOrder.findUnique({ where: { id: orderId } });
    if (!existing) throw new NotFoundError("Pedido no encontrado");

    const allowed = ["PENDIENTE", "CONFIRMADA", "LISTA_RETIRO", "ENTREGADA", "CANCELADA"];
    if (data.status && !allowed.includes(data.status)) {
      throw new BadRequestError("Estado de pedido inválido");
    }
    if (existing.status === "CANCELADA" && data.status && data.status !== "CANCELADA") {
      throw new BadRequestError("No se puede reactivar un pedido cancelado");
    }

    return prisma.shopOrder.update({
      where: { id: orderId },
      data: {
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.adminNotes !== undefined ? { adminNotes: data.adminNotes } : {}),
        updatedAt: new Date(),
      },
      include: orderInclude,
    });
  },
};
