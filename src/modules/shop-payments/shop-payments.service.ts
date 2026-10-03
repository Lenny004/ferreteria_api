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
 * Selecciona el único pago pendiente más reciente de un pedido ya bloqueado.
 * La detección explícita de duplicados evita confirmar o actualizar una fila arbitraria.
 *
 * @param payments - Pagos ordenados por fecha e identificador descendentes.
 * @returns El pago pendiente más reciente o `undefined` si no existe.
 * @throws {ConflictError} Si el pedido tiene más de un pago pendiente.
 */
export function selectSinglePendingPayment<T extends { id: string; status: string }>(
  payments: readonly T[],
): T | undefined {
  const pendingPayments = payments.filter((payment) => payment.status === "PENDIENTE");
  if (pendingPayments.length > 1) {
    throw new ConflictError("El pedido tiene más de un pago pendiente; debe corregirse antes de continuar");
  }
  return pendingPayments[0];
}

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
   * Bajo el bloqueo del pedido selecciona de forma determinista un único pago PENDIENTE.
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
    data: {
      method?: ShopPaymentMethod;
      providerRef?: string;
      notes?: string;
      expectedCustomerReference?: string | null;
      expectedCustomerReferenceAt?: string | null;
    },
    webUserId: string,
  ) {
    return runWithTransactionRetry(async (tx) => {
      await lockShopOrder(tx, orderId);
      const order = await tx.shopOrder.findUnique({
        where: { id: orderId },
        include: { payments: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] } },
      });
      if (!order) throw new NotFoundError("Pedido no encontrado");
      if (order.paymentStatus === "PAGADO") throw new ConflictError("El pedido ya está pagado");
      if (order.status === "CANCELADA") throw new ConflictError("No se puede pagar un pedido cancelado");
      if (!["PENDIENTE", "EN_VERIFICACION"].includes(order.paymentStatus)) {
        throw new ConflictError("El estado de pago del pedido no permite confirmarlo");
      }

      const pendingPayment = selectSinglePendingPayment(order.payments);
      const storedReference = pendingPayment?.customerReference ?? null;
      const verifiedReference = storedReference?.trim() ?? null;
      const expectedReference = data.expectedCustomerReference?.trim() ?? data.expectedCustomerReference;
      const storedReferenceAt = pendingPayment?.customerReferenceAt ?? null;
      const expectedReferenceAt = data.expectedCustomerReferenceAt
        ? new Date(data.expectedCustomerReferenceAt)
        : null;
      const referenceMatches = verifiedReference === null
        ? expectedReference === null || expectedReference === undefined
        : expectedReference === verifiedReference &&
          expectedReferenceAt !== null &&
          expectedReferenceAt !== undefined &&
          storedReferenceAt !== null &&
          expectedReferenceAt.getTime() === new Date(storedReferenceAt).getTime();
      if (expectedReference !== null && expectedReference !== undefined && verifiedReference === null) {
        throw new ConflictError("La referencia del cliente cambió desde que abriste el pedido; recarga y revísala antes de confirmar");
      }
      if (pendingPayment && verifiedReference !== null && !referenceMatches) {
        throw new ConflictError("La referencia del cliente cambió desde que abriste el pedido; recarga y revísala antes de confirmar");
      }

      // Sin `providerRef` explícito se conserva exactamente la referencia verificada.
      const providerRef = data.providerRef?.trim() || verifiedReference || pendingPayment?.providerRef || null;
      const confirmedAt = new Date();
      if (pendingPayment) {
        await tx.shopPayment.update({
          where: { id: pendingPayment.id },
          data: {
            method: data.method ?? pendingPayment.method,
            status: "COMPLETADO",
            providerRef,
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
