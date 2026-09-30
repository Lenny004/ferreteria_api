/**
 * Cálculo de ventas netas del dashboard: bruto, devoluciones, neto y sus desgloses.
 * Las funciones de combinación no tienen acceso a la base de datos; la consulta
 * agregada queda concentrada en `computeSalesSection`.
 */

import { Prisma, PrismaClient } from "@prisma/client";

/** Fila numérica agregada por una clave de negocio. */
export interface SalesAggregateRow {
  key: string;
  amount: number;
  quantity?: number;
  count?: number;
}

/** Resultado combinado de una fila de bruto y su devolución correspondiente. */
export interface MergedSalesAggregateRow {
  key: string;
  gross: number;
  returns: number;
  net: number;
  grossQuantity: number;
  returnedQuantity: number;
  quantity: number;
  grossCount: number;
  returnsCount: number;
}

/** Fila diaria utilizada para construir la serie de los últimos siete días. */
export interface DailySalesRow {
  date: string;
  amount: number;
  count: number;
}

/** Punto diario expuesto por el endpoint del dashboard. */
export interface DailySalesPoint {
  date: string;
  gross: number;
  returns: number;
  net: number;
  tx: number;
  returnsCount: number;
}

/** Desglose de ventas netas por tipo de orden. */
export interface SalesByOrderType {
  orderType: string;
  total: number;
  gross: number;
  returns: number;
  count: number;
  returnsCount: number;
}

/** Producto incluido en el ranking mensual de ventas netas. */
export interface TopNetProduct {
  productId: string;
  code: string;
  description: string;
  quantity: number;
  amount: number;
  grossQuantity: number;
  grossAmount: number;
  returnedQuantity: number;
  returnedAmount: number;
}

/** Desglose mensual de ventas netas por familia de producto. */
export interface SalesByCategory {
  familyId: string;
  code: string;
  name: string;
  gross: number;
  returns: number;
  net: number;
}

/** Forma completa del bloque `sales` devuelto por el resumen administrativo. */
export interface SalesSection {
  today: number;
  week: number;
  month: number;
  prevMonth: number;
  todayTx: number;
  weekTx: number;
  monthTx: number;
  gross: {
    today: number;
    week: number;
    month: number;
    prevMonth: number;
  };
  returns: {
    today: number;
    week: number;
    month: number;
    prevMonth: number;
    todayCount: number;
    weekCount: number;
    monthCount: number;
    prevMonthCount: number;
  };
  net: {
    today: number;
    week: number;
    month: number;
    prevMonth: number;
  };
  monthOverMonthPct: number | null;
  avgTicket: number;
  avgTicketGross: number;
  byOrderType: SalesByOrderType[];
  topProducts: TopNetProduct[];
  daily: DailySalesPoint[];
  byCategory: SalesByCategory[];
}

type TotalsRow = {
  grossToday: unknown;
  grossWeek: unknown;
  grossMonth: unknown;
  grossPrevMonth: unknown;
  todayTx: number;
  weekTx: number;
  monthTx: number;
  returnsToday: unknown;
  returnsWeek: unknown;
  returnsMonth: unknown;
  returnsPrevMonth: unknown;
  todayReturnsCount: number;
  weekReturnsCount: number;
  monthReturnsCount: number;
  prevMonthReturnsCount: number;
};

type RawAggregateRow = {
  key: string;
  source: "gross" | "returns";
  amount: unknown;
  quantity: unknown;
  count: number;
};

type RawProductAggregateRow = RawAggregateRow & {
  productId: string;
  code: string;
  description: string;
};

type RawCategoryAggregateRow = RawAggregateRow & {
  familyId: string;
  code: string;
  name: string;
};

/**
 * Redondea un monto monetario a dos decimales sin eliminar resultados negativos.
 *
 * @param value - Monto que se va a redondear.
 * @returns Monto redondeado a centavos.
 */
export function round2(value: number): number {
  return Math.round((value + Math.sign(value) * Number.EPSILON) * 100) / 100;
}

/** Redondea una cantidad comercial a tres decimales. */
function round3(value: number): number {
  return Math.round((value + Math.sign(value) * Number.EPSILON) * 1000) / 1000;
}

/**
 * Calcula el neto de un importe bruto menos sus devoluciones.
 *
 * @param gross - Importe bruto.
 * @param returns - Importe devuelto.
 * @returns Neto redondeado a dos decimales.
 */
export function netAmount(gross: number, returns: number): number {
  return round2(gross - returns);
}

/**
 * Combina filas de bruto y devoluciones por clave, conservando claves que existen
 * únicamente en uno de los dos lados y calculando cantidades, conteos y neto.
 *
 * @param grossRows - Agregados de ventas brutas.
 * @param returnRows - Agregados de devoluciones.
 * @returns Filas combinadas en el orden de primera aparición de cada clave.
 */
export function mergeByKey(
  grossRows: readonly SalesAggregateRow[],
  returnRows: readonly SalesAggregateRow[],
): MergedSalesAggregateRow[] {
  const grossByKey = new Map<string, SalesAggregateRow>();
  const returnsByKey = new Map<string, SalesAggregateRow>();

  for (const row of grossRows) {
    const current = grossByKey.get(row.key);
    grossByKey.set(row.key, {
      key: row.key,
      amount: (current?.amount ?? 0) + row.amount,
      quantity: (current?.quantity ?? 0) + (row.quantity ?? 0),
      count: (current?.count ?? 0) + (row.count ?? 0),
    });
  }
  for (const row of returnRows) {
    const current = returnsByKey.get(row.key);
    returnsByKey.set(row.key, {
      key: row.key,
      amount: (current?.amount ?? 0) + row.amount,
      quantity: (current?.quantity ?? 0) + (row.quantity ?? 0),
      count: (current?.count ?? 0) + (row.count ?? 0),
    });
  }

  const keys = [...new Set([...grossByKey.keys(), ...returnsByKey.keys()])];
  return keys.map((key) => {
    const gross = grossByKey.get(key);
    const returns = returnsByKey.get(key);
    const grossAmount = round2(gross?.amount ?? 0);
    const returnedAmount = round2(returns?.amount ?? 0);
    const grossQuantity = round3(gross?.quantity ?? 0);
    const returnedQuantity = round3(returns?.quantity ?? 0);

    return {
      key,
      gross: grossAmount,
      returns: returnedAmount,
      net: netAmount(grossAmount, returnedAmount),
      grossQuantity,
      returnedQuantity,
      quantity: round3(grossQuantity - returnedQuantity),
      grossCount: gross?.count ?? 0,
      returnsCount: returns?.count ?? 0,
    };
  });
}

/**
 * Construye una serie diaria con todos los días solicitados, incluso cuando no hay datos.
 *
 * @param start - Primer día de la serie en UTC.
 * @param days - Número de días calendario a generar.
 * @param grossRows - Agregados diarios de órdenes completadas.
 * @param returnRows - Agregados diarios de devoluciones completadas.
 * @returns Serie ascendente con montos y conteos netos por día.
 */
export function fillDailySeries(
  start: Date,
  days: number,
  grossRows: readonly DailySalesRow[],
  returnRows: readonly DailySalesRow[],
): DailySalesPoint[] {
  const grossByDate = new Map<string, DailySalesRow>();
  const returnsByDate = new Map<string, DailySalesRow>();

  for (const row of grossRows) {
    const current = grossByDate.get(row.date);
    grossByDate.set(row.date, {
      date: row.date,
      amount: (current?.amount ?? 0) + row.amount,
      count: (current?.count ?? 0) + row.count,
    });
  }
  for (const row of returnRows) {
    const current = returnsByDate.get(row.date);
    returnsByDate.set(row.date, {
      date: row.date,
      amount: (current?.amount ?? 0) + row.amount,
      count: (current?.count ?? 0) + row.count,
    });
  }

  const result: DailySalesPoint[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + offset);
    const dateKey = date.toISOString().slice(0, 10);
    const gross = round2(grossByDate.get(dateKey)?.amount ?? 0);
    const returns = round2(returnsByDate.get(dateKey)?.amount ?? 0);
    result.push({
      date: dateKey,
      gross,
      returns,
      net: netAmount(gross, returns),
      tx: grossByDate.get(dateKey)?.count ?? 0,
      returnsCount: returnsByDate.get(dateKey)?.count ?? 0,
    });
  }
  return result;
}

/**
 * Calcula la variación porcentual mensual y evita dividir contra un mes no positivo.
 *
 * @param net - Neto del mes actual.
 * @param prevNet - Neto del mes calendario anterior.
 * @returns Porcentaje redondeado o `null` cuando `prevNet` no es positivo.
 */
export function monthOverMonthPct(net: number, prevNet: number): number | null {
  return prevNet > 0 ? round2(((net - prevNet) / prevNet) * 100) : null;
}

/**
 * Calcula el ticket promedio y retorna cero cuando no hubo transacciones.
 *
 * @param total - Importe total del periodo.
 * @param transactions - Cantidad de transacciones del periodo.
 * @returns Ticket promedio redondeado a dos decimales.
 */
export function averageTicket(total: number, transactions: number): number {
  return transactions > 0 ? round2(total / transactions) : 0;
}

/** Convierte valores numéricos de Prisma, incluidos `Decimal`, a `number`. */
function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "object") return Number(value.toString());
  return Number(value);
}

/** Obtiene el inicio del día UTC de una fecha. */
function startOfDayUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Suma días calendario en UTC sin modificar la fecha recibida. */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/** Obtiene el primer instante del mes calendario UTC. */
function startOfMonthUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** Separa una consulta UNION ALL en filas de bruto y de devoluciones. */
function splitAggregateRows(rows: readonly RawAggregateRow[]): {
  gross: SalesAggregateRow[];
  returns: SalesAggregateRow[];
} {
  return {
    gross: rows
      .filter((row) => row.source === "gross")
      .map((row) => ({
        key: row.key,
        amount: toNumber(row.amount),
        quantity: toNumber(row.quantity),
        count: Number(row.count),
      })),
    returns: rows
      .filter((row) => row.source === "returns")
      .map((row) => ({
        key: row.key,
        amount: toNumber(row.amount),
        quantity: toNumber(row.quantity),
        count: Number(row.count),
      })),
  };
}

/** Ordena un desglose por neto descendente con una segunda clave determinista. */
function sortByNet<T extends { key: string; net: number }>(rows: T[]): T[] {
  return rows.sort((left, right) => {
    if (right.net !== left.net) return right.net - left.net;
    return left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
  });
}

/**
 * Consulta y construye el bloque completo de ventas netas del dashboard.
 * Las cinco consultas agregadas se ejecutan secuencialmente para que el mismo
 * flujo funcione con `PrismaClient` y con `TransactionClient` de pruebas.
 * La fecha de una devolución siempre es `Returns.CreatedAt`, mientras que la
 * orden relacionada debe conservar `status = 'COMPLETADA'`.
 *
 * @param db - Cliente Prisma normal o cliente de una transacción abierta.
 * @param now - Instante de referencia para fijar todos los rangos UTC.
 * @returns Bloque `sales` compatible con el summary existente y sus campos nuevos.
 */
export async function computeSalesSection(
  db: Prisma.TransactionClient | PrismaClient,
  now: Date,
): Promise<SalesSection> {
  const todayStart = startOfDayUTC(now);
  const tomorrow = addDays(todayStart, 1);
  const weekStart = addDays(todayStart, -6);
  const monthStart = startOfMonthUTC(now);
  const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prevMonthEnd = monthStart;

  const [totals] = await db.$queryRaw<TotalsRow[]>(Prisma.sql`
    WITH bounds AS (
      SELECT
        ${todayStart}::timestamptz AS today_start,
        ${tomorrow}::timestamptz AS tomorrow,
        ${weekStart}::timestamptz AS week_start,
        ${monthStart}::timestamptz AS month_start,
        ${prevMonthStart}::timestamptz AS prev_month_start,
        ${prevMonthEnd}::timestamptz AS prev_month_end
    ),
    gross AS (
      SELECT
        COALESCE(SUM(o."total") FILTER (WHERE o."CreatedAt" >= b.today_start AND o."CreatedAt" < b.tomorrow), 0)::numeric AS "grossToday",
        COALESCE(SUM(o."total") FILTER (WHERE o."CreatedAt" >= b.week_start AND o."CreatedAt" < b.tomorrow), 0)::numeric AS "grossWeek",
        COALESCE(SUM(o."total") FILTER (WHERE o."CreatedAt" >= b.month_start AND o."CreatedAt" < b.tomorrow), 0)::numeric AS "grossMonth",
        COALESCE(SUM(o."total") FILTER (WHERE o."CreatedAt" >= b.prev_month_start AND o."CreatedAt" < b.prev_month_end), 0)::numeric AS "grossPrevMonth",
        COUNT(*) FILTER (WHERE o."CreatedAt" >= b.today_start AND o."CreatedAt" < b.tomorrow)::int AS "todayTx",
        COUNT(*) FILTER (WHERE o."CreatedAt" >= b.week_start AND o."CreatedAt" < b.tomorrow)::int AS "weekTx",
        COUNT(*) FILTER (WHERE o."CreatedAt" >= b.month_start AND o."CreatedAt" < b.tomorrow)::int AS "monthTx"
      FROM sales."Orders" o
      CROSS JOIN bounds b
      WHERE o.status = 'COMPLETADA'
        AND o."CreatedAt" >= b.prev_month_start
        AND o."CreatedAt" < b.tomorrow
    ),
    returns AS (
      SELECT
        COALESCE(SUM(r."total") FILTER (WHERE r."CreatedAt" >= b.today_start AND r."CreatedAt" < b.tomorrow), 0)::numeric AS "returnsToday",
        COALESCE(SUM(r."total") FILTER (WHERE r."CreatedAt" >= b.week_start AND r."CreatedAt" < b.tomorrow), 0)::numeric AS "returnsWeek",
        COALESCE(SUM(r."total") FILTER (WHERE r."CreatedAt" >= b.month_start AND r."CreatedAt" < b.tomorrow), 0)::numeric AS "returnsMonth",
        COALESCE(SUM(r."total") FILTER (WHERE r."CreatedAt" >= b.prev_month_start AND r."CreatedAt" < b.prev_month_end), 0)::numeric AS "returnsPrevMonth",
        COUNT(*) FILTER (WHERE r."CreatedAt" >= b.today_start AND r."CreatedAt" < b.tomorrow)::int AS "todayReturnsCount",
        COUNT(*) FILTER (WHERE r."CreatedAt" >= b.week_start AND r."CreatedAt" < b.tomorrow)::int AS "weekReturnsCount",
        COUNT(*) FILTER (WHERE r."CreatedAt" >= b.month_start AND r."CreatedAt" < b.tomorrow)::int AS "monthReturnsCount",
        COUNT(*) FILTER (WHERE r."CreatedAt" >= b.prev_month_start AND r."CreatedAt" < b.prev_month_end)::int AS "prevMonthReturnsCount"
      FROM sales."Returns" r
      INNER JOIN sales."Orders" o ON o."id" = r."OrderId" AND o.status = 'COMPLETADA'
      CROSS JOIN bounds b
      WHERE r.status = 'COMPLETADA'
        AND r."CreatedAt" >= b.prev_month_start
        AND r."CreatedAt" < b.tomorrow
    )
    SELECT gross.*, returns.*
    FROM gross CROSS JOIN returns
  `);

  const orderTypeRows = await db.$queryRaw<RawAggregateRow[]>(Prisma.sql`
    WITH bounds AS (
      SELECT ${monthStart}::timestamptz AS month_start, ${tomorrow}::timestamptz AS tomorrow
    )
    SELECT o."OrderType" AS "key", 'gross' AS "source", SUM(o."total")::numeric AS "amount",
           0::numeric AS "quantity", COUNT(*)::int AS "count"
    FROM sales."Orders" o CROSS JOIN bounds b
    WHERE o.status = 'COMPLETADA' AND o."CreatedAt" >= b.month_start AND o."CreatedAt" < b.tomorrow
    GROUP BY o."OrderType"
    UNION ALL
    SELECT o."OrderType" AS "key", 'returns' AS "source", SUM(r."total")::numeric AS "amount",
           0::numeric AS "quantity", COUNT(*)::int AS "count"
    FROM sales."Returns" r
    INNER JOIN sales."Orders" o ON o."id" = r."OrderId" AND o.status = 'COMPLETADA'
    CROSS JOIN bounds b
    WHERE r.status = 'COMPLETADA' AND r."CreatedAt" >= b.month_start AND r."CreatedAt" < b.tomorrow
    GROUP BY o."OrderType"
  `);

  const productRows = await db.$queryRaw<RawProductAggregateRow[]>(Prisma.sql`
    WITH bounds AS (
      SELECT ${monthStart}::timestamptz AS month_start, ${tomorrow}::timestamptz AS tomorrow
    )
    SELECT od."ProductId"::text AS "key", od."ProductId"::text AS "productId", p.code, p.description,
           'gross' AS "source", SUM(od.subtotal)::numeric AS "amount", SUM(od.quantity)::numeric AS "quantity",
           COUNT(*)::int AS "count"
    FROM sales."OrderDetails" od
    INNER JOIN sales."Orders" o ON o."id" = od."OrderId" AND o.status = 'COMPLETADA'
    INNER JOIN public."Products" p ON p."id" = od."ProductId"
    CROSS JOIN bounds b
    WHERE o."CreatedAt" >= b.month_start AND o."CreatedAt" < b.tomorrow
    GROUP BY od."ProductId", p.code, p.description
    UNION ALL
    SELECT rd."ProductId"::text AS "key", rd."ProductId"::text AS "productId", p.code, p.description,
           'returns' AS "source", SUM(rd.subtotal)::numeric AS "amount", SUM(rd.quantity)::numeric AS "quantity",
           COUNT(*)::int AS "count"
    FROM sales."ReturnDetails" rd
    INNER JOIN sales."Returns" r ON r."id" = rd."ReturnId" AND r.status = 'COMPLETADA'
    INNER JOIN sales."Orders" o ON o."id" = r."OrderId" AND o.status = 'COMPLETADA'
    INNER JOIN public."Products" p ON p."id" = rd."ProductId"
    CROSS JOIN bounds b
    WHERE r."CreatedAt" >= b.month_start AND r."CreatedAt" < b.tomorrow
    GROUP BY rd."ProductId", p.code, p.description
  `);

  const dailyRows = await db.$queryRaw<Array<{ date: string; source: "gross" | "returns"; amount: unknown; count: number }>>(Prisma.sql`
    WITH bounds AS (
      SELECT ${weekStart}::timestamptz AS week_start, ${tomorrow}::timestamptz AS tomorrow
    )
    SELECT (o."CreatedAt" AT TIME ZONE 'UTC')::date::text AS "date", 'gross' AS "source",
           SUM(o."total")::numeric AS "amount", COUNT(*)::int AS "count"
    FROM sales."Orders" o CROSS JOIN bounds b
    WHERE o.status = 'COMPLETADA' AND o."CreatedAt" >= b.week_start AND o."CreatedAt" < b.tomorrow
    GROUP BY (o."CreatedAt" AT TIME ZONE 'UTC')::date
    UNION ALL
    SELECT (r."CreatedAt" AT TIME ZONE 'UTC')::date::text AS "date", 'returns' AS "source",
           SUM(r."total")::numeric AS "amount", COUNT(*)::int AS "count"
    FROM sales."Returns" r
    INNER JOIN sales."Orders" o ON o."id" = r."OrderId" AND o.status = 'COMPLETADA'
    CROSS JOIN bounds b
    WHERE r.status = 'COMPLETADA' AND r."CreatedAt" >= b.week_start AND r."CreatedAt" < b.tomorrow
    GROUP BY (r."CreatedAt" AT TIME ZONE 'UTC')::date
  `);

  const categoryRows = await db.$queryRaw<RawCategoryAggregateRow[]>(Prisma.sql`
    WITH bounds AS (
      SELECT ${monthStart}::timestamptz AS month_start, ${tomorrow}::timestamptz AS tomorrow
    )
    SELECT f."id"::text AS "key", f."id"::text AS "familyId", f.code, f.name,
           'gross' AS "source", SUM(od.subtotal)::numeric AS "amount", 0::numeric AS "quantity", 0::int AS "count"
    FROM sales."OrderDetails" od
    INNER JOIN sales."Orders" o ON o."id" = od."OrderId" AND o.status = 'COMPLETADA'
    INNER JOIN public."Products" p ON p."id" = od."ProductId"
    INNER JOIN public."Families" f ON f."id" = p."FamilyId"
    CROSS JOIN bounds b
    WHERE o."CreatedAt" >= b.month_start AND o."CreatedAt" < b.tomorrow
    GROUP BY f."id", f.code, f.name
    UNION ALL
    SELECT f."id"::text AS "key", f."id"::text AS "familyId", f.code, f.name,
           'returns' AS "source", SUM(rd.subtotal)::numeric AS "amount", 0::numeric AS "quantity", 0::int AS "count"
    FROM sales."ReturnDetails" rd
    INNER JOIN sales."Returns" r ON r."id" = rd."ReturnId" AND r.status = 'COMPLETADA'
    INNER JOIN sales."Orders" o ON o."id" = r."OrderId" AND o.status = 'COMPLETADA'
    INNER JOIN public."Products" p ON p."id" = rd."ProductId"
    INNER JOIN public."Families" f ON f."id" = p."FamilyId"
    CROSS JOIN bounds b
    WHERE r."CreatedAt" >= b.month_start AND r."CreatedAt" < b.tomorrow
    GROUP BY f."id", f.code, f.name
  `);

  const orderTypeSplit = splitAggregateRows(orderTypeRows);
  const orderTypes = sortByNet(
    mergeByKey(orderTypeSplit.gross, orderTypeSplit.returns).map((row) => ({
      key: row.key,
      orderType: row.key,
      total: row.net,
      gross: row.gross,
      returns: row.returns,
      count: row.grossCount,
      returnsCount: row.returnsCount,
      net: row.net,
    })),
  ).map(({ orderType, total, gross, returns, count, returnsCount }) => ({
    orderType,
    total,
    gross,
    returns,
    count,
    returnsCount,
  }));

  const productSplit = splitAggregateRows(productRows);
  const productInfo = new Map(
    productRows.map((row) => [row.productId, { code: row.code, description: row.description }]),
  );
  const topProducts = sortByNet(mergeByKey(productSplit.gross, productSplit.returns)).map((row) => {
    const info = productInfo.get(row.key);
    return {
      key: row.key,
      productId: row.key,
      code: info?.code ?? "—",
      description: info?.description ?? "—",
      quantity: row.quantity,
      amount: row.net,
      grossQuantity: row.grossQuantity,
      grossAmount: row.gross,
      returnedQuantity: row.returnedQuantity,
      returnedAmount: row.returns,
      net: row.net,
    };
  }).slice(0, 5).map(({ productId, code, description, quantity, amount, grossQuantity, grossAmount, returnedQuantity, returnedAmount }) => ({
    productId,
    code,
    description,
    quantity,
    amount,
    grossQuantity,
    grossAmount,
    returnedQuantity,
    returnedAmount,
  }));

  const categorySplit = splitAggregateRows(categoryRows);
  const categoryInfo = new Map(
    categoryRows.map((row) => [row.familyId, { code: row.code, name: row.name }]),
  );
  const byCategory = sortByNet(mergeByKey(categorySplit.gross, categorySplit.returns)).map((row) => {
    const info = categoryInfo.get(row.key);
    return {
      key: row.key,
      familyId: row.key,
      code: info?.code ?? "—",
      name: info?.name ?? "—",
      gross: row.gross,
      returns: row.returns,
      net: row.net,
    };
  }).map(({ familyId, code, name, gross, returns, net }) => ({ familyId, code, name, gross, returns, net }));

  const dailyGross = dailyRows
    .filter((row) => row.source === "gross")
    .map((row) => ({ date: row.date, amount: toNumber(row.amount), count: Number(row.count) }));
  const dailyReturns = dailyRows
    .filter((row) => row.source === "returns")
    .map((row) => ({ date: row.date, amount: toNumber(row.amount), count: Number(row.count) }));
  const daily = fillDailySeries(weekStart, 7, dailyGross, dailyReturns);

  const grossToday = round2(toNumber(totals.grossToday));
  const grossWeek = round2(toNumber(totals.grossWeek));
  const grossMonth = round2(toNumber(totals.grossMonth));
  const grossPrevMonth = round2(toNumber(totals.grossPrevMonth));
  const returnsToday = round2(toNumber(totals.returnsToday));
  const returnsWeek = round2(toNumber(totals.returnsWeek));
  const returnsMonth = round2(toNumber(totals.returnsMonth));
  const returnsPrevMonth = round2(toNumber(totals.returnsPrevMonth));
  const netToday = netAmount(grossToday, returnsToday);
  const netWeek = netAmount(grossWeek, returnsWeek);
  const netMonth = netAmount(grossMonth, returnsMonth);
  const netPrevMonth = netAmount(grossPrevMonth, returnsPrevMonth);

  return {
    today: netToday,
    week: netWeek,
    month: netMonth,
    prevMonth: netPrevMonth,
    todayTx: Number(totals.todayTx),
    weekTx: Number(totals.weekTx),
    monthTx: Number(totals.monthTx),
    gross: { today: grossToday, week: grossWeek, month: grossMonth, prevMonth: grossPrevMonth },
    returns: {
      today: returnsToday,
      week: returnsWeek,
      month: returnsMonth,
      prevMonth: returnsPrevMonth,
      todayCount: Number(totals.todayReturnsCount),
      weekCount: Number(totals.weekReturnsCount),
      monthCount: Number(totals.monthReturnsCount),
      prevMonthCount: Number(totals.prevMonthReturnsCount),
    },
    net: { today: netToday, week: netWeek, month: netMonth, prevMonth: netPrevMonth },
    monthOverMonthPct: monthOverMonthPct(netMonth, netPrevMonth),
    avgTicket: averageTicket(netMonth, Number(totals.monthTx)),
    avgTicketGross: averageTicket(grossMonth, Number(totals.monthTx)),
    byOrderType: orderTypes,
    topProducts,
    daily,
    byCategory,
  };
}
