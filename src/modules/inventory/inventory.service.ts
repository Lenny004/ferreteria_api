import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { BadRequestError, NotFoundError } from "../../shared/errors.js";

/** Tipos que el admin puede registrar (VENTA/DEVOLUCION las escribe la caja WPF). */
export const ADMIN_MOVEMENT_TYPES = [
  "ENTRADA_COMPRA",
  "AJUSTE_ENTRADA",
  "AJUSTE_SALIDA",
] as const;

export type AdminMovementType = (typeof ADMIN_MOVEMENT_TYPES)[number];

const movementInclude = {
  product: {
    select: {
      id: true,
      code: true,
      description: true,
      currentStock: true,
      minStock: true,
      costPrice: true,
    },
  },
} as const;

function toDecimal(value: number | string): Prisma.Decimal {
  return new Prisma.Decimal(value);
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
      await tx.stockAlert.create({
        data: {
          productId,
          currentStock,
          minStock,
        },
      });
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

export const inventoryService = {
  async listMovements(params: {
    productId?: string;
    movementType?: string;
    take?: number;
    skip?: number;
  }) {
    const where: Prisma.InventoryMovementWhereInput = {};
    if (params.productId) where.productId = params.productId;
    if (params.movementType) where.movementType = params.movementType;

    const take = Math.min(params.take ?? 50, 200);
    const skip = params.skip ?? 0;

    const [items, total] = await Promise.all([
      prisma.inventoryMovement.findMany({
        where,
        include: movementInclude,
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.inventoryMovement.count({ where }),
    ]);

    return { items, total, take, skip };
  },

  async kardex(productId: string, params: { take?: number; skip?: number } = {}) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        code: true,
        description: true,
        currentStock: true,
        minStock: true,
        costPrice: true,
        salePrice: true,
      },
    });
    if (!product) throw new NotFoundError("Producto no encontrado");

    const take = Math.min(params.take ?? 100, 500);
    const skip = params.skip ?? 0;

    const [items, total] = await Promise.all([
      prisma.inventoryMovement.findMany({
        where: { productId },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.inventoryMovement.count({ where: { productId } }),
    ]);

    /** Saldo valorado ≈ stockAfter × unitCost del movimiento (aprox. Kardex valorado). */
    const valuedItems = items.map((m) => ({
      ...m,
      valuedBalance: new Prisma.Decimal(m.stockAfter)
        .mul(new Prisma.Decimal(m.unitCost))
        .toDecimalPlaces(2)
        .toString(),
    }));

    return {
      product: {
        ...product,
        inventoryValue: new Prisma.Decimal(product.currentStock)
          .mul(new Prisma.Decimal(product.costPrice))
          .toDecimalPlaces(2)
          .toString(),
      },
      items: valuedItems,
      total,
      take,
      skip,
    };
  },

  /** Valuación total: Σ (stock × costo promedio) de productos activos. */
  async valuation(params: { take?: number; skip?: number; q?: string } = {}) {
    const where: Prisma.ProductWhereInput = { isActive: true };
    if (params.q) {
      where.OR = [
        { code: { contains: params.q, mode: "insensitive" } },
        { description: { contains: params.q, mode: "insensitive" } },
      ];
    }
    const take = Math.min(params.take ?? 100, 500);
    const skip = params.skip ?? 0;

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        select: {
          id: true,
          code: true,
          description: true,
          currentStock: true,
          costPrice: true,
          salePrice: true,
        },
        orderBy: { code: "asc" },
        take,
        skip,
      }),
      prisma.product.count({ where }),
    ]);

    const items = products.map((p) => {
      const stock = new Prisma.Decimal(p.currentStock);
      const cost = new Prisma.Decimal(p.costPrice);
      const value = stock.mul(cost).toDecimalPlaces(2);
      return {
        ...p,
        inventoryValue: value.toString(),
      };
    });

    const allActive = await prisma.product.findMany({
      where: { isActive: true },
      select: { currentStock: true, costPrice: true },
    });
    const totalValue = allActive
      .reduce((acc, p) => {
        return acc.add(new Prisma.Decimal(p.currentStock).mul(new Prisma.Decimal(p.costPrice)));
      }, new Prisma.Decimal(0))
      .toDecimalPlaces(2);

    return { items, total, take, skip, totalInventoryValue: totalValue.toString() };
  },

  async createMovement(input: {
    productId: string;
    movementType: AdminMovementType;
    quantity: number;
    unitCost?: number;
    reason?: string | null;
    employeeId?: string | null;
  }) {
    if (!ADMIN_MOVEMENT_TYPES.includes(input.movementType)) {
      throw new BadRequestError("Tipo de movimiento no permitido desde admin");
    }
    if (!(input.quantity > 0)) {
      throw new BadRequestError("La cantidad debe ser mayor que cero");
    }

    const signedQty =
      input.movementType === "AJUSTE_SALIDA" ? -Math.abs(input.quantity) : Math.abs(input.quantity);

    return prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: input.productId } });
      if (!product || !product.isActive) {
        throw new NotFoundError("Producto no encontrado o inactivo");
      }

      const stockBefore = new Prisma.Decimal(product.currentStock);
      const delta = toDecimal(signedQty);
      const stockAfter = stockBefore.add(delta);

      if (stockAfter.isNegative()) {
        throw new BadRequestError(
          `Stock insuficiente: hay ${stockBefore.toString()}, se intenta restar ${Math.abs(signedQty)}`,
        );
      }

      const unitCost =
        input.unitCost !== undefined
          ? toDecimal(input.unitCost)
          : new Prisma.Decimal(product.costPrice);
      const totalCost = unitCost.mul(toDecimal(Math.abs(signedQty)));

      /** Entradas con costo: recalcular promedio ponderado. */
      let nextCostPrice = new Prisma.Decimal(product.costPrice);
      if (
        (input.movementType === "ENTRADA_COMPRA" || input.movementType === "AJUSTE_ENTRADA") &&
        signedQty > 0 &&
        input.unitCost !== undefined
      ) {
        const qtyIn = toDecimal(signedQty);
        if (stockBefore.lessThanOrEqualTo(0)) {
          nextCostPrice = unitCost;
        } else {
          nextCostPrice = stockBefore
            .mul(new Prisma.Decimal(product.costPrice))
            .add(qtyIn.mul(unitCost))
            .div(stockBefore.add(qtyIn))
            .toDecimalPlaces(4);
        }
      }

      const movement = await tx.inventoryMovement.create({
        data: {
          productId: product.id,
          movementType: input.movementType,
          quantity: delta,
          unitCost,
          totalCost,
          stockBefore,
          stockAfter,
          reason: input.reason ?? undefined,
          employeeId: input.employeeId ?? undefined,
        },
        include: movementInclude,
      });

      await tx.product.update({
        where: { id: product.id },
        data: {
          currentStock: stockAfter,
          costPrice: nextCostPrice,
          updatedAt: new Date(),
        },
      });

      await syncStockAlert(tx, product.id, stockAfter, new Prisma.Decimal(product.minStock));

      return movement;
    });
  },

  async listAlerts(params: { resolved?: boolean; take?: number; skip?: number } = {}) {
    const where: Prisma.StockAlertWhereInput = {};
    if (params.resolved !== undefined) where.isResolved = params.resolved;

    const take = Math.min(params.take ?? 50, 200);
    const skip = params.skip ?? 0;

    const [items, total] = await Promise.all([
      prisma.stockAlert.findMany({
        where,
        include: {
          product: {
            select: { id: true, code: true, description: true, currentStock: true, minStock: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.stockAlert.count({ where }),
    ]);

    return { items, total, take, skip };
  },

  async resolveAlert(id: string) {
    const alert = await prisma.stockAlert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundError("Alerta no encontrada");
    if (alert.isResolved) return alert;

    return prisma.stockAlert.update({
      where: { id },
      data: { isResolved: true, resolvedAt: new Date() },
      include: {
        product: {
          select: { id: true, code: true, description: true, currentStock: true, minStock: true },
        },
      },
    });
  },

  /** Importación masiva de entradas/ajustes (JSON). Excel nativo queda para iteración con ExcelJS. */
  async importMovements(
    lines: Array<{
      productCode: string;
      movementType: AdminMovementType;
      quantity: number;
      unitCost?: number;
      reason?: string;
    }>,
  ) {
    if (!lines.length) throw new BadRequestError("No hay líneas para importar");
    if (lines.length > 500) throw new BadRequestError("Máximo 500 líneas por importación");

    const results: Array<{ productCode: string; ok: boolean; error?: string; movementId?: string }> =
      [];

    for (const line of lines) {
      try {
        const product = await prisma.product.findUnique({ where: { code: line.productCode } });
        if (!product) {
          results.push({ productCode: line.productCode, ok: false, error: "Producto no encontrado" });
          continue;
        }
        const movement = await this.createMovement({
          productId: product.id,
          movementType: line.movementType,
          quantity: line.quantity,
          unitCost: line.unitCost,
          reason: line.reason ?? "Importación masiva",
        });
        results.push({ productCode: line.productCode, ok: true, movementId: movement.id });
      } catch (err) {
        results.push({
          productCode: line.productCode,
          ok: false,
          error: err instanceof Error ? err.message : "Error desconocido",
        });
      }
    }

    const ok = results.filter((r) => r.ok).length;
    return { imported: ok, failed: results.length - ok, results };
  },
};
