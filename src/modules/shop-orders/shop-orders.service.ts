/**
 * Servicio de pedidos de la tienda en línea: checkout, historial y gestión admin.
 * El checkout descuenta stock, registra movimiento SALIDA_VENTA y vacía el carrito.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { BadRequestError, NotFoundError } from "../../shared/errors.js";
import {
  resolveInitialPayment,
  type ShopPaymentMethod,
} from "../shop-payments/shop-payments.service.js";
import { movementMagnitude, signedMovementDelta } from "../inventory/movement-direction.js";
import { syncStockAlert } from "../inventory/inventory.service.js";
import { shopOrderClientInclude, shopOrderInclude } from "./shop-order.include.js";
import { lockProducts, lockShopCustomer } from "../../shared/stock-locks.js";
import { runWithTransactionRetry } from "../../shared/transaction-retry.js";
import { calculateIva, roundMoney } from "../../shared/tax.js";

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
        await tx.inventoryMovement.create({
          data: {
            productId: product.id,
            movementType: "SALIDA_VENTA",
            quantity,
            unitCost,
            totalCost,
            stockBefore,
            stockAfter,
            reason: `Pedido tienda ${created.id}`,
          },
        });
        await syncStockAlert(tx, product.id, stockAfter, new Prisma.Decimal(product.minStock));
      }

      await tx.shopCartItem.deleteMany({ where: { shopCustomerId } });
      return created;
    }, { maxWait: 10_000, timeout: 60_000 });

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
        include: shopOrderInclude,
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.shopOrder.count({ where }),
    ]);
    return { items, total, take, skip };
  },

  /** Actualiza estado o notas admin; no reactiva pedidos cancelados. */
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
      include: shopOrderInclude,
    });
  },
};
