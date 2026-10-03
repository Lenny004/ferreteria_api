/**
 * Servicio de pagos de pedidos de tienda: creación inicial en checkout y confirmación posterior.
 */

import { Prisma } from "@prisma/client";
import { ConflictError, NotFoundError } from "../../shared/errors.js";
import { lockShopOrder } from "../../shared/stock-locks.js";
import { runWithTransactionRetry } from "../../shared/transaction-retry.js";
import { shopOrderInclude } from "../shop-orders/shop-order.include.js";

export type ShopPaymentMethod =
  | "EFECTIVO_RETIRO"
  | "TRANSFERENCIA"
  | "TARJETA"
  | "CONTRA_ENTREGA";

/**
 * Resuelve el estado inicial del pago elegido en checkout.
 * TODO(pasarela): integrar y verificar una pasarela real; por ahora TARJETA
 * queda PENDIENTE y solo personal autorizado confirma manualmente el pago.
 *
 * @param paymentMethod - Método declarado por el cliente.
 * @param total - Total Decimal del pedido.
 * @returns Datos de la fila pendiente y del estado del pedido.
 */
export function resolveInitialPayment(
  paymentMethod: ShopPaymentMethod,
  total: Prisma.Decimal | number | string,
) {
  const amount = new Prisma.Decimal(total);
  switch (paymentMethod) {
    case "TARJETA":
      return {
        method: paymentMethod,
        amount,
        status: "PENDIENTE" as const,
        providerRef: null as string | null,
        orderPaymentStatus: "PENDIENTE" as const,
      };
    case "TRANSFERENCIA":
      return {
        method: paymentMethod,
        amount,
        status: "PENDIENTE" as const,
        providerRef: null as string | null,
        orderPaymentStatus: "PENDIENTE" as const,
      };
    case "EFECTIVO_RETIRO":
    case "CONTRA_ENTREGA":
      return {
        method: paymentMethod,
        amount,
        status: "PENDIENTE" as const,
        providerRef: null as string | null,
        orderPaymentStatus: "PENDIENTE" as const,
      };
  }
}

export const shopPaymentsService = {
  /**
   * Confirma manualmente el pago de un pedido desde el panel administrativo.
   * El pedido se bloquea antes de validar estado para que la operación sea idempotente
   * frente a doble clic y registre el usuario y la hora de confirmación.
   *
   * @param orderId - UUID del pedido que personal confirma.
   * @param data - Método y referencias opcionales validadas por Zod.
   * @param webUserId - UUID del WebUser autenticado que realiza la confirmación.
   * @returns Pedido actualizado con estado de pago PAGADO.
   * @throws {NotFoundError} Si el pedido no existe.
   * @throws {ConflictError} Si el pedido está pagado, cancelado o en un estado de pago no confirmable.
   */
  async payOrder(
    orderId: string,
    data: { method?: ShopPaymentMethod; providerRef?: string; notes?: string },
    webUserId: string,
  ) {
    return runWithTransactionRetry(async (tx) => {
      await lockShopOrder(tx, orderId);
      const order = await tx.shopOrder.findUnique({
        where: { id: orderId },
        include: { payments: true },
      });
      if (!order) throw new NotFoundError("Pedido no encontrado");
      if (order.paymentStatus === "PAGADO") throw new ConflictError("El pedido ya está pagado");
      if (order.status === "CANCELADA") throw new ConflictError("No se puede pagar un pedido cancelado");
      if (!["PENDIENTE", "EN_VERIFICACION"].includes(order.paymentStatus)) {
        throw new ConflictError("El estado de pago del pedido no permite confirmarlo");
      }

      const pendingPayment = order.payments.find((p) => p.status === "PENDIENTE");
      // Sin `providerRef` explícito se conserva la referencia que informó el cliente.
      const customerReference = pendingPayment?.customerReference ?? null;
      const providerRef = data.providerRef?.trim() || customerReference;
      const confirmedAt = new Date();
      if (pendingPayment) {
        await tx.shopPayment.update({
          where: { id: pendingPayment.id },
          data: {
            method: data.method ?? pendingPayment.method,
            status: "COMPLETADO",
            providerRef: providerRef || pendingPayment.providerRef,
            notes: data.notes?.trim() || pendingPayment.notes,
            confirmedByWebUserId: webUserId,
            confirmedAt,
            updatedAt: confirmedAt,
          },
        });
      } else {
        await tx.shopPayment.create({
          data: {
            shopOrderId: orderId,
            method: data.method ?? "EFECTIVO_RETIRO",
            amount: order.total,
            status: "COMPLETADO",
            providerRef,
            notes: data.notes?.trim() || null,
            confirmedByWebUserId: webUserId,
            confirmedAt,
          },
        });
      }

      return tx.shopOrder.update({
        where: { id: orderId },
        data: {
          paymentStatus: "PAGADO",
          paymentMethod: data.method ?? order.paymentMethod ?? "EFECTIVO_RETIRO",
          updatedAt: confirmedAt,
        },
        include: shopOrderInclude,
      });
    });
  },
};
