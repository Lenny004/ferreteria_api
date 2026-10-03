/**
 * Servicio de pedidos de la tienda en línea: checkout, historial y gestión admin.
 * El checkout descuenta stock, registra movimiento SALIDA_VENTA y vacía el carrito.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../shared/errors.js";
import {
  resolveInitialPayment,
  selectSinglePendingPayment,
  type ShopPaymentMethod,
} from "../shop-payments/shop-payments.service.js";
import { movementMagnitude, signedMovementDelta } from "../inventory/movement-direction.js";
import { syncStockAlert } from "../inventory/inventory.service.js";
import { shopOrderClientInclude, shopOrderInclude } from "./shop-order.include.js";
import {
  lockProducts,
  lockShopCustomer,
  lockShopOrder,
  lockShopOrderForCustomer,
} from "../../shared/stock-locks.js";
import { runWithTransactionRetry } from "../../shared/transaction-retry.js";
import { calculateIva, roundMoney } from "../../shared/tax.js";

type ShopOrderMovementRow = {
  productId: string;
  movementType: string;
  quantity: string;
  unitCost: string;
};

type RestockSummary = {
  quantitySold: Prisma.Decimal;
  quantityReturned: Prisma.Decimal;
  weightedCost: Prisma.Decimal;
};

/**
 * Calcula la cantidad aún no devuelta y el costo promedio de las salidas del pedido.
 * Incluye movimientos antiguos sin `ShopOrderId` cuando conservan el motivo exacto
 * del checkout o de la cancelación anterior.
 *
 * @param tx - Cliente Prisma de la transacción activa.
 * @param orderId - UUID del pedido cancelado.
 * @returns Resumen por producto para la reposición idempotente.
 */
async function calculatePendingRestock(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<Map<string, RestockSummary>> {
  const rows = await tx.$queryRaw<ShopOrderMovementRow[]>(
    Prisma.sql`SELECT "ProductId" AS "productId", "MovementType" AS "movementType",
      "quantity"::text AS quantity, "UnitCost"::text AS "unitCost"
      FROM public."InventoryMovements"
      WHERE "MovementType" IN ('SALIDA_VENTA', 'ENTRADA_DEVOLUCION')
        AND (
          "ShopOrderId" = ${orderId}::uuid
          OR (
            "ShopOrderId" IS NULL
            AND (
              ("MovementType" = 'SALIDA_VENTA' AND "reason" = ${`Pedido tienda ${orderId}`})
              OR ("MovementType" = 'ENTRADA_DEVOLUCION' AND "reason" = ${`Cancelación pedido tienda ${orderId}`})
            )
          )
        )
      ORDER BY "ProductId", "CreatedAt", "id"`,
  );
  const summary = new Map<string, RestockSummary>();
  for (const row of rows) {
    const current = summary.get(row.productId) ?? {
      quantitySold: new Prisma.Decimal(0),
      quantityReturned: new Prisma.Decimal(0),
      weightedCost: new Prisma.Decimal(0),
    };
    const quantity = new Prisma.Decimal(row.quantity).abs();
    if (row.movementType === "SALIDA_VENTA") {
      current.quantitySold = current.quantitySold.add(quantity);
      current.weightedCost = current.weightedCost.add(
        quantity.mul(new Prisma.Decimal(row.unitCost).abs()),
      );
    } else {
      current.quantityReturned = current.quantityReturned.add(quantity);
    }
    summary.set(row.productId, current);
  }
  return summary;
}

/** Opciones validadas para convertir el carrito de un cliente en pedido. */
export type CheckoutOptions = {
  customerNotes?: string | null;
  deliveryType?: "RETIRO_TIENDA" | "ENVIO";
  shippingAddress?: string;
  paymentMethod?: ShopPaymentMethod;
};

export const shopOrdersService = {
  /**
   * Convierte carrito en pedido PENDIENTE en transacción atómica.
   * Totales: cada línea y el IVA usan Decimal y HALF_UP a dos decimales.
   * Por cada línea: movimiento SALIDA_VENTA, actualización de stock y alerta si queda en o bajo mínimo.
   * Bloquea primero al cliente y luego los productos para serializar doble clics
   * y calcular todos los saldos desde lecturas posteriores al bloqueo.
   *
   * El pago inicial se crea anidado con el pedido nuevo: un pedido recién insertado
   * en esta transacción no puede tener otro pago pendiente.
   *
   * @param shopCustomerId - UUID del cliente autenticado.
   * @param options - Entrega, notas y método de pago validados.
   * @returns Pedido creado y sus relaciones incluidas.
   * @throws {BadRequestError} Si el carrito está vacío, hay producto inactivo o falta stock.
   * @throws {NotFoundError} Si un producto desaparece antes de procesar el pedido.
   */
  async checkout(shopCustomerId: string, options: CheckoutOptions = {}) {
    const deliveryType = options.deliveryType ?? "RETIRO_TIENDA";
    const shippingAddress =
      deliveryType === "ENVIO" ? options.shippingAddress?.trim() || null : null;
    const paymentMethod = options.paymentMethod ?? null;
    const order = await runWithTransactionRetry(async (tx) => {
      // El bloqueo del cliente hace que dos clics sobre el mismo carrito se serialicen.
      await lockShopCustomer(tx, shopCustomerId);
      const cart = await tx.shopCartItem.findMany({ where: { shopCustomerId } });
      if (cart.length === 0) throw new BadRequestError("El carrito está vacío");

      await lockProducts(tx, cart.map((item) => item.productId));
      const products = new Map<string, NonNullable<Awaited<ReturnType<typeof tx.product.findUnique>>>>();
      for (const item of cart) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) throw new NotFoundError("Producto no encontrado durante checkout");
        products.set(item.productId, product);
      }

      const quantitiesByProduct = new Map<string, Prisma.Decimal>();
      for (const item of cart) {
        const quantity = new Prisma.Decimal(item.quantity);
        quantitiesByProduct.set(
          item.productId,
          (quantitiesByProduct.get(item.productId) ?? new Prisma.Decimal(0)).add(quantity),
        );
      }

      for (const [productId, quantity] of quantitiesByProduct) {
        const product = products.get(productId)!;
        if (!product.isActive) throw new BadRequestError(`Producto inactivo: ${product.code}`);
        if (new Prisma.Decimal(product.currentStock).lessThan(quantity)) {
          throw new BadRequestError(`Stock insuficiente para ${product.code} (disponible: ${product.currentStock})`);
        }
      }

      let subtotal = new Prisma.Decimal(0);
      const linesData = cart.map((item) => {
        const product = products.get(item.productId)!;
        const quantity = new Prisma.Decimal(item.quantity);
        const lineSubtotal = roundMoney(new Prisma.Decimal(product.salePrice).mul(quantity));
        subtotal = subtotal.add(lineSubtotal);
        return {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: product.salePrice,
          subtotal: lineSubtotal,
          unitCost: product.costPrice,
        };
      });
      const taxAmount = calculateIva(subtotal);
      const total = roundMoney(subtotal.add(taxAmount));
      const initialPayment = paymentMethod ? resolveInitialPayment(paymentMethod, total) : null;

      const created = await tx.shopOrder.create({
        data: {
          shopCustomerId,
          status: "PENDIENTE",
          subtotal: roundMoney(subtotal),
          taxAmount,
          total,
          deliveryType,
          shippingAddress,
          paymentMethod,
          paymentStatus: initialPayment?.orderPaymentStatus ?? "PENDIENTE",
          customerNotes: options.customerNotes?.trim() || null,
          lines: {
            create: linesData.map(({ productId, quantity, unitPrice, subtotal: lineSub }) => ({
              productId,
              quantity,
              unitPrice,
              subtotal: lineSub,
            })),
          },
          ...(initialPayment
            ? {
                payments: {
                  create: {
                    method: initialPayment.method,
                    amount: initialPayment.amount,
                    status: initialPayment.status,
                    providerRef: initialPayment.providerRef,
                  },
                },
              }
            : {}),
        },
        include: shopOrderClientInclude,
      });

      for (const item of cart) {
        const qty = new Prisma.Decimal(item.quantity);
        const product = products.get(item.productId)!;
        const stockBefore = new Prisma.Decimal(product.currentStock);
        const delta = signedMovementDelta("SALIDA_VENTA", qty);
        const stockAfter = stockBefore.add(delta);
        if (stockAfter.isNegative()) {
          throw new BadRequestError(`Stock insuficiente para ${product.code}`);
        }
        const unitCost = new Prisma.Decimal(product.costPrice);
        const quantity = movementMagnitude(qty);
        const totalCost = unitCost.mul(quantity).abs();
        await tx.product.update({
          where: { id: product.id },
          data: {
            currentStock: stockAfter,
            updatedAt: new Date(),
          },
        });
        products.set(product.id, { ...product, currentStock: stockAfter });
        // `shopOrderId` vincula la salida al pedido para reponer exactamente lo vendido al cancelar.
        await tx.inventoryMovement.create({
          data: {
            productId: product.id,
            movementType: "SALIDA_VENTA",
            quantity,
            unitCost,
            totalCost,
            stockBefore,
            stockAfter,
            shopOrderId: created.id,
            reason: `Pedido tienda ${created.id}`,
          },
        });
        await syncStockAlert(tx, product.id, stockAfter, new Prisma.Decimal(product.minStock));
      }

      await tx.shopCartItem.deleteMany({
        where: {
          id: { in: cart.map((item) => item.id) },
          shopCustomerId,
        },
      });
      return created;
    });

    return order;
  },

  /** Historial de pedidos del cliente (últimos 50). */
  async listMine(shopCustomerId: string) {
    return prisma.shopOrder.findMany({
      where: { shopCustomerId },
      include: shopOrderClientInclude,
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  },

  /** Detalle de un pedido propio. */
  async getMine(shopCustomerId: string, orderId: string) {
    const order = await prisma.shopOrder.findFirst({
      where: { id: orderId, shopCustomerId },
      include: shopOrderClientInclude,
    });
    if (!order) throw new NotFoundError("Pedido no encontrado");
    return order;
  },

  /** Lista pedidos para administración con filtros. */
  async listAdmin(params: {
    status?: string;
    paymentStatus?: string;
    q?: string;
    take?: number;
    skip?: number;
  }) {
    const where: Prisma.ShopOrderWhereInput = {};
    if (params.status) where.status = params.status;
    if (params.paymentStatus) where.paymentStatus = params.paymentStatus;
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
        include: shopOrderInclude,
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.shopOrder.count({ where }),
    ]);
    return { items, total, take, skip };
  },

  /**
   * Obtiene el detalle administrativo de un pedido con pagos y cliente.
   *
   * @param orderId - UUID del pedido.
   * @returns Pedido con líneas, cliente y pagos.
   * @throws {NotFoundError} Si el pedido no existe.
   */
  async getAdmin(orderId: string) {
    const order = await prisma.shopOrder.findUnique({
      where: { id: orderId },
      include: shopOrderInclude,
    });
    if (!order) throw new NotFoundError("Pedido no encontrado");
    return order;
  },

  /**
   * Actualiza estado o notas admin bajo bloqueo; no reactiva pedidos cancelados.
   * Cancelar durante EN_VERIFICACION exige una nota nueva antes de reponer inventario.
   * Al cancelar, bloquea primero el pedido y después los productos. Checkout,
   * recepción de OC y esta operación comparten el orden de productos entre sus
   * fases de stock; `payOrder` solo bloquea el pedido, por lo que no introduce
   * un ciclo de espera.
   *
   * @param orderId - UUID del pedido.
   * @param data - Estado y notas administrativas validadas.
   * @returns Pedido actualizado con sus relaciones.
   * @throws {NotFoundError} Si el pedido no existe.
   * @throws {ConflictError} Si se reactiva, cancela un pedido pagado o hay estado incompatible.
   * @throws {BadRequestError} Si el estado no pertenece al catálogo permitido.
   */
  async updateAdmin(
    orderId: string,
    data: Partial<{ status: string; adminNotes: string | null }>,
  ) {
    const allowed = ["PENDIENTE", "CONFIRMADA", "LISTA_RETIRO", "ENTREGADA", "CANCELADA"];
    if (data.status && !allowed.includes(data.status)) {
      throw new BadRequestError("Estado de pedido inválido");
    }
    return runWithTransactionRetry(async (tx) => {
      await lockShopOrder(tx, orderId);
      const existing = await tx.shopOrder.findUnique({ where: { id: orderId } });
      if (!existing) throw new NotFoundError("Pedido no encontrado");
      if (existing.status === "CANCELADA" && data.status && data.status !== "CANCELADA") {
        throw new ConflictError("No se puede reactivar un pedido cancelado");
      }
      if (data.status === "CANCELADA" && existing.paymentStatus === "PAGADO") {
        throw new ConflictError("Pedido pagado: no se puede cancelar sin un reembolso registrado");
      }
      if (data.status === "CANCELADA" && existing.status === "ENTREGADA") {
        throw new ConflictError("Pedido entregado: registra una devolución en lugar de cancelar");
      }
      const cancellationNote = data.adminNotes?.trim();
      if (data.status === "CANCELADA" && existing.status !== "CANCELADA" && existing.paymentStatus === "EN_VERIFICACION") {
        if (!cancellationNote || cancellationNote === existing.adminNotes?.trim()) {
          throw new BadRequestError("Indica una nota para cancelar un pedido con pago en verificación");
        }
      }

      if (data.status === "CANCELADA" && existing.status !== "CANCELADA") {
        const summary = await calculatePendingRestock(tx, orderId);
        const pendingByProduct = new Map<string, { quantity: Prisma.Decimal; unitCost: Prisma.Decimal }>();
        for (const [productId, item] of summary) {
          const quantity = item.quantitySold.sub(item.quantityReturned);
          if (quantity.greaterThan(0)) {
            pendingByProduct.set(productId, {
              quantity,
              unitCost: item.quantitySold.greaterThan(0)
                ? item.weightedCost.div(item.quantitySold).toDecimalPlaces(4)
                : new Prisma.Decimal(0),
            });
          }
        }

        const productIds = [...pendingByProduct.keys()];
        await lockProducts(tx, productIds);
        const products = await tx.product.findMany({ where: { id: { in: productIds } } });
        const productsById = new Map(products.map((product) => [product.id, product]));
        for (const productId of productIds.sort()) {
          const product = productsById.get(productId);
          const pending = pendingByProduct.get(productId)!;
          if (!product) throw new NotFoundError(`Producto ${productId} no encontrado`);
          const stockBefore = new Prisma.Decimal(product.currentStock);
          const stockAfter = stockBefore.add(pending.quantity);
          const totalCost = pending.unitCost.mul(pending.quantity).toDecimalPlaces(4);
          await tx.product.update({
            where: { id: productId },
            data: { currentStock: stockAfter, updatedAt: new Date() },
          });
          await tx.inventoryMovement.create({
            data: {
              productId,
              movementType: "ENTRADA_DEVOLUCION",
              quantity: pending.quantity,
              unitCost: pending.unitCost,
              totalCost,
              stockBefore,
              stockAfter,
              shopOrderId: orderId,
              reason: `Cancelación pedido tienda ${orderId}`,
            },
          });
          await syncStockAlert(tx, productId, stockAfter, new Prisma.Decimal(product.minStock));
        }
      }

      return tx.shopOrder.update({
        where: { id: orderId },
        data: {
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.status === "CANCELADA" && cancellationNote
            ? { adminNotes: cancellationNote }
            : data.adminNotes !== undefined
              ? { adminNotes: data.adminNotes }
              : {}),
          updatedAt: new Date(),
        },
        include: shopOrderInclude,
      });
    });
  },

  /**
   * Registra o reemplaza la referencia de transferencia enviada por el dueño del pedido.
   * Bajo el bloqueo del pedido actualiza únicamente el pago PENDIENTE más reciente.
   * La operación solo deja el pago en verificación; nunca confirma ni completa el pedido.
   *
   * @param shopCustomerId - UUID del cliente autenticado.
   * @param orderId - UUID del pedido propio.
   * @param data - Referencia y notas validadas por el controlador.
   * @returns Pedido actualizado para la vista del cliente.
   * @throws {NotFoundError} Si el pedido no existe o no pertenece al cliente.
   * @throws {ConflictError} Si el método, estado de pago o estado del pedido no permiten referencias.
   */
  async submitTransferReference(
    shopCustomerId: string,
    orderId: string,
    data: { reference: string; notes?: string },
  ) {
    return runWithTransactionRetry(async (tx) => {
      const ownsOrder = await lockShopOrderForCustomer(tx, orderId, shopCustomerId);
      if (!ownsOrder) throw new NotFoundError("Pedido no encontrado");
      const order = await tx.shopOrder.findFirst({
        where: { id: orderId, shopCustomerId },
        include: { payments: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] } },
      });
      if (!order) throw new NotFoundError("Pedido no encontrado");
      if (order.status === "CANCELADA") {
        throw new ConflictError("No se puede registrar una transferencia en un pedido cancelado");
      }
      if (order.paymentMethod !== "TRANSFERENCIA") {
        throw new ConflictError("El pedido no usa transferencia bancaria");
      }
      if (!["PENDIENTE", "EN_VERIFICACION"].includes(order.paymentStatus)) {
        throw new ConflictError("El estado de pago del pedido no permite registrar una referencia");
      }

      const pendingPayment = selectSinglePendingPayment(order.payments);
      const now = new Date();
      if (pendingPayment) {
        // Solo se registra la referencia: el pago sigue PENDIENTE hasta que el personal lo confirme.
        await tx.shopPayment.update({
          where: { id: pendingPayment.id },
          data: {
            customerReference: data.reference.trim(),
            customerReferenceAt: now,
            ...(data.notes !== undefined ? { notes: data.notes.trim() || null } : {}),
            updatedAt: now,
          },
        });
      } else {
        await tx.shopPayment.create({
          data: {
            shopOrderId: order.id,
            method: "TRANSFERENCIA",
            amount: order.total,
            status: "PENDIENTE",
            customerReference: data.reference.trim(),
            customerReferenceAt: now,
            notes: data.notes?.trim() || null,
          },
        });
      }

      return tx.shopOrder.update({
        where: { id: order.id },
        data: { paymentStatus: "EN_VERIFICACION", updatedAt: now },
        include: shopOrderClientInclude,
      });
    });
  },
};
