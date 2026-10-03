import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const prisma = new PrismaClient();
const SV = "America/El_Salvador";

type Transaction = Prisma.TransactionClient;

/** Fila de sales."VKpisToday" tal como la devuelve PostgreSQL (COUNT es bigint y SUM/AVG numeric). */
interface KpisRow {
  TotalOrders: bigint;
  TotalAmount: Prisma.Decimal;
  AvgTicket: Prisma.Decimal;
}

/** Totales de la vista convertidos a tipos comparables. */
interface Kpis {
  orders: number;
  amount: Prisma.Decimal;
}

/** Ejecuta el escenario en una transacción que siempre se revierte. */
async function withRollback(work: (tx: Transaction) => Promise<void>): Promise<void> {
  class RollbackSentinel extends Error {}
  try {
    await prisma.$transaction(async (tx) => {
      await work(tx);
      throw new RollbackSentinel("rollback intencional de tests-db");
    });
  } catch (error) {
    if (!(error instanceof RollbackSentinel)) throw error;
  }
}

/** Fija la zona de la sesión solo para la transacción actual (set_config con is_local = true). */
async function setSessionTimeZone(tx: Transaction, timeZone: string): Promise<void> {
  await tx.$queryRaw`SELECT set_config('TimeZone', ${timeZone}::text, true)`;
}

/** Lee la vista. */
async function readKpis(tx: Transaction): Promise<Kpis> {
  const [row] = await tx.$queryRaw<KpisRow[]>`SELECT "TotalOrders", "TotalAmount", "AvgTicket" FROM sales."VKpisToday"`;
  return { orders: Number(row.TotalOrders), amount: new Prisma.Decimal(row.TotalAmount) };
}

/** Extrae la sentencia CREATE OR REPLACE VIEW de un archivo SQL, con finales de línea normalizados. */
function viewStatement(relativePath: string): string {
  const sql = readFileSync(new URL(relativePath, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const match = /CREATE OR REPLACE VIEW sales\."VKpisToday"[\s\S]*?;/.exec(sql);
  if (!match) throw new Error(`No se encontró la vista en ${relativePath}`);
  return match[0];
}

describe('vista POS sales."VKpisToday" con el día de negocio en America/El_Salvador', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("conserva columnas, orden y tipos de 0_init y usa AT TIME ZONE en lugar de CURRENT_DATE", async () => {
    const columns = await prisma.$queryRaw<{ column_name: string; data_type: string }[]>`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'sales' AND table_name = 'VKpisToday'
      ORDER BY ordinal_position`;
    expect(columns).toEqual([
      { column_name: "TotalOrders", data_type: "bigint" },
      { column_name: "TotalAmount", data_type: "numeric" },
      { column_name: "AvgTicket", data_type: "numeric" },
    ]);

    const [{ definition }] = await prisma.$queryRaw<{ definition: string }[]>`
      SELECT pg_get_viewdef('sales."VKpisToday"'::regclass, true) AS definition`;
    expect(definition).toContain("AT TIME ZONE 'America/El_Salvador'");
    expect(definition).not.toContain("CURRENT_DATE");
  });

  it("la copia de docs/pos es idéntica a la sentencia de la migración", () => {
    expect(viewStatement("../docs/pos/3_pos_vkpistoday_zona_horaria_squema.sql")).toBe(
      viewStatement("../prisma/migrations/3_pos_vkpistoday_zona_horaria/migration.sql"),
    );
  });

  it("una venta a las 11:30 PM de ayer no cuenta como hoy; una a las 12:05 AM de hoy sí", async () => {
    await withRollback(async (tx) => {
      // Con la sesión en UTC, como el servidor real: la vista anterior cortaba el día aquí.
      await setSessionTimeZone(tx, "UTC");
      const before = await readKpis(tx);

      const employeeId = randomUUID();
      await tx.$executeRaw`INSERT INTO hr."Employees" ("id", "FirstName", "LastName", "HireDate") VALUES (${employeeId}::uuid, 'Kpis', 'Hoy', DATE '2000-01-01')`;

      // Inserta una venta COMPLETADA a una hora local relativa a la medianoche local de hoy.
      const saleAtLocal = async (total: string, offsetFromLocalMidnight: string): Promise<string> => {
        const id = randomUUID();
        await tx.$executeRaw`
          INSERT INTO sales."Orders" (
            "id", "EmployeeId", "OrderType", "ClientRequestId", "status",
            "subtotal", "TaxAmount", "total", "DiscountAmount", "CreatedAt"
          ) VALUES (
            ${id}::uuid, ${employeeId}::uuid, 'VENTA_CAJA', ${randomUUID()}::uuid, 'COMPLETADA',
            ${total}::numeric, 0::numeric, ${total}::numeric, 0::numeric,
            (date_trunc('day', now() AT TIME ZONE ${SV}::text) + ${offsetFromLocalMidnight}::interval) AT TIME ZONE ${SV}::text
          )`;
        return id;
      };

      const yesterdayLate = await saleAtLocal("10.00", "-30 minutes"); // 11:30 PM local de ayer
      const todayEarly = await saleAtLocal("20.00", "5 minutes"); // 12:05 AM local de hoy
      const todayEvening = await saleAtLocal("40.00", "18 hours 30 minutes"); // 6:30 PM local de hoy (el caso reportado)

      // Las filas quedaron en las horas locales esperadas.
      const local = await tx.$queryRaw<{ id: string; local: string; today: string }[]>`
        SELECT o."id"::text AS id,
               to_char(o."CreatedAt" AT TIME ZONE ${SV}::text, 'YYYY-MM-DD HH24:MI') AS local,
               to_char((now() AT TIME ZONE ${SV}::text)::date, 'YYYY-MM-DD') AS today
        FROM sales."Orders" o
        WHERE o."EmployeeId" = ${employeeId}::uuid`;
      const byId = new Map(local.map((row) => [row.id, row]));
      const today = local[0].today;
      const yesterday = new Date(`${today}T00:00:00Z`);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      expect(byId.get(yesterdayLate)?.local).toBe(`${yesterday.toISOString().slice(0, 10)} 23:30`);
      expect(byId.get(todayEarly)?.local).toBe(`${today} 00:05`);
      expect(byId.get(todayEvening)?.local).toBe(`${today} 18:30`);

      // Solo cuentan las de hoy (12:05 AM y 6:30 PM): 2 órdenes y 60.00; la de 11:30 PM de ayer no.
      const after = await readKpis(tx);
      expect(after.orders - before.orders).toBe(2);
      expect(after.amount.minus(before.amount).toFixed(2)).toBe("60.00");

      // El resultado no depende de la zona de la sesión.
      for (const sessionTimeZone of ["Asia/Tokyo", "America/Los_Angeles", SV]) {
        await setSessionTimeZone(tx, sessionTimeZone);
        const other = await readKpis(tx);
        expect(other.orders).toBe(after.orders);
        expect(other.amount.toFixed(2)).toBe(after.amount.toFixed(2));
      }
    });
  });

  it("contraste: con la sesión en UTC, ::date pone las 11:30 PM local en el día siguiente", async () => {
    await withRollback(async (tx) => {
      await setSessionTimeZone(tx, "UTC");
      // 2031-03-15 23:30 hora de El Salvador = 2031-03-16T05:30Z.
      const [row] = await tx.$queryRaw<{ sessionCut: string; businessCut: string }[]>`
        SELECT to_char(TIMESTAMPTZ '2031-03-16 05:30:00+00'::date, 'YYYY-MM-DD') AS "sessionCut",
               to_char((TIMESTAMPTZ '2031-03-16 05:30:00+00' AT TIME ZONE ${SV}::text)::date, 'YYYY-MM-DD') AS "businessCut"`;
      expect(row).toEqual({ sessionCut: "2031-03-16", businessCut: "2031-03-15" });
    });
  });
});