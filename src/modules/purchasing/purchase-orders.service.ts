/**
 * Servicio de órdenes de compra: ciclo BORRADOR → CONFIRMADA → RECIBIDA.
 * Al recibir, genera movimientos `ENTRADA_COMPRA` y actualiza stock/costo promedio.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { BadRequestError, NotFoundError } from "../../shared/errors.js";

const PO_STATUSES = ["BORRADOR", "CONFIRMADA", "RECIBIDA", "CANCELADA"] as const;
export type PurchaseOrderStatus = (typeof PO_STATUSES)[number];

const DEFAULT_TAX_RATE = 0.13;

const orderInclude = {
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

async function syncStockAlert(
  tx: Prisma.TransactionClient,
  productId: string,
  currentStock: Prisma.Decimal,
  minStock: Prisma.Decimal,
): Promise<void> {
  const belowMin = currentStock.lessThan(minStock);
  if (belowMin) {
    const open = await tx.stockAlert.findFirst({
      where: { productId, isResolved: false },
    });
    if (!open) {
      await tx.stockAlert.create({ data: { productId, currentStock, minStock } });
    } else {
      await tx.stockAlert.update({
        where: { id: open.id },
        data: { currentStock, minStock },
      });
    }
    return;
  }
  await tx.stockAlert.updateMany({
    where: { productId, isResolved: false },
    data: { isResolved: true, resolvedAt: new Date() },
  });
}

async function resolveEmployeeId(
  preferred?: string | null,
  webUserId?: string,
): Promise<string> {
  if (preferred) {
    const emp = await prisma.employee.findUnique({ where: { id: preferred } });
    if (!emp || !emp.isActive) throw new BadRequestError("Empleado no válido");
    return emp.id;
  }
  if (webUserId) {
    const user = await prisma.webUser.findUnique({ where: { id: webUserId } });
    if (user?.employeeId) {
      const emp = await prisma.employee.findUnique({ where: { id: user.employeeId } });
      if (emp?.isActive) return emp.id;
    }
  }
  const fallback = await prisma.employee.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (!fallback) {
    throw new BadRequestError(
      "No hay empleados activos para asociar la orden de compra. Crea un empleado o vincula WebUser.employeeId.",
    );
  }
  return fallback.id;
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

  /** Crea OC en estado BORRADOR con totales calculados por línea (IVA 13% por defecto). */
  async create(
    input: {
      supplierId: string;
      employeeId?: string | null;
      supplierDocNumber?: string | null;
      supplierDocType?: string | null;
      notes?: string | null;
      expectedDate?: string | null;
      lines: OrderLineInput[];
    },
    webUserId?: string,
  ) {
    if (!input.lines?.length) throw new BadRequestError("La orden debe tener al menos una línea");

    const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
    if (!supplier || !supplier.isActive) {
      throw new NotFoundError("Proveedor no encontrado o inactivo");
    }

    const employeeId = await resolveEmployeeId(input.employeeId, webUserId);
    const { detailRows, subtotal, taxAmount, total } = computeOrderTotals(input.lines);

    const productIds = [...new Set(detailRows.map((d) => d.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true },
      select: { id: true },
    });
    if (products.length !== productIds.length) {
      throw new BadRequestError("Uno o más productos no existen o están inactivos");
    }

    return prisma.purchaseOrder.create({
      data: {
        supplierId: input.supplierId,
        employeeId,
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
  },

  /** Actualiza OC solo en estado BORRADOR; puede reemplazar líneas y recalcular totales. */
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
    const existing = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { details: true },
    });
    if (!existing) throw new NotFoundError("Orden de compra no encontrada");
    if (existing.status !== "BORRADOR") {
      throw new BadRequestError("Solo se pueden editar órdenes en estado BORRADOR");
    }

    if (input.supplierId) {
      const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
      if (!supplier || !supplier.isActive) {
        throw new NotFoundError("Proveedor no encontrado o inactivo");
      }
    }

    const totals = input.lines ? computeOrderTotals(input.lines) : null;

    return prisma.$transaction(async (tx) => {
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

  /** Pasa OC de BORRADOR a CONFIRMADA. */
  async confirm(id: string) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { details: true },
    });
    if (!order) throw new NotFoundError("Orden de compra no encontrada");
    if (order.status !== "BORRADOR") {
      throw new BadRequestError("Solo se pueden confirmar órdenes en BORRADOR");
    }
    if (!order.details.length) {
      throw new BadRequestError("La orden no tiene líneas");
    }
    return prisma.purchaseOrder.update({
      where: { id },
      data: { status: "CONFIRMADA", updatedAt: new Date() },
      include: orderInclude,
    });
  },

  /** Cancela OC que no esté RECIBIDA. */
  async cancel(id: string) {
    const order = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundError("Orden de compra no encontrada");
    if (order.status === "RECIBIDA") {
      throw new BadRequestError("No se puede cancelar una orden ya recibida");
    }
    if (order.status === "CANCELADA") return this.getById(id);
    return prisma.purchaseOrder.update({
      where: { id },
      data: { status: "CANCELADA", updatedAt: new Date() },
      include: orderInclude,
    });
  },

  /**
   * Recibe OC CONFIRMADA (o BORRADOR): genera ENTRADA_COMPRA por línea,
   * actualiza stock y costPrice con promedio ponderado.
   */
  async receive(
    id: string,
    input: {
      supplierDocNumber?: string | null;
      supplierDocType?: string | null;
      receivedById?: string | null;
    } = {},
    webUserId?: string,
  ) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.findUnique({
        where: { id },
        include: { details: true },
      });
      if (!order) throw new NotFoundError("Orden de compra no encontrada");
      if (order.status === "RECIBIDA") {
        throw new BadRequestError("La orden ya fue recibida");
      }
      if (order.status === "CANCELADA") {
        throw new BadRequestError("No se puede recibir una orden cancelada");
      }
      if (!order.details.length) {
        throw new BadRequestError("La orden no tiene líneas");
      }

      for (const detail of order.details) {
        if (new Prisma.Decimal(detail.unitCost).lessThanOrEqualTo(0)) {
          throw new BadRequestError("El costo unitario debe ser mayor que cero al recibir");
        }
      }

      const receivedById = await resolveEmployeeId(input.receivedById ?? order.employeeId, webUserId);

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
