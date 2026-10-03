/**
 * Primitivas de bloqueo pesimista para operaciones que cambian existencias.
 * La lectura del producto debe ocurrir después del `FOR UPDATE` para que el
 * saldo utilizado por el movimiento corresponda a la transacción vigente.
 */
import { Prisma } from "@prisma/client";

/**
 * Bloquea productos en un orden determinista para evitar lost updates y
 * reducir deadlocks cuando una transacción afecta varias líneas.
 *
 * @param tx - Cliente Prisma normal o cliente de una transacción interactiva.
 * @param productIds - Identificadores UUID de los productos a bloquear.
 * @returns Una promesa que se resuelve cuando todas las filas están bloqueadas.
 */
export async function lockProducts(
  tx: Prisma.TransactionClient,
  productIds: readonly string[],
): Promise<void> {
  const orderedIds = [...new Set(productIds)].sort();
  if (!orderedIds.length) return;

  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM public."Products"
      WHERE "id" = ANY(${orderedIds}::uuid[])
      ORDER BY "id"
      FOR UPDATE`,
  );
}

/**
 * Bloquea la orden de compra antes de validar su estado y cargar sus detalles.
 *
 * @param tx - Cliente Prisma de la transacción interactiva.
 * @param purchaseOrderId - UUID de la orden de compra.
 * @returns Una promesa que se resuelve al adquirir el bloqueo.
 */
export async function lockPurchaseOrder(
  tx: Prisma.TransactionClient,
  purchaseOrderId: string,
): Promise<void> {
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM purchasing."PurchaseOrders"
      WHERE "id" = ${purchaseOrderId}::uuid
      FOR UPDATE`,
  );
}

/**
 * Bloquea la fila del cliente de tienda para serializar sus checkouts.
 *
 * @param tx - Cliente Prisma de la transacción interactiva.
 * @param shopCustomerId - UUID del cliente autenticado.
 * @returns Una promesa que se resuelve al adquirir el bloqueo.
 */
export async function lockShopCustomer(
  tx: Prisma.TransactionClient,
  shopCustomerId: string,
): Promise<void> {
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM system."ShopCustomers"
      WHERE "id" = ${shopCustomerId}::uuid
      FOR UPDATE`,
  );
}

/**
 * Bloquea un pedido antes de confirmar manualmente su pago.
 *
 * @param tx - Cliente Prisma de la transacción interactiva.
 * @param orderId - UUID del pedido.
 * @returns Una promesa que se resuelve al adquirir el bloqueo.
 */
export async function lockShopOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM system."ShopOrders"
      WHERE "id" = ${orderId}::uuid
      FOR UPDATE`,
  );
}
