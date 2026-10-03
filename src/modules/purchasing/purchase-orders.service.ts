/**
 * Servicio de órdenes de compra: ciclo BORRADOR → CONFIRMADA → RECIBIDA.
 * Al recibir, genera movimientos `ENTRADA_COMPRA` y actualiza stock/costo promedio.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { BadRequestError, ConflictError, NotFoundError, UnauthorizedError } from "../../shared/errors.js";
import { lockProducts, lockPurchaseOrder } from "../../shared/stock-locks.js";
import { runWithTransactionRetry } from "../../shared/transaction-retry.js";
import { syncStockAlert } from "../inventory/inventory.service.js";

export type PurchaseOrderStatus = "BORRADOR" | "CONFIRMADA" | "RECIBIDA" | "CANCELADA";

const DEFAULT_TAX_RATE = 0.13;

const orderInclude = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  },
  createdByWebUser: {
    select: {
      id: true,
      username: true,
      role: true,
    },
  },
  receivedByWebUser: {
    select: {
      id: true,
      username: true,
    },
  },
  supplier: {
    select: {
      id: true,
      name: true,
      tradeName: true,
      nit: true,
      nrc: true,
      country: true,
    },
  },
  details: {
    include: {
      product: {
        select: {
          id: true,
          code: true,
          description: true,
          currentStock: true,
          costPrice: true,
        },
      },
    },
    orderBy: { product: { code: "asc" as const } },
  },
} as const;

type OrderLineInput = {
  productId: string;
  quantity: number;
  unitCost: number;
  taxRate?: number;
  notes?: string | null;
};

/** Identidad administrativa que origina una orden de compra. */
export type PurchaseOrderActor = {
  userId: string;
  role: string;
};

function toDecimal(value: number | string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

/** Calcula subtotal, IVA y total de una línea: `subtotal = qty × costo`, `tax = subtotal × tasa`. */
function lineAmounts(quantity: number, unitCost: number, taxRate: number) {
  const qty = toDecimal(quantity);
  const cost = toDecimal(unitCost);
  const rate = toDecimal(taxRate);
  const subtotal = qty.mul(cost).toDecimalPlaces(2);
  const tax = subtotal.mul(rate).toDecimalPlaces(2);
  const total = subtotal.add(tax);
  return { subtotal, tax, total, qty, cost, rate };
}

function computeOrderTotals(lines: OrderLineInput[]) {
  let subtotal = new Prisma.Decimal(0);
  let taxAmount = new Prisma.Decimal(0);
  const detailRows = lines.map((line) => {
    const taxRate = line.taxRate ?? DEFAULT_TAX_RATE;
    if (!(line.quantity > 0)) throw new BadRequestError("La cantidad debe ser mayor que cero");
    if (!(line.unitCost > 0)) throw new BadRequestError("El costo unitario debe ser mayor que cero");
    const amounts = lineAmounts(line.quantity, line.unitCost, taxRate);
    subtotal = subtotal.add(amounts.subtotal);
    taxAmount = taxAmount.add(amounts.tax);
    return {
      productId: line.productId,
      quantity: amounts.qty,
      unitCost: amounts.cost,
      taxRate: amounts.rate,
      subtotal: amounts.subtotal,
      total: amounts.total,
      notes: line.notes ?? undefined,
    };
  });
  return {
    detailRows,
    subtotal,
    taxAmount,
    total: subtotal.add(taxAmount),
  };
}

/** Costo promedio ponderado: (stock×costo + qty×nuevo) / (stock+qty). Si stock=0 → nuevo. */
export function weightedAverageCost(
  stockBefore: Prisma.Decimal,
  costBefore: Prisma.Decimal,
  qtyIn: Prisma.Decimal,
  unitCostIn: Prisma.Decimal,
): Prisma.Decimal {
  if (qtyIn.lessThanOrEqualTo(0)) return costBefore;
  if (stockBefore.lessThanOrEqualTo(0)) return unitCostIn;
  const numerator = stockBefore.mul(costBefore).add(qtyIn.mul(unitCostIn));
  const denominator = stockBefore.add(qtyIn);
  return numerator.div(denominator).toDecimalPlaces(4);
}

/**
 * Resuelve al empleado activo vinculado al usuario autenticado para atribuir una recepción.
 * No usa un empleado sustituto: una recepción sin vínculo conserva `ReceivedById` nulo.
 *
 * @param tx - Cliente Prisma de la transacción activa.
 * @param webUserId - UUID del usuario del panel que recibe la OC.
 * @returns UUID del empleado activo vinculado o `null` si no existe vínculo válido.
 */
async function resolveReceivingEmployeeId(
  tx: Prisma.TransactionClient,
  webUserId?: string,
): Promise<string | null> {
  if (!webUserId) return null;
  const user = await tx.webUser.findUnique({
    where: { id: webUserId },
    select: { employeeId: true },
  });
  if (!user?.employeeId) return null;
  const employee = await tx.employee.findUnique({
    where: { id: user.employeeId },
    select: { id: true, isActive: true },
  });
  return employee?.isActive ? employee.id : null;
}

export const purchaseOrdersService = {
  /** Lista órdenes de compra con filtros de estado, proveedor y texto. */
  async list(params: {
    q?: string;
    status?: string;
    supplierId?: string;
    take?: number;
    skip?: number;
  }) {
    const where: Prisma.PurchaseOrderWhereInput = {};
    if (params.status) where.status = params.status;
    if (params.supplierId) where.supplierId = params.supplierId;
    if (params.q) {
      where.OR = [
        { supplierDocNumber: { contains: params.q, mode: "insensitive" } },
        { notes: { contains: params.q, mode: "insensitive" } },
        { supplier: { name: { contains: params.q, mode: "insensitive" } } },
      ];
    }
    const take = Math.min(params.take ?? 50, 200);
    const skip = params.skip ?? 0;
    const [items, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true },
          },
          createdByWebUser: {
            select: { id: true, username: true, role: true },
          },
          receivedByWebUser: {
            select: { id: true, username: true },
          },
          supplier: { select: { id: true, name: true, nit: true, country: true } },
          _count: { select: { details: true } },
        },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.purchaseOrder.count({ where }),
    ]);
    return { items, total, take, skip };
  },

  /** Obtiene una OC con proveedor, líneas y productos. */
  async getById(id: string) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: orderInclude,
    });
    if (!order) throw new NotFoundError("Orden de compra no encontrada");
    return order;
  },

  /**
   * Crea una OC en BORRADOR usando el empleado activo vinculado al WebUser cuando existe.
   * ADMIN y OWNER pueden crearla sin empleado y siempre se registra el WebUser creador;
   * la operación se ejecuta dentro de una transacción con reintento.
   *
   * @param input - Proveedor, líneas y datos administrativos validados.
   * @param actor - Identidad y rol del usuario autenticado del panel.
   * @throws {UnauthorizedError} Si falta la identidad autenticada.
   * @throws {BadRequestError} Si un rol distinto de ADMIN/OWNER no tiene empleado activo vinculado.
   * @returns Orden creada con proveedor, líneas y productos.
   * @throws {NotFoundError} Si el proveedor no existe o está inactivo.
   */
  async create(
    input: {
      supplierId: string;
      supplierDocNumber?: string | null;
      supplierDocType?: string | null;
      notes?: string | null;
      expectedDate?: string | null;
      lines: OrderLineInput[];
    },
    actor: PurchaseOrderActor,
  ) {
    if (!actor?.userId || !actor.role) throw new UnauthorizedError("No autorizado: falta el usuario autenticado");
    if (!input.lines?.length) throw new BadRequestError("La orden debe tener al menos una línea");
    const { detailRows, subtotal, taxAmount, total } = computeOrderTotals(input.lines);

    return runWithTransactionRetry(async (tx) => {
      const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
      if (!supplier || !supplier.isActive) {
        throw new NotFoundError("Proveedor no encontrado o inactivo");
      }

      const employeeId = await resolveReceivingEmployeeId(tx, actor.userId);
      if (!employeeId && !["ADMIN", "OWNER"].includes(actor.role)) {
        throw new BadRequestError("Tu usuario no está vinculado a un empleado activo; vincúlalo para crear órdenes de compra");
      }

      const productIds = [...new Set(detailRows.map((d) => d.productId))];
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, isActive: true },
        select: { id: true },
      });
      if (products.length !== productIds.length) {
        throw new BadRequestError("Uno o más productos no existen o están inactivos");
      }

      return tx.purchaseOrder.create({
        data: {
          supplierId: input.supplierId,
          employeeId,
          createdByWebUserId: actor.userId,
          supplierDocNumber: input.supplierDocNumber ?? undefined,
          supplierDocType: input.supplierDocType ?? undefined,
          notes: input.notes ?? undefined,
          expectedDate: input.expectedDate ? new Date(input.expectedDate) : undefined,
          status: "BORRADOR",
          subtotal,
          taxAmount,
          total,
          details: { create: detailRows },
        },
        include: orderInclude,
      });
    });
  },

  /**
   * Actualiza una OC dentro de una transacción bloqueada; puede reemplazar líneas y recalcular totales.
   *
   * @param id - UUID de la orden de compra.
   * @param input - Campos validados y líneas opcionales de la OC.
   * @returns Orden actualizada con proveedor, líneas y productos.
   * @throws {NotFoundError} Si la OC o el proveedor no existen.
   * @throws {ConflictError} Si la OC no está en BORRADOR.
   * @throws {BadRequestError} Si las líneas no cumplen las reglas de cantidades y costos.
   */
  async update(
    id: string,
    input: {
      supplierId?: string;
      supplierDocNumber?: string | null;
      supplierDocType?: string | null;
      notes?: string | null;
      expectedDate?: string | null;
      lines?: OrderLineInput[];
    },
  ) {
    return runWithTransactionRetry(async (tx) => {
      await lockPurchaseOrder(tx, id);
      const existing = await tx.purchaseOrder.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError("Orden de compra no encontrada");
      if (existing.status !== "BORRADOR") {
        throw new ConflictError("Solo se pueden editar órdenes en estado BORRADOR");
      }

      if (input.supplierId) {
        const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
        if (!supplier || !supplier.isActive) {
          throw new NotFoundError("Proveedor no encontrado o inactivo");
        }
      }

      const totals = input.lines ? computeOrderTotals(input.lines) : null;
      if (totals) {
        await tx.purchaseOrderDetail.deleteMany({ where: { purchaseOrderId: id } });
        await tx.purchaseOrderDetail.createMany({
          data: totals.detailRows.map((d) => ({ ...d, purchaseOrderId: id })),
        });
      }

      return tx.purchaseOrder.update({
        where: { id },
        data: {
          supplierId: input.supplierId,
          supplierDocNumber: input.supplierDocNumber === undefined ? undefined : input.supplierDocNumber,
          supplierDocType: input.supplierDocType === undefined ? undefined : input.supplierDocType,
          notes: input.notes === undefined ? undefined : input.notes,
          expectedDate:
            input.expectedDate === undefined
              ? undefined
              : input.expectedDate
                ? new Date(input.expectedDate)
                : null,
          ...(totals
            ? {
                subtotal: totals.subtotal,
                taxAmount: totals.taxAmount,
                total: totals.total,
              }
            : {}),
          updatedAt: new Date(),
        },
        include: orderInclude,
      });
    });
  },

  /**
   * Pasa una OC de BORRADOR a CONFIRMADA bajo bloqueo pesimista.
   *
   * @param id - UUID de la orden de compra.
   * @returns Orden confirmada con sus relaciones.
   * @throws {NotFoundError} Si la OC no existe.
   * @throws {ConflictError} Si la OC no está en BORRADOR.
   * @throws {BadRequestError} Si la OC no tiene líneas.
   */
  async confirm(id: string) {
    return runWithTransactionRetry(async (tx) => {
      await lockPurchaseOrder(tx, id);
      const order = await tx.purchaseOrder.findUnique({
        where: { id },
        include: { details: true },
      });
      if (!order) throw new NotFoundError("Orden de compra no encontrada");
      if (order.status !== "BORRADOR") {
        throw new ConflictError("Solo se pueden confirmar órdenes en BORRADOR");
      }
      if (!order.details.length) {
        throw new BadRequestError("La orden no tiene líneas");
      }
      return tx.purchaseOrder.update({
        where: { id },
        data: { status: "CONFIRMADA", updatedAt: new Date() },
        include: orderInclude,
      });
    });
  },

  /**
   * Cancela una OC que no esté RECIBIDA; repetir CANCELADA devuelve la misma OC.
   *
   * @param id - UUID de la orden de compra.
   * @returns Orden cancelada o ya cancelada.
   * @throws {NotFoundError} Si la OC no existe.
   * @throws {ConflictError} Si la OC ya fue recibida.
   */
  async cancel(id: string) {
    return runWithTransactionRetry(async (tx) => {
      await lockPurchaseOrder(tx, id);
      const order = await tx.purchaseOrder.findUnique({
        where: { id },
        include: orderInclude,
      });
      if (!order) throw new NotFoundError("Orden de compra no encontrada");
      if (order.status === "RECIBIDA") {
        throw new ConflictError("No se puede cancelar una orden ya recibida");
      }
      if (order.status === "CANCELADA") return order;
      return tx.purchaseOrder.update({
        where: { id },
        data: { status: "CANCELADA", updatedAt: new Date() },
        include: orderInclude,
      });
    });
  },

  /**
   * Recibe OC CONFIRMADA (o BORRADOR): genera ENTRADA_COMPRA por línea,
   * actualiza stock y costPrice con promedio ponderado.
   * La OC y todos sus productos se bloquean en orden determinista antes de
   * validar estado o calcular saldos.
   * Registra el WebUser receptor en la OC y conserva `InventoryMovements` sin
   * una columna nueva: el usuario se obtiene por `PurchaseOrderId`.
   *
   * @param id - UUID de la orden de compra.
   * @param input - Datos opcionales del documento de recepción.
   * @param webUserId - Usuario web que solicita la recepción; su empleado activo vinculado atribuye el movimiento.
   * @returns Orden recibida con sus detalles.
   * @throws {ConflictError} Si la orden ya fue recibida o está cancelada.
   * @throws {BadRequestError} Si la orden no tiene líneas o costos válidos.
   * @throws {NotFoundError} Si la orden o un producto no existe.
   */
  async receive(
    id: string,
    input: {
      supplierDocNumber?: string | null;
      supplierDocType?: string | null;
    } = {},
    webUserId?: string,
  ) {
    return runWithTransactionRetry(async (tx) => {
      await lockPurchaseOrder(tx, id);
      const order = await tx.purchaseOrder.findUnique({
        where: { id },
        include: { details: true },
      });
      if (!order) throw new NotFoundError("Orden de compra no encontrada");
      if (order.status === "RECIBIDA") {
        throw new ConflictError("La orden ya fue recibida");
      }
      if (order.status === "CANCELADA") {
        throw new ConflictError("No se puede recibir una orden cancelada");
      }
      if (!order.details.length) {
        throw new BadRequestError("La orden no tiene líneas");
      }

      for (const detail of order.details) {
        if (new Prisma.Decimal(detail.unitCost).lessThanOrEqualTo(0)) {
          throw new BadRequestError("El costo unitario debe ser mayor que cero al recibir");
        }
      }

      await lockProducts(tx, order.details.map((detail) => detail.productId));

      const receivedById = await resolveReceivingEmployeeId(tx, webUserId);

      for (const detail of order.details) {
        const product = await tx.product.findUnique({ where: { id: detail.productId } });
        if (!product || !product.isActive) {
          throw new NotFoundError(`Producto ${detail.productId} no encontrado o inactivo`);
        }

        const stockBefore = new Prisma.Decimal(product.currentStock);
        const qtyIn = new Prisma.Decimal(detail.quantity);
        const unitCost = new Prisma.Decimal(detail.unitCost);
        const stockAfter = stockBefore.add(qtyIn);
        const totalCost = unitCost.mul(qtyIn).toDecimalPlaces(4);
        const newCostPrice = weightedAverageCost(
          stockBefore,
          new Prisma.Decimal(product.costPrice),
          qtyIn,
          unitCost,
        );

        await tx.inventoryMovement.create({
          data: {
            productId: product.id,
            movementType: "ENTRADA_COMPRA",
            quantity: qtyIn,
            unitCost,
            totalCost,
            stockBefore,
            stockAfter,
            purchaseOrderId: order.id,
            employeeId: receivedById,
            reason: `Recepción OC ${order.id.slice(0, 8)}`,
          },
        });

        await tx.product.update({
          where: { id: product.id },
          data: {
            currentStock: stockAfter,
            costPrice: newCostPrice,
            updatedAt: new Date(),
          },
        });

        await syncStockAlert(tx, product.id, stockAfter, new Prisma.Decimal(product.minStock));
      }

      return tx.purchaseOrder.update({
        where: { id },
        data: {
          status: "RECIBIDA",
          receivedAt: new Date(),
          receivedById,
          receivedByWebUserId: webUserId,
          supplierDocNumber:
            input.supplierDocNumber !== undefined && input.supplierDocNumber !== null
              ? input.supplierDocNumber
              : order.supplierDocNumber,
          supplierDocType:
            input.supplierDocType !== undefined && input.supplierDocType !== null
              ? input.supplierDocType
              : order.supplierDocType,
          updatedAt: new Date(),
        },
        include: orderInclude,
      });
    });
  },
};
