import { randomUUID } from "node:crypto";

import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeSalesSection } from "../src/modules/dashboard/net-sales.js";

const prisma = new PrismaClient();
const now = new Date("2031-03-15T15:00:00.000Z");

type Transaction = Prisma.TransactionClient;

interface Fixture {
  employeeId: string;
  cashSessionId: string;
  familyOneId: string;
  familyTwoId: string;
  productOneId: string;
  productTwoId: string;
  productThreeId: string;
  todayOrderId: string;
  weekOrderId: string;
  previousReturnedOrderId: string;
  previousOrderId: string;
  cancelledOrderId: string;
  todayOrderDetailOneId: string;
  todayOrderDetailTwoId: string;
  weekOrderDetailId: string;
  previousReturnedDetailId: string;
  previousDetailId: string;
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

/** Inserta una orden con fecha explícita para aislar el rango temporal del caso. */
async function insertOrder(
  tx: Transaction,
  employeeId: string,
  cashSessionId: string,
  orderId: string,
  orderType: string,
  status: string,
  total: string,
  createdAt: string,
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO sales."Orders" (
      "id", "EmployeeId", "CashSessionId", "OrderType", "ClientRequestId", "status",
      "subtotal", "TaxAmount", "total", "DiscountAmount", "CreatedAt"
    ) VALUES (
      ${orderId}::uuid, ${employeeId}::uuid, ${cashSessionId}::uuid, ${orderType}, ${randomUUID()}::uuid,
      ${status}, ${total}::numeric, 0::numeric, ${total}::numeric, 0::numeric, ${createdAt}::timestamptz
    )`;
}

/** Inserta una línea de orden con subtotal y cantidad explícitos. */
async function insertOrderDetail(
  tx: Transaction,
  orderId: string,
  detailId: string,
  productId: string,
  quantity: string,
  unitPrice: string,
  subtotal: string,
  createdAt: string,
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO sales."OrderDetails" (
      "id", "OrderId", "ProductId", "quantity", "UnitsPerPackage", "UnitPrice", "UnitCost",
      "DiscountAmount", "subtotal", "TaxAmount", "CreatedAt"
    ) VALUES (
      ${detailId}::uuid, ${orderId}::uuid, ${productId}::uuid, ${quantity}::numeric, 1::numeric,
      ${unitPrice}::numeric, 1::numeric, 0::numeric, ${subtotal}::numeric, 0::numeric, ${createdAt}::timestamptz
    )`;
}

/** Inserta una devolución y su línea con la fecha de atribución solicitada. */
async function insertReturn(
  tx: Transaction,
  fixture: Fixture,
  orderId: string,
  orderDetailId: string,
  returnType: string,
  status: string,
  returnId: string,
  detailId: string,
  productId: string,
  quantity: string,
  subtotal: string,
  createdAt: string,
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO sales."Returns" (
      "id", "OrderId", "CashSessionId", "EmployeeId", "AuthorizedByEmployeeId", "ClientRequestId",
      "ReturnType", "status", "FiscalStatus", "ReasonCode", "subtotal", "DiscountAmount", "TaxAmount",
      "total", "RefundMethod", "RefundAmount", "CreatedAt"
    ) VALUES (
      ${returnId}::uuid, ${orderId}::uuid, ${fixture.cashSessionId}::uuid, ${fixture.employeeId}::uuid,
      ${fixture.employeeId}::uuid, ${randomUUID()}::uuid, ${returnType}, ${status}, 'NO_APLICA', 'TEST_NET_SALES',
      ${subtotal}::numeric, 0::numeric, 0::numeric, ${subtotal}::numeric, 'EFECTIVO', ${subtotal}::numeric,
      ${createdAt}::timestamptz
    )`;
  await tx.$executeRaw`
    INSERT INTO sales."ReturnDetails" (
      "id", "ReturnId", "OrderDetailId", "ProductId", "quantity", "UnitsPerPackage", "UnitPrice", "UnitCost",
      "DiscountAmount", "subtotal", "TaxAmount", "Restocked", "RestockQuantity", "CreatedAt"
    ) VALUES (
      ${detailId}::uuid, ${returnId}::uuid, ${orderDetailId}::uuid, ${productId}::uuid,
      ${quantity}::numeric, 1::numeric, ${subtotal}::numeric, 1::numeric, 0::numeric, ${subtotal}::numeric,
      0::numeric, TRUE, ${quantity}::numeric, ${createdAt}::timestamptz
    )`;
}

/** Crea dos familias y tres productos para cubrir actividad bruta y solo devuelta. */
async function createFixture(tx: Transaction): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const employeeId = randomUUID();
  const cashSessionId = randomUUID();
  const measurementTypeId = randomUUID();
  const familyOneId = randomUUID();
  const familyTwoId = randomUUID();
  const productOneId = randomUUID();
  const productTwoId = randomUUID();
  const productThreeId = randomUUID();
  const todayOrderId = randomUUID();
  const weekOrderId = randomUUID();
  const previousReturnedOrderId = randomUUID();
  const previousOrderId = randomUUID();
  const cancelledOrderId = randomUUID();
  const todayOrderDetailOneId = randomUUID();
  const todayOrderDetailTwoId = randomUUID();
  const weekOrderDetailId = randomUUID();
  const previousReturnedDetailId = randomUUID();
  const previousDetailId = randomUUID();

  await tx.$executeRaw`INSERT INTO hr."Employees" ("id", "FirstName", "LastName", "HireDate") VALUES (${employeeId}::uuid, 'Net', 'Sales', DATE '2000-01-01')`;
  await tx.$executeRaw`INSERT INTO public."MeasurementTypes" ("id", "code", "name", "UnitLabel") VALUES (${measurementTypeId}::uuid, ${`N${suffix}`} , 'Unidad net sales', 'UN')`;
  await tx.$executeRaw`INSERT INTO public."Families" ("id", "code", "name") VALUES (${familyOneId}::uuid, ${`F1${suffix}`}, 'Familia Uno')`;
  await tx.$executeRaw`INSERT INTO public."Families" ("id", "code", "name") VALUES (${familyTwoId}::uuid, ${`F2${suffix}`}, 'Familia Dos')`;
  await tx.$executeRaw`INSERT INTO public."Products" ("id", "code", "description", "FamilyId", "MeasurementTypeId") VALUES (${productOneId}::uuid, ${`P1-${suffix}`}, 'Producto Uno', ${familyOneId}::uuid, ${measurementTypeId}::uuid)`;
  await tx.$executeRaw`INSERT INTO public."Products" ("id", "code", "description", "FamilyId", "MeasurementTypeId") VALUES (${productTwoId}::uuid, ${`P2-${suffix}`}, 'Producto Dos', ${familyTwoId}::uuid, ${measurementTypeId}::uuid)`;
  await tx.$executeRaw`INSERT INTO public."Products" ("id", "code", "description", "FamilyId", "MeasurementTypeId") VALUES (${productThreeId}::uuid, ${`P3-${suffix}`}, 'Producto Tres', ${familyOneId}::uuid, ${measurementTypeId}::uuid)`;
  await tx.$executeRaw`INSERT INTO sales."CashSessions" ("id", "EmployeeId", "CashRegisterCode", "status") VALUES (${cashSessionId}::uuid, ${employeeId}::uuid, ${`NET-${suffix}`}, 'ABIERTA')`;

  await insertOrder(tx, employeeId, cashSessionId, todayOrderId, "VENTA_CAJA", "COMPLETADA", "100.00", "2031-03-15T10:00:00Z");
  await insertOrderDetail(tx, todayOrderId, todayOrderDetailOneId, productOneId, "2.000", "30.00", "60.00", "2031-03-15T10:00:00Z");
  await insertOrderDetail(tx, todayOrderId, todayOrderDetailTwoId, productTwoId, "1.000", "40.00", "40.00", "2031-03-15T10:00:00Z");

  await insertOrder(tx, employeeId, cashSessionId, weekOrderId, "ORDEN_CONFECCION", "COMPLETADA", "80.00", "2031-03-10T10:00:00Z");
  await insertOrderDetail(tx, weekOrderId, weekOrderDetailId, productOneId, "1.000", "80.00", "80.00", "2031-03-10T10:00:00Z");

  await insertOrder(tx, employeeId, cashSessionId, previousReturnedOrderId, "VENTA_CAJA", "COMPLETADA", "50.00", "2031-02-20T10:00:00Z");
  await insertOrderDetail(tx, previousReturnedOrderId, previousReturnedDetailId, productThreeId, "1.000", "50.00", "50.00", "2031-02-20T10:00:00Z");

  await insertOrder(tx, employeeId, cashSessionId, previousOrderId, "VENTA_CAJA", "COMPLETADA", "70.00", "2031-02-18T10:00:00Z");
  await insertOrderDetail(tx, previousOrderId, previousDetailId, productTwoId, "2.000", "35.00", "70.00", "2031-02-18T10:00:00Z");

  await insertOrder(tx, employeeId, cashSessionId, cancelledOrderId, "VENTA_CAJA", "CANCELADA", "999.00", "2031-03-15T11:00:00Z");

  const fixture = {
    employeeId,
    cashSessionId,
    familyOneId,
    familyTwoId,
    productOneId,
    productTwoId,
    productThreeId,
    todayOrderId,
    weekOrderId,
    previousReturnedOrderId,
    previousOrderId,
    cancelledOrderId,
    todayOrderDetailOneId,
    todayOrderDetailTwoId,
    weekOrderDetailId,
    previousReturnedDetailId,
    previousDetailId,
  };

  const todayReturnId = randomUUID();
  await insertReturn(tx, fixture, todayOrderId, todayOrderDetailOneId, "PARCIAL", "COMPLETADA", todayReturnId, randomUUID(), productOneId, "0.500", "15.00", "2031-03-15T12:00:00Z");
  await tx.$executeRaw`
    INSERT INTO sales."CashMovements" (
      "id", "CashSessionId", "MovementType", "amount", "ReturnId", "EmployeeId", "ClientRequestId", "reason", "CreatedAt"
    ) VALUES (
      ${randomUUID()}::uuid, ${cashSessionId}::uuid, 'DEVOLUCION_EFECTIVO', 15::numeric,
      ${todayReturnId}::uuid,
      ${employeeId}::uuid, ${randomUUID()}::uuid, 'TEST_NET_SALES', '2031-03-15T12:00:00Z'::timestamptz
    )`;

  await insertReturn(tx, fixture, previousReturnedOrderId, previousReturnedDetailId, "TOTAL", "COMPLETADA", randomUUID(), randomUUID(), productThreeId, "1.000", "50.00", "2031-03-05T12:00:00Z");
  await insertReturn(tx, fixture, weekOrderId, weekOrderDetailId, "PARCIAL", "ANULADA", randomUUID(), randomUUID(), productOneId, "0.500", "10.00", "2031-03-14T12:00:00Z");
  await insertReturn(tx, fixture, previousOrderId, previousDetailId, "PARCIAL", "COMPLETADA", randomUUID(), randomUUID(), productTwoId, "0.500", "20.00", "2031-02-25T12:00:00Z");

  return fixture;
}

describe("ventas netas contra PostgreSQL", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("atribuye devoluciones por su fecha y combina bruto, devoluciones y neto", async () => {
    await withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      const sales = await computeSalesSection(tx, now);

      expect(sales.gross).toEqual({ today: 100, week: 180, month: 180, prevMonth: 120 });
      expect(sales.returns).toEqual({
        today: 15,
        week: 15,
        month: 65,
        prevMonth: 20,
        todayCount: 1,
        weekCount: 1,
        monthCount: 2,
        prevMonthCount: 1,
      });
      expect(sales.net).toEqual({ today: 85, week: 165, month: 115, prevMonth: 100 });
      expect(sales.today).toBe(sales.net.today);
      expect(sales.week).toBe(sales.net.week);
      expect(sales.month).toBe(sales.net.month);
      expect(sales.prevMonth).toBe(sales.net.prevMonth);
      expect(sales.todayTx).toBe(1);
      expect(sales.weekTx).toBe(2);
      expect(sales.monthTx).toBe(2);
      expect(sales.monthOverMonthPct).toBe(15);
      expect(sales.avgTicket).toBe(57.5);
      expect(sales.avgTicketGross).toBe(90);

      expect(sales.byOrderType).toEqual([
        { orderType: "ORDEN_CONFECCION", total: 80, gross: 80, returns: 0, count: 1, returnsCount: 0 },
        { orderType: "VENTA_CAJA", total: 35, gross: 100, returns: 65, count: 1, returnsCount: 2 },
      ]);
      expect(sales.topProducts).toEqual([
        {
          productId: fixture.productOneId,
          code: expect.stringContaining("P1-"),
          description: "Producto Uno",
          quantity: 2.5,
          amount: 125,
          grossQuantity: 3,
          grossAmount: 140,
          returnedQuantity: 0.5,
          returnedAmount: 15,
        },
        {
          productId: fixture.productTwoId,
          code: expect.stringContaining("P2-"),
          description: "Producto Dos",
          quantity: 1,
          amount: 40,
          grossQuantity: 1,
          grossAmount: 40,
          returnedQuantity: 0,
          returnedAmount: 0,
        },
        {
          productId: fixture.productThreeId,
          code: expect.stringContaining("P3-"),
          description: "Producto Tres",
          quantity: -1,
          amount: -50,
          grossQuantity: 0,
          grossAmount: 0,
          returnedQuantity: 1,
          returnedAmount: 50,
        },
      ]);
      expect(sales.daily).toEqual([
        { date: "2031-03-09", gross: 0, returns: 0, net: 0, tx: 0, returnsCount: 0 },
        { date: "2031-03-10", gross: 80, returns: 0, net: 80, tx: 1, returnsCount: 0 },
        { date: "2031-03-11", gross: 0, returns: 0, net: 0, tx: 0, returnsCount: 0 },
        { date: "2031-03-12", gross: 0, returns: 0, net: 0, tx: 0, returnsCount: 0 },
        { date: "2031-03-13", gross: 0, returns: 0, net: 0, tx: 0, returnsCount: 0 },
        { date: "2031-03-14", gross: 0, returns: 0, net: 0, tx: 0, returnsCount: 0 },
        { date: "2031-03-15", gross: 100, returns: 15, net: 85, tx: 1, returnsCount: 1 },
      ]);
      expect(sales.byCategory).toEqual([
        { familyId: fixture.familyOneId, code: expect.stringContaining("F1"), name: "Familia Uno", gross: 140, returns: 65, net: 75 },
        { familyId: fixture.familyTwoId, code: expect.stringContaining("F2"), name: "Familia Dos", gross: 40, returns: 0, net: 40 },
      ]);
    });
  });
});
