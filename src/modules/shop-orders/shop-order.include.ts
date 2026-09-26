/**
 * Include Prisma compartido para pedidos de tienda (listado, detalle, checkout).
 */

export const shopOrderInclude = {
  lines: {
    include: {
      product: {
        select: { id: true, code: true, description: true, imageUrl: true, brand: true },
      },
    },
  },
  shopCustomer: {
    select: { id: true, email: true, fullName: true, phone: true },
  },
  payments: {
    orderBy: { createdAt: "desc" as const },
  },
} as const;
