/**
 * Servicio de pagos de pedidos de tienda: creación inicial en checkout y confirmación posterior.
 */

import crypto from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { BadRequestError, NotFoundError } from "../../shared/errors.js";
import { shopOrderInclude } from "../shop-orders/shop-order.include.js";

export type ShopPaymentMethod =
  | "EFECTIVO_RETIRO"
  | "TRANSFERENCIA"
  | "TARJETA"
  | "CONTRA_ENTREGA";

/** Genera referencia mock para cobro con tarjeta simulado. */
function mockCardProviderRef(): string {
  return `sim_${crypto.randomBytes(12).toString("hex")}`;
}

/** Resuelve estado inicial del pago y del pedido según método elegido en checkout. */
export function resolveInitialPayment(paymentMethod: ShopPaymentMethod, total: number) {
  switch (paymentMethod) {
    case "TARJETA":
      return {
        method: paymentMethod,
        amount: total,
        status: "COMPLETADO" as const,
        providerRef: mockCardProviderRef(),
        orderPaymentStatus: "PAGADO" as const,
      };
    case "TRANSFERENCIA":
      return {
        method: paymentMethod,
        amount: total,
        status: "PENDIENTE" as const,
        providerRef: null as string | null,
        orderPaymentStatus: "PENDIENTE" as const,
      };
    case "EFECTIVO_RETIRO":
    case "CONTRA_ENTREGA":
      return {
        method: paymentMethod,
        amount: total,
        status: "PENDIENTE" as const,
        providerRef: null as string | null,
        orderPaymentStatus: "PENDIENTE" as const,
      };
  }
}

export const shopPaymentsService = {
  /**
   * Registra o completa el pago de un pedido (p. ej. confirmación de transferencia).
   * Solo el dueño del pedido puede invocarlo.
   */
  async payOrder(
    shopCustomerId: string,
    orderId: string,
    data: { method: ShopPaymentMethod; providerRef?: string; notes?: string },
  ) {
    const order = await prisma.shopOrder.findFirst({
      where: { id: orderId, shopCustomerId },
      include: { payments: true },
    });
    if (!order) throw new NotFoundError("Pedido no encontrado");
    if (order.paymentStatus === "PAGADO") {
      throw new BadRequestError("El pedido ya está pagado");
    }
    if (order.status === "CANCELADA") {
      throw new BadRequestError("No se puede pagar un pedido cancelado");
    }

    const pendingPayment = order.payments.find((p) => p.status === "PENDIENTE");

    return prisma.$transaction(async (tx) => {
      if (pendingPayment) {
        await tx.shopPayment.update({
          where: { id: pendingPayment.id },
          data: {
            method: data.method,
            status: "COMPLETADO",
            providerRef: data.providerRef?.trim() || pendingPayment.providerRef,
            notes: data.notes?.trim() || pendingPayment.notes,
            updatedAt: new Date(),
          },
        });
      } else {
        await tx.shopPayment.create({
          data: {
            shopOrderId: orderId,
            method: data.method,
            amount: order.total,
            status: "COMPLETADO",
            providerRef: data.providerRef?.trim() || null,
            notes: data.notes?.trim() || null,
          },
        });
      }

      return tx.shopOrder.update({
        where: { id: orderId },
        data: {
          paymentStatus: "PAGADO",
          paymentMethod: data.method,
          updatedAt: new Date(),
        },
        include: shopOrderInclude,
      });
    });
  },
};
