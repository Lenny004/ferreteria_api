/**
 * Servicio del panel de control administrativo.
 * Agrega KPIs de ventas, inventario, compras y RRHH en una sola respuesta.
 * Solo considera órdenes de caja con estado `COMPLETADA`.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { movementDirection, movementMagnitude } from "../inventory/movement-direction.js";
import { isAtOrBelowMinimum } from "../inventory/inventory.service.js";

/** Convierte `Decimal` de Prisma a `number`; `null`/`undefined` → 0. */
function toNum(d: Prisma.Decimal | number | string | null | undefined): number {
  if (d == null) return 0;
  if (typeof d === "object") return parseFloat(d.toString());
  return Number(d);
}

/** Redondea a 2 decimales (moneda). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Inicio del día en UTC (00:00:00.000). */
function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Suma `days` días calendario en UTC. */
function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

/** Primer instante del mes en UTC. */
function startOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

type MovementTodayRow = {
  movementType: string;
  count: number;
  quantity: Prisma.Decimal | number | string;
};

/** Convierte la agregación SQL de movimientos del día en la forma pública del dashboard. */
export function mapMovementsToday(rows: MovementTodayRow[]) {
  return rows.map((row) => ({
    movementType: row.movementType,
    count: Number(row.count),
    quantity: toNum(movementMagnitude(row.quantity)),
    direction: movementDirection(row.movementType),
  }));
}

/**
 * Cuenta productos activos cuyo stock está en o por debajo del mínimo.
 * Usa el mismo criterio de `fn_stock_alert` y `VProductsStock` que las alertas.
 *
 * @param products - Productos con stock actual y mínimo configurado.
 * @returns Cantidad de productos en o por debajo del mínimo.
 */
export function countProductsAtOrBelowMinimum(
  products: Array<{
    currentStock: Prisma.Decimal | number | string;
    minStock: Prisma.Decimal | number | string;
  }>,
): number {
  return products.filter((product) =>
    isAtOrBelowMinimum(
      new Prisma.Decimal(product.currentStock),
      new Prisma.Decimal(product.minStock),
    ),
  ).length;
}

/** Suma magnitudes por tipo para no mezclar signos históricos con la convención vigente. */
async function queryMovementsToday(todayStart: Date, tomorrow: Date): Promise<MovementTodayRow[]> {
  return prisma.$queryRaw<MovementTodayRow[]>(Prisma.sql`
    SELECT
      "MovementType" AS "movementType",
      COUNT(*)::int AS count,
      COALESCE(SUM(ABS(quantity)), 0)::numeric AS quantity
    FROM public."InventoryMovements"
    WHERE "CreatedAt" >= ${todayStart} AND "CreatedAt" < ${tomorrow}
    GROUP BY "MovementType"
    ORDER BY "MovementType"
  `);
}

export const dashboardService = {
  /**
   * Resumen ejecutivo del negocio para el dashboard admin.
   *
   * **Ventas**
   * - `today` / `week` / `month`: Σ `order.total` de órdenes `COMPLETADA` en el rango.
   *   - Hoy: `[todayStart, mañana)`.
   *   - Semana: últimos 7 días incluyendo hoy (`weekStart = hoy − 6`).
   *   - Mes: desde el día 1 del mes actual hasta mañana.
   * - `prevMonth` / `monthOverMonthPct`: mes calendario anterior completo.
   *   - Variación MoM: `((mes − mesAnterior) / mesAnterior) × 100`; `null` si mes anterior = 0.
   * - `avgTicket`: `ventasMes / transaccionesMes` (0 si no hay transacciones).
   * - `topProducts`: top 5 por `subtotal` en líneas del mes actual.
   *
   * **Inventario**
   * - `totalValue`: Σ (`currentStock` × `costPrice`) de productos activos.
   * - `belowMin`: productos activos con `currentStock <= minStock`, igual que las alertas abiertas.
   * - `movementsToday`: movimientos agrupados por tipo en el día UTC actual.
   *
   * **Compras**
   * - `pendingOrders`: OC en `BORRADOR` o `CONFIRMADA`.
   * - `monthTotal`: Σ `total` de OC `RECIBIDA` con `receivedAt` en el mes actual.
   * - `topSuppliers`: top 5 proveedores por monto recibido en el mes.
   *
   * **RRHH**
   * - `headcountByContract` / `activeEmployees`: empleados activos por tipo de contrato.
   * - `documentsExpiring30d`: documentos con vencimiento en los próximos 30 días.
   * - `upcomingPayroll`: hasta 5 corridas en `EN_REVISION` o `APROBADA`.
   */
  async summary() {
    const now = new Date();
    const todayStart = startOfDayUTC(now);
    const tomorrow = addDays(todayStart, 1);
    const weekStart = addDays(todayStart, -6);
    const monthStart = startOfMonthUTC(now);
    const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const prevMonthEnd = monthStart;

    const [
      salesToday,
      salesWeek,
      salesMonth,
      salesPrevMonth,
      txToday,
      topProducts,
      inventoryAgg,
      openAlerts,
      movementsToday,
      pendingPOs,
      purchasesMonth,
      headcount,
      upcomingPayroll,
      docsExpiring,
    ] = await Promise.all([
      prisma.order.aggregate({
        where: { status: "COMPLETADA", createdAt: { gte: todayStart, lt: tomorrow } },
        _sum: { total: true },
        _count: true,
      }),
      prisma.order.aggregate({
        where: { status: "COMPLETADA", createdAt: { gte: weekStart, lt: tomorrow } },
        _sum: { total: true },
        _count: true,
      }),
      prisma.order.aggregate({
        where: { status: "COMPLETADA", createdAt: { gte: monthStart, lt: tomorrow } },
        _sum: { total: true },
        _count: true,
      }),
      prisma.order.aggregate({
        where: {
          status: "COMPLETADA",
          createdAt: { gte: prevMonthStart, lt: prevMonthEnd },
        },
        _sum: { total: true },
        _count: true,
      }),
      prisma.order.groupBy({
        by: ["orderType"],
        where: { status: "COMPLETADA", createdAt: { gte: monthStart, lt: tomorrow } },
        _sum: { total: true },
        _count: true,
      }),
      prisma.orderDetail.groupBy({
        by: ["productId"],
        where: {
          order: { status: "COMPLETADA", createdAt: { gte: monthStart, lt: tomorrow } },
        },
        _sum: { quantity: true, subtotal: true },
        orderBy: { _sum: { subtotal: "desc" } },
        take: 5,
      }),
      prisma.product.findMany({
        where: { isActive: true },
        select: { currentStock: true, costPrice: true, minStock: true },
      }),
      prisma.stockAlert.count({ where: { isResolved: false } }),
      queryMovementsToday(todayStart, tomorrow),
      prisma.purchaseOrder.count({
        where: { status: { in: ["BORRADOR", "CONFIRMADA"] } },
      }),
      prisma.purchaseOrder.aggregate({
        where: { status: "RECIBIDA", receivedAt: { gte: monthStart, lt: tomorrow } },
        _sum: { total: true },
        _count: true,
      }),
      prisma.employee.groupBy({
        by: ["contractType"],
        where: { isActive: true },
        _count: true,
      }),
      prisma.payrollRun.findMany({
        where: { status: { in: ["EN_REVISION", "APROBADA"] } },
        include: {
          period: { select: { name: true, paymentDate: true, periodType: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.employeeDocument.count({
        where: {
          isActive: true,
          expiryDate: {
            not: null,
            lte: addDays(todayStart, 30),
            gte: todayStart,
          },
        },
      }),
    ]);

    const productIds = topProducts.map((p) => p.productId);
    const products = productIds.length
      ? await prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, code: true, description: true },
        })
      : [];
    const productMap = new Map(products.map((p) => [p.id, p]));

    const inventoryValue = inventoryAgg.reduce(
      (acc, p) => acc + toNum(p.currentStock) * toNum(p.costPrice),
      0,
    );
    const belowMin = countProductsAtOrBelowMinimum(inventoryAgg);

    const purchasesBySupplier = await prisma.purchaseOrder.groupBy({
      by: ["supplierId"],
      where: { status: "RECIBIDA", receivedAt: { gte: monthStart, lt: tomorrow } },
      _sum: { total: true },
      _count: true,
      orderBy: { _sum: { total: "desc" } },
      take: 5,
    });
    const supplierIds = purchasesBySupplier.map((p) => p.supplierId);
    const suppliers = supplierIds.length
      ? await prisma.supplier.findMany({
          where: { id: { in: supplierIds } },
          select: { id: true, name: true },
        })
      : [];
    const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));

    const salesMonthTotal = toNum(salesMonth._sum.total);
    const salesPrevTotal = toNum(salesPrevMonth._sum.total);
    const salesMomPct =
      salesPrevTotal > 0
        ? round2(((salesMonthTotal - salesPrevTotal) / salesPrevTotal) * 100)
        : null;

    return {
      generatedAt: now.toISOString(),
      sales: {
        today: round2(toNum(salesToday._sum.total)),
        todayTx: salesToday._count,
        week: round2(toNum(salesWeek._sum.total)),
        weekTx: salesWeek._count,
        month: round2(salesMonthTotal),
        monthTx: salesMonth._count,
        prevMonth: round2(salesPrevTotal),
        monthOverMonthPct: salesMomPct,
        avgTicket:
          salesMonth._count > 0 ? round2(salesMonthTotal / salesMonth._count) : 0,
        byOrderType: txToday.map((g) => ({
          orderType: g.orderType,
          total: round2(toNum(g._sum.total)),
          count: g._count,
        })),
        topProducts: topProducts.map((g) => {
          const p = productMap.get(g.productId);
          return {
            productId: g.productId,
            code: p?.code ?? "—",
            description: p?.description ?? "—",
            quantity: toNum(g._sum.quantity),
            amount: round2(toNum(g._sum.subtotal)),
          };
        }),
      },
      inventory: {
        totalValue: round2(inventoryValue),
        activeProducts: inventoryAgg.length,
        belowMin,
        openAlerts,
        movementsToday: mapMovementsToday(movementsToday),
      },
      purchases: {
        pendingOrders: pendingPOs,
        monthTotal: round2(toNum(purchasesMonth._sum.total)),
        monthCount: purchasesMonth._count,
        topSuppliers: purchasesBySupplier.map((g) => ({
          supplierId: g.supplierId,
          name: supplierMap.get(g.supplierId) ?? "—",
          total: round2(toNum(g._sum.total)),
          count: g._count,
        })),
      },
      hr: {
        headcountByContract: headcount.map((h) => ({
          contractType: h.contractType,
          count: h._count,
        })),
        activeEmployees: headcount.reduce((a, h) => a + h._count, 0),
        documentsExpiring30d: docsExpiring,
        upcomingPayroll: upcomingPayroll.map((r) => ({
          id: r.id,
          name: r.name,
          status: r.status,
          totalNet: toNum(r.totalNet),
          periodName: r.period.name,
          paymentDate: r.period.paymentDate.toISOString().slice(0, 10),
        })),
      },
    };
  },
};
