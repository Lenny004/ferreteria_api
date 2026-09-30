import { randomUUID } from "node:crypto";

import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { businessCalendarRange, businessPeriods } from "../src/shared/business-time.js";
import { computeSalesSection } from "../src/modules/dashboard/net-sales.js";

const prisma = new PrismaClient();
const SV = "America/El_Salvador";

type Transaction = Prisma.TransactionClient;

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

const iso = (date: Date) => date.toISOString();

describe("límites de periodo en la zona del negocio (PostgreSQL AT TIME ZONE)", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("a las 11:30 PM local el día sigue siendo hoy; a las 12:05 AM ya es el siguiente", async () => {
    // 2031-03-15 23:30 hora de El Salvador = 2031-03-16T05:30Z.
    const late = await businessPeriods(prisma, new Date("2031-03-16T05:30:00.000Z"), SV);
    expect(late.timeZone).toBe(SV);
    expect(late.todayDate).toBe("2031-03-15");
    expect(iso(late.todayStart)).toBe("2031-03-15T06:00:00.000Z");
    expect(iso(late.tomorrow)).toBe("2031-03-16T06:00:00.000Z");
    expect(late.weekStartDate).toBe("2031-03-09");
    expect(iso(late.weekStart)).toBe("2031-03-09T06:00:00.000Z");
    expect(iso(late.monthStart)).toBe("2031-03-01T06:00:00.000Z");
    expect(iso(late.prevMonthStart)).toBe("2031-02-01T06:00:00.000Z");

    // 2031-03-16 00:05 hora de El Salvador = 2031-03-16T06:05Z.
    const early = await businessPeriods(prisma, new Date("2031-03-16T06:05:00.000Z"), SV);
    expect(early.todayDate).toBe("2031-03-16");
    expect(iso(early.todayStart)).toBe("2031-03-16T06:00:00.000Z");
    expect(iso(early.tomorrow)).toBe("2031-03-17T06:00:00.000Z");
  });

  it("corta el mes y el año a medianoche local", async () => {
    // 31 de marzo 23:30 local: todavía marzo.
    const march = await businessPeriods(prisma, new Date("2031-04-01T05:30:00.000Z"), SV);
    expect(iso(march.monthStart)).toBe("2031-03-01T06:00:00.000Z");
    expect(iso(march.prevMonthStart)).toBe("2031-02-01T06:00:00.000Z");
    // 1 de abril 00:05 local: ya es abril.
    const april = await businessPeriods(prisma, new Date("2031-04-01T06:05:00.000Z"), SV);
    expect(iso(april.monthStart)).toBe("2031-04-01T06:00:00.000Z");
    expect(iso(april.prevMonthStart)).toBe("2031-03-01T06:00:00.000Z");
    // 31 de diciembre 23:30 local: el mes anterior es noviembre del mismo año.
    const december = await businessPeriods(prisma, new Date("2032-01-01T05:30:00.000Z"), SV);
    expect(iso(december.monthStart)).toBe("2031-12-01T06:00:00.000Z");
    expect(iso(december.prevMonthStart)).toBe("2031-11-01T06:00:00.000Z");
  });

  it("respeta otra zona configurada (UTC) para comparar", async () => {
    const utc = await businessPeriods(prisma, new Date("2031-03-16T05:30:00.000Z"), "UTC");
    expect(utc.todayDate).toBe("2031-03-16");
    expect(iso(utc.todayStart)).toBe("2031-03-16T00:00:00.000Z");
  });

  it("rangos de mes y año locales para reportes", async () => {
    const month = await businessCalendarRange(prisma, 2031, 3, SV);
    expect(iso(month.start)).toBe("2031-03-01T06:00:00.000Z");
    expect(iso(month.end)).toBe("2031-04-01T06:00:00.000Z");
    const december = await businessCalendarRange(prisma, 2031, 12, SV);
    expect(iso(december.end)).toBe("2032-01-01T06:00:00.000Z");
    const year = await businessCalendarRange(prisma, 2031, undefined, SV);
    expect(iso(year.start)).toBe("2031-01-01T06:00:00.000Z");
    expect(iso(year.end)).toBe("2032-01-01T06:00:00.000Z");
  });

  it("ventas de 11:30 PM y 12:05 AM y el cambio de mes caen en el día y mes locales", async () => {
    await withRollback(async (tx) => {
      const employeeId = randomUUID();
      const cashSessionId = randomUUID();
      await tx.$executeRaw`INSERT INTO hr."Employees" ("id", "FirstName", "LastName", "HireDate") VALUES (${employeeId}::uuid, 'Zona', 'Horaria', DATE '2000-01-01')`;
      await tx.$executeRaw`INSERT INTO sales."CashSessions" ("id", "EmployeeId", "CashRegisterCode", "status") VALUES (${cashSessionId}::uuid, ${employeeId}::uuid, ${`TZ-${randomUUID().slice(0, 8)}`}, 'ABIERTA')`;

      const order = async (total: string, createdAt: string): Promise<string> => {
        const id = randomUUID();
        await tx.$executeRaw`
          INSERT INTO sales."Orders" (
            "id", "EmployeeId", "CashSessionId", "OrderType", "ClientRequestId", "status",
            "subtotal", "TaxAmount", "total", "DiscountAmount", "CreatedAt"
          ) VALUES (
            ${id}::uuid, ${employeeId}::uuid, ${cashSessionId}::uuid, 'VENTA_CAJA', ${randomUUID()}::uuid,
            'COMPLETADA', ${total}::numeric, 0::numeric, ${total}::numeric, 0::numeric, ${createdAt}::timestamptz
          )`;
        return id;
      };
      const devolucion = async (orderId: string, total: string, createdAt: string): Promise<void> => {
        await tx.$executeRaw`
          INSERT INTO sales."Returns" (
            "id", "OrderId", "CashSessionId", "EmployeeId", "AuthorizedByEmployeeId", "ClientRequestId",
            "ReturnType", "status", "FiscalStatus", "ReasonCode", "subtotal", "DiscountAmount", "TaxAmount",
            "total", "RefundMethod", "RefundAmount", "CreatedAt"
          ) VALUES (
            ${randomUUID()}::uuid, ${orderId}::uuid, ${cashSessionId}::uuid, ${employeeId}::uuid,
            ${employeeId}::uuid, ${randomUUID()}::uuid, 'PARCIAL', 'COMPLETADA', 'NO_APLICA', 'TEST_TZ',
            ${total}::numeric, 0::numeric, 0::numeric, ${total}::numeric, 'EFECTIVO', ${total}::numeric,
            ${createdAt}::timestamptz
          )`;
      };

      await order("10.00", "2031-03-15T23:30:00-06:00"); // 11:30 PM local del 15
      await order("20.00", "2031-03-16T00:05:00-06:00"); // 12:05 AM local del 16
      const lastFebruary = await order("40.00", "2031-02-28T23:30:00-06:00"); // último día de febrero, 11:30 PM
      await order("80.00", "2031-03-01T00:05:00-06:00"); // primer minuto de marzo local
      await devolucion(lastFebruary, "4.00", "2031-02-28T23:45:00-06:00"); // devolución aún en febrero
      await devolucion(lastFebruary, "6.00", "2031-03-01T00:10:00-06:00"); // devolución ya en marzo

      const now = new Date("2031-03-16T12:00:00.000Z"); // 6:00 AM local del 16
      const sales = await computeSalesSection(tx, now, await businessPeriods(tx, now, SV));

      expect(sales.gross).toEqual({ today: 20, week: 30, month: 110, prevMonth: 40 });
      expect(sales.todayTx).toBe(1);
      expect(sales.weekTx).toBe(2);
      expect(sales.monthTx).toBe(3);
      expect(sales.returns).toMatchObject({ today: 0, month: 6, prevMonth: 4, monthCount: 1, prevMonthCount: 1 });
      expect(sales.net).toEqual({ today: 20, week: 30, month: 104, prevMonth: 36 });
      expect(sales.daily.map((row) => row.date)).toEqual([
        "2031-03-10",
        "2031-03-11",
        "2031-03-12",
        "2031-03-13",
        "2031-03-14",
        "2031-03-15",
        "2031-03-16",
      ]);
      expect(sales.daily[5]).toMatchObject({ date: "2031-03-15", gross: 10, tx: 1 });
      expect(sales.daily[6]).toMatchObject({ date: "2031-03-16", gross: 20, tx: 1 });

      // Con cortes UTC (comportamiento anterior) la venta de 11:30 PM caería en "hoy" y la de
      // febrero 11:30 PM en marzo: se deja como contraste explícito.
      const utc = await computeSalesSection(tx, now, await businessPeriods(tx, now, "UTC"));
      expect(utc.gross).toEqual({ today: 30, week: 30, month: 150, prevMonth: 0 });
    });
  });
});