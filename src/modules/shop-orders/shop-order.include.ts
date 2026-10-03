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

/** Include de pedidos para clientes: excluye identificadores internos del personal. */
export const shopOrderClientInclude = {
  lines: shopOrderInclude.lines,
  shopCustomer: shopOrderInclude.shopCustomer,
  payments: {
    orderBy: { createdAt: "desc" as const },
    select: {
      id: true,
      shopOrderId: true,
      method: true,
      amount: true,
      status: true,
      providerRef: true,
      customerReference: true,
      customerReferenceAt: true,
      notes: true,
      confirmedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} as const;
