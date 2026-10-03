/**
 * Include Prisma compartido para pedidos de tienda (listado, detalle, checkout).
 */

/** Orden estable de pagos para que el pago más reciente sea determinista. */
const paymentsOrderBy = [{ createdAt: "desc" as const }, { id: "desc" as const }];

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
    orderBy: paymentsOrderBy,
  },
} as const;

/** Include de pedidos para clientes: excluye identificadores internos del personal. */
export const shopOrderClientInclude = {
  lines: shopOrderInclude.lines,
  shopCustomer: shopOrderInclude.shopCustomer,
  payments: {
    orderBy: paymentsOrderBy,
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
