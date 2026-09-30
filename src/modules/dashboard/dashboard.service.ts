/**
 * Servicio del panel de control administrativo.
 * Agrega KPIs de ventas, inventario, compras y RRHH en una sola respuesta.
 * Solo considera órdenes de caja con estado `COMPLETADA`.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { businessPeriods, dateKeyToDbDate } from "../../shared/business-time.js";
import { computeSalesSection } from "./net-sales.js";
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
   * - `gross` suma `Orders.total` de órdenes `COMPLETADA` por `Orders.CreatedAt`.
   * - `returns` suma `Returns.total` de devoluciones `COMPLETADA` cuya orden original también
   *   está `COMPLETADA`, atribuidas por `Returns.CreatedAt`; las `ANULADA` no cuentan.
   * - `net` y las claves históricas (`today`, `week`, `month`, `prevMonth`) son bruto menos
   *   devoluciones, redondeado a dos decimales. Incluye desglose por tipo, producto, día y familia.
   * - `monthOverMonthPct` compara netos y es `null` si el neto del mes anterior no es positivo.
   *   `avgTicket` usa neto mensual; `avgTicketGross` usa bruto mensual.
   *
   * **Inventario**
   * - `totalValue`: Σ (`currentStock` × `costPrice`) de productos activos.
   * - `belowMin`: productos activos con `currentStock <= minStock`, igual que las alertas abiertas.
   * - `movementsToday`: movimientos agrupados por tipo en el día actual del negocio.
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
   *
   * **Zona horaria**: hoy, semana, mes y mes anterior se cortan a medianoche local de
   * `BUSINESS_TZ` (por defecto `America/El_Salvador`), calculado en SQL con `AT TIME ZONE`.
   * La respuesta incluye `timeZone` con la zona usada.
   */
  async summary() {
    const now = new Date();
    const periods = await businessPeriods(prisma, now);
    const { todayStart, tomorrow, monthStart } = periods;
    const todayDate = dateKeyToDbDate(periods.todayDate);
    const in30Days = dateKeyToDbDate(periods.todayDate, 30);

    const [
      sales,
      inventoryAgg,
      openAlerts,
      movementsToday,
      pendingPOs,
      purchasesMonth,
      headcount,
      upcomingPayroll,
      docsExpiring,
    ] = await Promise.all([
      computeSalesSection(prisma, now, periods),
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
            lte: in30Days,
            gte: todayDate,
          },
        },
      }),
    ]);

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

    return {
      generatedAt: now.toISOString(),
      timeZone: periods.timeZone,
      sales,
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
