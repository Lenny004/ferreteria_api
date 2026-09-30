import { randomUUID } from "node:crypto";

import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const prisma = new PrismaClient();
const testReason = "TEST_DB_DEVOLUCIONES";

type Transaction = Prisma.TransactionClient;

/** IDs de las filas mínimas compartidas por un caso de prueba. */
interface Fixture {
  employeeId: string;
  secondEmployeeId: string;
  cashSessionId: string;
  productId: string;
  orderId: string;
  orderDetailId: string;
  inventoryMovementId: string;
}

/** Valores opcionales para forzar cada constraint del encabezado. */
interface ReturnInput {
  cashSessionId?: string | null;
  clientRequestId?: string;
  creditNoteDteId?: string | null;
  discountAmount?: string;
  refundAmount?: string;
  refundMethod?: string;
  returnType?: string;
  status?: string;
  fiscalStatus?: string;
  subtotal?: string;
  taxAmount?: string;
  total?: string;
}

/** Valores opcionales para forzar cada constraint del detalle. */
interface ReturnDetailInput {
  discountAmount?: string;
  inventoryMovementId?: string | null;
  quantity?: string;
  restockQuantity?: string;
  restocked?: boolean;
  subtotal?: string;
  taxAmount?: string;
  unitCost?: string;
  unitPrice?: string;
  unitsPerPackage?: string;
}

/** Valores opcionales para forzar cada constraint del movimiento de caja. */
interface CashMovementInput {
  amount?: string;
  clientRequestId?: string;
  movementType?: string;
  reason?: string | null;
  returnId?: string | null;
}

/** Forma mínima del error P2010 expuesto por Prisma para SQLSTATE de PostgreSQL. */
interface PgFailure {
  code?: unknown;
  meta?: { code?: unknown; message?: unknown };
  message?: string;
}

/**
 * Ejecuta un caso dentro de una transacción que siempre termina en rollback.
 * El sentinel evita persistir fixtures aun cuando el caso sea válido.
 */
async function withRollback(work: (tx: Transaction) => Promise<void>): Promise<void> {
  class RollbackSentinel extends Error {}

  try {
    await prisma.$transaction(async (tx) => {
      await work(tx);
      throw new RollbackSentinel("rollback intencional de tests-db");
    });
  } catch (error) {
    if (!(error instanceof RollbackSentinel)) {
      throw error;
    }
  }
}

/**
 * Columnas de cada índice único probado. En 23505 Prisma solo expone el DETAIL
 * (`Key (...)=(...) already exists`), no el nombre del índice; las columnas lo identifican
 * sin ambigüedad dentro de cada tabla y el test de catálogo verifica la definición exacta.
 */
const uniqueIndexKeys: Record<string, string> = {
  UqReturnsClientRequest: '("ClientRequestId")',
  UqReturnsCreditNote: '("CreditNoteDteId")',
  UqReturnDetailsReturnLine: '("ReturnId", "OrderDetailId")',
  UqReturnDetailsMovement: '("InventoryMovementId")',
  UqCashMovementsReturnRefund: '("ReturnId")',
  UqCashMovementsClientRequest: '("ClientRequestId")',
  IdxCashSessionOpenByRegister: '("CashRegisterCode")',
};

/**
 * Extrae el SQLSTATE y el mensaje del constraint desde un error P2010 de Prisma.
 */
function expectPg(error: unknown, sqlState: string, constraint: string): void {
  const failure = error as PgFailure;
  const pgCode = failure.meta?.code;
  const pgMessage = `${String(failure.message ?? "")}\n${String(failure.meta?.message ?? "")}`;

  expect(failure.code).toBe("P2010");
  expect(pgCode).toBe(sqlState);
  if (sqlState === "23505") {
    const keyColumns = uniqueIndexKeys[constraint];
    expect(keyColumns).toBeDefined();
    expect(pgMessage).toContain(`Key ${keyColumns}=`);
    return;
  }
  expect(pgMessage).toContain(`"${constraint}"`);
}

/**
 * Verifica que una operación transaccional falle con el SQLSTATE y constraint esperados.
 */
async function expectPgFailure(operation: () => Promise<unknown>, sqlState: string, constraint: string): Promise<void> {
  let failure: unknown;
  try {
    await operation();
  } catch (error) {
    failure = error;
  }

  expect(failure).toBeDefined();
  expectPg(failure, sqlState, constraint);
}

/**
 * Crea las filas mínimas requeridas por las FK del dominio de devoluciones.
 */
async function createFixture(tx: Transaction): Promise<Fixture> {
  const employeeId = randomUUID();
  const secondEmployeeId = randomUUID();
  const familyId = randomUUID();
  const measurementTypeId = randomUUID();
  const productId = randomUUID();
  const orderId = randomUUID();
  const orderDetailId = randomUUID();
  const cashSessionId = randomUUID();
  const inventoryMovementId = randomUUID();
  const suffix = randomUUID().slice(0, 8);

  await tx.$executeRaw`INSERT INTO hr."Employees" ("id", "FirstName", "LastName", "HireDate") VALUES (${employeeId}::uuid, 'Test', 'Employee', DATE '2000-01-01')`;
  await tx.$executeRaw`INSERT INTO hr."Employees" ("id", "FirstName", "LastName", "HireDate") VALUES (${secondEmployeeId}::uuid, 'Test', 'Second', DATE '2000-01-01')`;
  await tx.$executeRaw`INSERT INTO public."Families" ("id", "code", "name") VALUES (${familyId}::uuid, ${`T${suffix}`}, 'Test family')`;
  await tx.$executeRaw`INSERT INTO public."MeasurementTypes" ("id", "code", "name", "UnitLabel") VALUES (${measurementTypeId}::uuid, ${`T${suffix}`}, 'Test unit', 'UN')`;
  await tx.$executeRaw`INSERT INTO public."Products" ("id", "code", "description", "FamilyId", "MeasurementTypeId") VALUES (${productId}::uuid, ${`TEST-${suffix}`}, 'Test product', ${familyId}::uuid, ${measurementTypeId}::uuid)`;
  await tx.$executeRaw`INSERT INTO sales."CashSessions" ("id", "EmployeeId", "CashRegisterCode", "status") VALUES (${cashSessionId}::uuid, ${employeeId}::uuid, ${`TEST-${suffix}`}, 'ABIERTA')`;
  await tx.$executeRaw`INSERT INTO sales."Orders" ("id", "EmployeeId", "CashSessionId", "status", "subtotal", "total") VALUES (${orderId}::uuid, ${employeeId}::uuid, ${cashSessionId}::uuid, 'COMPLETADA', 10, 10)`;
  await tx.$executeRaw`INSERT INTO sales."OrderDetails" ("id", "OrderId", "ProductId", "quantity", "UnitPrice", "subtotal") VALUES (${orderDetailId}::uuid, ${orderId}::uuid, ${productId}::uuid, 2, 5, 10)`;
  await tx.$executeRaw`INSERT INTO public."InventoryMovements" ("id", "ProductId", "MovementType", "quantity", "StockBefore", "StockAfter", "EmployeeId") VALUES (${inventoryMovementId}::uuid, ${productId}::uuid, 'ENTRADA_COMPRA', 1, 0, 1, ${employeeId}::uuid)`;

  return { employeeId, secondEmployeeId, cashSessionId, productId, orderId, orderDetailId, inventoryMovementId };
}

/**
 * Inserta una devolución con valores explícitos para los casos de constraints.
 */
async function insertReturn(tx: Transaction, fixture: Fixture, input: ReturnInput = {}): Promise<string> {
  const id = randomUUID();
  const clientRequestId = input.clientRequestId ?? randomUUID();
  await tx.$executeRaw`
    INSERT INTO sales."Returns" (
      "id", "OrderId", "CashSessionId", "EmployeeId", "AuthorizedByEmployeeId", "ClientRequestId",
      "ReturnType", "status", "FiscalStatus", "CreditNoteDteId", "ReasonCode", "notes", "subtotal",
      "DiscountAmount", "TaxAmount", "total", "RefundMethod", "RefundAmount"
    ) VALUES (
      ${id}::uuid, ${fixture.orderId}::uuid, ${input.cashSessionId === undefined ? fixture.cashSessionId : input.cashSessionId}::uuid,
      ${fixture.employeeId}::uuid, ${fixture.employeeId}::uuid, ${clientRequestId}::uuid, ${input.returnType ?? "PARCIAL"},
      ${input.status ?? "COMPLETADA"}, ${input.fiscalStatus ?? "PENDIENTE"}, ${input.creditNoteDteId ?? null}::uuid,
      ${testReason}, NULL, ${input.subtotal ?? "10.00"}::numeric, ${input.discountAmount ?? "0.00"}::numeric,
      ${input.taxAmount ?? "0.00"}::numeric, ${input.total ?? "10.00"}::numeric, ${input.refundMethod ?? "EFECTIVO"},
      ${input.refundAmount ?? "10.00"}::numeric
    )`;
  return id;
}

/**
 * Inserta una devolución omitiendo columnas con default para verificar sus valores generados por PostgreSQL.
 */
async function insertReturnWithDefaults(tx: Transaction, fixture: Fixture, refundMethod = "EFECTIVO"): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO sales."Returns" (
      "id", "OrderId", "CashSessionId", "EmployeeId", "AuthorizedByEmployeeId", "ReturnType",
      "ReasonCode", "subtotal", "total", "RefundMethod"
    ) VALUES (
      ${id}::uuid, ${fixture.orderId}::uuid, ${fixture.cashSessionId}::uuid, ${fixture.employeeId}::uuid, ${fixture.employeeId}::uuid,
      'PARCIAL', ${testReason}, 10, 10, ${refundMethod}
    )`;
  return id;
}

/**
 * Inserta una línea de devolución con valores explícitos.
 */
async function insertReturnDetail(tx: Transaction, fixture: Fixture, returnId: string, input: ReturnDetailInput = {}): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO sales."ReturnDetails" (
      "id", "ReturnId", "OrderDetailId", "ProductId", "quantity", "UnitsPerPackage", "UnitPrice", "UnitCost",
      "DiscountAmount", "subtotal", "TaxAmount", "Restocked", "RestockQuantity", "InventoryMovementId"
    ) VALUES (
      ${id}::uuid, ${returnId}::uuid, ${fixture.orderDetailId}::uuid, ${fixture.productId}::uuid, ${input.quantity ?? "1.000"}::numeric,
      ${input.unitsPerPackage ?? "1.000"}::numeric, ${input.unitPrice ?? "5.00"}::numeric, ${input.unitCost ?? "2.0000"}::numeric,
      ${input.discountAmount ?? "0.00"}::numeric, ${input.subtotal ?? "5.00"}::numeric, ${input.taxAmount ?? "0.00"}::numeric,
      ${input.restocked ?? true}, ${input.restockQuantity ?? "1.000"}::numeric, ${input.inventoryMovementId ?? null}::uuid
    )`;
  return id;
}

/**
 * Inserta una línea omitiendo sus columnas con default para probar el catálogo real.
 */
async function insertReturnDetailWithDefaults(tx: Transaction, fixture: Fixture, returnId: string): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO sales."ReturnDetails" ("id", "ReturnId", "OrderDetailId", "ProductId", "quantity", "UnitPrice", "subtotal")
    VALUES (${id}::uuid, ${returnId}::uuid, ${fixture.orderDetailId}::uuid, ${fixture.productId}::uuid, 1, 5, 5)
  `;
  return id;
}

/**
 * Inserta un movimiento de caja con valores explícitos.
 */
async function insertCashMovement(tx: Transaction, fixture: Fixture, input: CashMovementInput = {}): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO sales."CashMovements" (
      "id", "CashSessionId", "MovementType", "amount", "ReturnId", "EmployeeId", "AuthorizedByEmployeeId",
      "ClientRequestId", "reason"
    ) VALUES (
      ${id}::uuid, ${fixture.cashSessionId}::uuid, ${input.movementType ?? "DEVOLUCION_EFECTIVO"}, ${input.amount ?? "10.00"}::numeric,
      ${input.returnId === undefined ? null : input.returnId}::uuid, ${fixture.employeeId}::uuid, NULL,
      ${input.clientRequestId ?? randomUUID()}::uuid, ${input.reason === undefined ? testReason : input.reason}
    )`;
  return id;
}

/**
 * Inserta un reembolso omitiendo ClientRequestId para verificar su generación automática.
 */
async function insertCashMovementWithDefaults(tx: Transaction, fixture: Fixture, returnId: string): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO sales."CashMovements" ("id", "CashSessionId", "MovementType", "amount", "ReturnId", "EmployeeId", "reason")
    VALUES (${id}::uuid, ${fixture.cashSessionId}::uuid, 'DEVOLUCION_EFECTIVO', 10, ${returnId}::uuid, ${fixture.employeeId}::uuid, ${testReason})
  `;
  return id;
}

/**
 * Crea un DTE mínimo para probar la unicidad de la nota de crédito.
 */
async function insertDte(tx: Transaction): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`INSERT INTO dte."DteIssued" ("id", "DteType", "ControlNumber") VALUES (${id}::uuid, '05', ${`TEST-${randomUUID().slice(0, 8)}`})`;
  return id;
}

describe("BD de devoluciones POS", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    const returns = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM sales."Returns" WHERE "ReasonCode" = ${testReason}`;
    const details = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM sales."ReturnDetails" d JOIN sales."Returns" r ON r."id" = d."ReturnId" WHERE r."ReasonCode" = ${testReason}`;
    const movements = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM sales."CashMovements" WHERE "reason" = ${testReason}`;

    expect(Number(returns[0].count)).toBe(0);
    expect(Number(details[0].count)).toBe(0);
    expect(Number(movements[0].count)).toBe(0);
    await prisma.$disconnect();
  });

  it("expone el catálogo exacto de columnas, índices, constraints y trigger", async () => {
    const columns = await prisma.$queryRaw<Array<{
      table_name: string;
      column_name: string;
      data_type: string;
      size: number | null;
      numeric_scale: number | null;
      is_nullable: string;
      column_default: string | null;
    }>>`
      SELECT table_name::text AS table_name, column_name::text AS column_name, data_type::text AS data_type,
             COALESCE(character_maximum_length, numeric_precision)::int AS size, numeric_scale::int AS numeric_scale,
             is_nullable::text AS is_nullable, column_default::text AS column_default
      FROM information_schema.columns
      WHERE table_schema = 'sales' AND table_name IN ('Returns', 'ReturnDetails', 'CashMovements')
      ORDER BY table_name, ordinal_position
    `;

    const expected = {
      Returns: [
        ["id", "uuid", null, null, "NO", "gen_random_uuid()"], ["OrderId", "uuid", null, null, "NO", null],
        ["CashSessionId", "uuid", null, null, "YES", null], ["EmployeeId", "uuid", null, null, "NO", null],
        ["AuthorizedByEmployeeId", "uuid", null, null, "NO", null], ["ClientRequestId", "uuid", null, null, "NO", "gen_random_uuid()"],
        ["ReturnType", "character varying", 10, null, "NO", null], ["status", "character varying", 20, null, "NO", "'COMPLETADA'::character varying"],
        ["FiscalStatus", "character varying", 20, null, "NO", "'PENDIENTE'::character varying"], ["CreditNoteDteId", "uuid", null, null, "YES", null],
        ["ReasonCode", "character varying", 30, null, "NO", null], ["notes", "text", null, null, "YES", null],
        ["subtotal", "numeric", 12, 2, "NO", null], ["DiscountAmount", "numeric", 12, 2, "NO", "0"],
        ["TaxAmount", "numeric", 12, 2, "NO", "0"], ["total", "numeric", 12, 2, "NO", null],
        ["RefundMethod", "character varying", 20, null, "NO", null], ["RefundAmount", "numeric", 12, 2, "NO", "0"],
        ["CreatedAt", "timestamp with time zone", null, null, "NO", "CURRENT_TIMESTAMP"], ["UpdatedAt", "timestamp with time zone", null, null, "NO", "CURRENT_TIMESTAMP"],
      ],
      ReturnDetails: [
        ["id", "uuid", null, null, "NO", "gen_random_uuid()"], ["ReturnId", "uuid", null, null, "NO", null],
        ["OrderDetailId", "uuid", null, null, "NO", null], ["ProductId", "uuid", null, null, "NO", null],
        ["quantity", "numeric", 12, 3, "NO", null], ["UnitsPerPackage", "numeric", 12, 3, "NO", "1"],
        ["UnitPrice", "numeric", 12, 2, "NO", null], ["UnitCost", "numeric", 12, 4, "NO", "0"],
        ["DiscountAmount", "numeric", 12, 2, "NO", "0"], ["subtotal", "numeric", 12, 2, "NO", null],
        ["TaxAmount", "numeric", 12, 2, "NO", "0"], ["Restocked", "boolean", null, null, "NO", "true"],
        ["RestockQuantity", "numeric", 12, 3, "NO", "0"], ["InventoryMovementId", "uuid", null, null, "YES", null],
        ["CreatedAt", "timestamp with time zone", null, null, "NO", "CURRENT_TIMESTAMP"],
      ],
      CashMovements: [
        ["id", "uuid", null, null, "NO", "gen_random_uuid()"], ["CashSessionId", "uuid", null, null, "NO", null],
        ["MovementType", "character varying", 30, null, "NO", null], ["amount", "numeric", 12, 2, "NO", null],
        ["ReturnId", "uuid", null, null, "YES", null], ["EmployeeId", "uuid", null, null, "NO", null],
        ["AuthorizedByEmployeeId", "uuid", null, null, "YES", null], ["ClientRequestId", "uuid", null, null, "NO", "gen_random_uuid()"],
        ["reason", "character varying", 300, null, "YES", null], ["CreatedAt", "timestamp with time zone", null, null, "NO", "CURRENT_TIMESTAMP"],
      ],
    } as const;

    for (const [tableName, tableColumns] of Object.entries(expected)) {
      const actual = columns.filter((column) => column.table_name === tableName);
      expect(actual).toHaveLength(tableColumns.length);
      tableColumns.forEach((column, index) => {
        const row = actual[index];
        expect([row.column_name, row.data_type, row.size, row.numeric_scale, row.is_nullable, row.column_default]).toEqual(column);
      });
    }

    const indexes = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`SELECT indexname::text AS indexname, indexdef FROM pg_indexes WHERE schemaname = 'sales'`;
    const indexDefs = new Map(indexes.map((row) => [row.indexname, row.indexdef]));
    const expectedUniqueDefs: Record<string, string> = {
      UqReturnsClientRequest: 'CREATE UNIQUE INDEX "UqReturnsClientRequest" ON sales."Returns" USING btree ("ClientRequestId")',
      UqReturnsCreditNote: 'CREATE UNIQUE INDEX "UqReturnsCreditNote" ON sales."Returns" USING btree ("CreditNoteDteId") WHERE ("CreditNoteDteId" IS NOT NULL)',
      UqReturnDetailsReturnLine: 'CREATE UNIQUE INDEX "UqReturnDetailsReturnLine" ON sales."ReturnDetails" USING btree ("ReturnId", "OrderDetailId")',
      UqReturnDetailsMovement: 'CREATE UNIQUE INDEX "UqReturnDetailsMovement" ON sales."ReturnDetails" USING btree ("InventoryMovementId") WHERE ("InventoryMovementId" IS NOT NULL)',
      UqCashMovementsClientRequest: 'CREATE UNIQUE INDEX "UqCashMovementsClientRequest" ON sales."CashMovements" USING btree ("ClientRequestId")',
      UqCashMovementsReturnRefund: 'CREATE UNIQUE INDEX "UqCashMovementsReturnRefund" ON sales."CashMovements" USING btree ("ReturnId") WHERE (("MovementType")::text = \'DEVOLUCION_EFECTIVO\'::text)',
      IdxCashSessionOpenByRegister: 'CREATE UNIQUE INDEX "IdxCashSessionOpenByRegister" ON sales."CashSessions" USING btree ("CashRegisterCode") WHERE ((status)::text = \'ABIERTA\'::text)',
    };
    for (const [name, definition] of Object.entries(expectedUniqueDefs)) {
      expect(indexDefs.get(name)).toBe(definition);
    }
    const indexNames = new Set(indexes.map((row) => row.indexname));
    for (const name of [
      "UqReturnsClientRequest", "UqReturnsCreditNote", "IdxReturnsOrder", "IdxReturnsCashSession", "IdxReturnsCreatedAt", "IdxReturnsFiscalStatus",
      "UqReturnDetailsReturnLine", "UqReturnDetailsMovement", "IdxReturnDetailsOrderDetail", "IdxReturnDetailsProduct",
      "UqCashMovementsClientRequest", "UqCashMovementsReturnRefund", "IdxCashMovementsSession", "IdxCashMovementsType",
      "IdxCashSessionOpen", "IdxCashSessionOpenByRegister",
    ]) {
      expect(indexNames.has(name)).toBe(true);
    }

    const constraints = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint
      WHERE connamespace = 'sales'::regnamespace
        AND conrelid IN ('sales."Returns"'::regclass, 'sales."ReturnDetails"'::regclass, 'sales."CashMovements"'::regclass)
    `;
    const constraintNames = new Set(constraints.map((row) => row.conname));
    for (const name of [
      "ChkReturnsType", "ChkReturnsStatus", "ChkReturnsFiscalStatus", "ChkReturnsRefundMethod", "ChkReturnsAmounts", "ChkReturnsRefund",
      "ChkReturnDetailsQuantity", "ChkReturnDetailsAmounts", "ChkReturnDetailsRestock",
      "ChkCashMovementsType", "ChkCashMovementsAmount", "ChkCashMovementsReturnRef",
      "Returns_OrderId_fkey", "Returns_CashSessionId_fkey", "Returns_EmployeeId_fkey", "Returns_AuthorizedByEmployeeId_fkey", "Returns_CreditNoteDteId_fkey",
      "ReturnDetails_ReturnId_fkey", "ReturnDetails_OrderDetailId_fkey", "ReturnDetails_ProductId_fkey", "ReturnDetails_InventoryMovementId_fkey",
      "CashMovements_CashSessionId_fkey", "CashMovements_ReturnId_fkey", "CashMovements_EmployeeId_fkey", "CashMovements_AuthorizedByEmployeeId_fkey",
    ]) {
      expect(constraintNames.has(name)).toBe(true);
    }

    const triggers = await prisma.$queryRaw<{ tgname: string }[]>`
      SELECT tgname FROM pg_trigger
      WHERE tgrelid = 'sales."Returns"'::regclass AND NOT tgisinternal
    `;
    expect(triggers.map((row) => row.tgname)).toContain("TrgReturnTimestamp");
  });

  it("acepta una devolución parcial, detalle y reembolso en efectivo con defaults", async () => {
    await withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      const returnId = await insertReturnWithDefaults(tx, fixture);
      await insertReturnDetailWithDefaults(tx, fixture, returnId);
      await insertCashMovementWithDefaults(tx, fixture, returnId);

      const rows = await tx.$queryRaw<Array<{ status: string; fiscalStatus: string; clientRequestId: string; refundAmount: string }>>`SELECT "status", "FiscalStatus" AS "fiscalStatus", "ClientRequestId"::text AS "clientRequestId", "RefundAmount"::text AS "refundAmount" FROM sales."Returns" WHERE "id" = ${returnId}::uuid`;
      const detail = await tx.$queryRaw<Array<{ restocked: boolean }>>`SELECT "Restocked" AS "restocked" FROM sales."ReturnDetails" WHERE "ReturnId" = ${returnId}::uuid`;
      const movement = await tx.$queryRaw<Array<{ clientRequestId: string }>>`SELECT "ClientRequestId"::text AS "clientRequestId" FROM sales."CashMovements" WHERE "ReturnId" = ${returnId}::uuid`;
      expect(rows[0].status).toBe("COMPLETADA");
      expect(rows[0].fiscalStatus).toBe("PENDIENTE");
      expect(rows[0].clientRequestId).toBeTruthy();
      expect(rows[0].refundAmount).toBe("0.00");
      expect(detail[0].restocked).toBe(true);
      expect(movement[0].clientRequestId).toBeTruthy();
    });
  });

  it("el cliente Prisma escribe y lee devoluciones con sus relaciones", async () => {
    await withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      const created = await tx.return.create({
        data: {
          orderId: fixture.orderId,
          cashSessionId: fixture.cashSessionId,
          employeeId: fixture.employeeId,
          authorizedByEmployeeId: fixture.secondEmployeeId,
          returnType: "TOTAL",
          reasonCode: testReason,
          subtotal: "10.00",
          total: "10.00",
          refundMethod: "EFECTIVO",
          refundAmount: "10.00",
          details: {
            create: [{
              orderDetailId: fixture.orderDetailId,
              productId: fixture.productId,
              quantity: "2.000",
              unitPrice: "5.00",
              unitCost: "2.5000",
              subtotal: "10.00",
              restockQuantity: "2.000",
              inventoryMovementId: fixture.inventoryMovementId,
            }],
          },
          cashMovements: {
            create: [{
              cashSessionId: fixture.cashSessionId,
              movementType: "DEVOLUCION_EFECTIVO",
              amount: "10.00",
              employeeId: fixture.employeeId,
              authorizedByEmployeeId: fixture.secondEmployeeId,
              reason: testReason,
            }],
          },
        },
      });

      const loaded = await tx.return.findUniqueOrThrow({
        where: { id: created.id },
        include: { details: { include: { inventoryMovement: true } }, cashMovements: true, authorizedBy: true, order: true },
      });
      expect(loaded.status).toBe("COMPLETADA");
      expect(loaded.fiscalStatus).toBe("PENDIENTE");
      expect(loaded.order.status).toBe("COMPLETADA");
      expect(loaded.authorizedBy.id).toBe(fixture.secondEmployeeId);
      expect(loaded.details).toHaveLength(1);
      expect(loaded.details[0].restocked).toBe(true);
      expect(loaded.details[0].unitCost.toString()).toBe("2.5");
      expect(loaded.details[0].inventoryMovement?.id).toBe(fixture.inventoryMovementId);
      expect(loaded.cashMovements).toHaveLength(1);
      expect(loaded.cashMovements[0].movementType).toBe("DEVOLUCION_EFECTIVO");
      expect(loaded.cashMovements[0].amount.toString()).toBe("10");
    });
  });

  it("acepta NINGUNO con monto cero y RETIRO/INGRESO sin ReturnId", async () => {
    await withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      const returnId = await insertReturnWithDefaults(tx, fixture, "NINGUNO");
      const returnRow = await tx.$queryRaw<Array<{ refundAmount: string }>>`SELECT "RefundAmount"::text AS "refundAmount" FROM sales."Returns" WHERE "id" = ${returnId}::uuid`;
      await insertCashMovement(tx, fixture, { movementType: "RETIRO", returnId: null });
      await insertCashMovement(tx, fixture, { movementType: "INGRESO", returnId: null });
      expect(returnRow[0].refundAmount).toBe("0.00");
    });
  });

  it("acepta dos devoluciones con CreditNoteDteId NULL", async () => {
    await withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      await insertReturn(tx, fixture, { creditNoteDteId: null });
      await insertReturn(tx, fixture, { creditNoteDteId: null });
    });
  });

  it.each([
    ["total cero", { total: "0" }],
    ["total negativo", { total: "-1" }],
    ["subtotal negativo", { subtotal: "-1" }],
    ["descuento negativo", { discountAmount: "-1" }],
    ["impuesto negativo", { taxAmount: "-1" }],
  ])("rechaza %s en Returns", async (_label, input) => {
    await expectPgFailure(() => withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      await insertReturn(tx, fixture, input);
    }), "23514", "ChkReturnsAmounts");
  });

  it.each([
    ["RefundAmount mayor al total", { refundAmount: "11" }],
    ["RefundAmount negativo", { refundAmount: "-1" }],
  ])("rechaza %s", async (_label, input) => {
    await expectPgFailure(() => withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      await insertReturn(tx, fixture, input);
    }), "23514", "ChkReturnsRefund");
  });

  it("rechaza NINGUNO con RefundAmount mayor a cero", async () => {
    await expectPgFailure(() => withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      await insertReturn(tx, fixture, { refundMethod: "NINGUNO", refundAmount: "1" });
    }), "23514", "ChkReturnsRefund");
  });

  it.each(["VALE", "CREDITO"])("rechaza el método de reembolso %s", async (refundMethod) => {
    await expectPgFailure(() => withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      await insertReturn(tx, fixture, { refundMethod });
    }), "23514", "ChkReturnsRefundMethod");
  });

  it.each([
    ["ReturnType", { returnType: "OTRO" }, "ChkReturnsType"],
    ["status", { status: "DEVUELTA" }, "ChkReturnsStatus"],
    ["FiscalStatus", { fiscalStatus: "X" }, "ChkReturnsFiscalStatus"],
  ])("rechaza %s fuera de catálogo", async (_label, input, constraint) => {
    await expectPgFailure(() => withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      await insertReturn(tx, fixture, input);
    }), "23514", constraint);
  });

  it("rechaza ClientRequestId duplicado", async () => {
    const clientRequestId = randomUUID();
    await expectPgFailure(() => withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      await insertReturn(tx, fixture, { clientRequestId });
      await insertReturn(tx, fixture, { clientRequestId });
    }), "23505", "UqReturnsClientRequest");
  });

  it("rechaza CreditNoteDteId repetido no nulo", async () => {
    await expectPgFailure(() => withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      const dteId = await insertDte(tx);
      await insertReturn(tx, fixture, { creditNoteDteId: dteId });
      await insertReturn(tx, fixture, { creditNoteDteId: dteId });
    }), "23505", "UqReturnsCreditNote");
  });

  it("actualiza UpdatedAt mediante el trigger", async () => {
    await withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      const returnId = await insertReturn(tx, fixture);
      await tx.$executeRaw`UPDATE sales."Returns" SET "UpdatedAt" = TIMESTAMPTZ '2000-01-01 00:00:00+00', "ReasonCode" = ${testReason} WHERE "id" = ${returnId}::uuid`;
      const rows = await tx.$queryRaw<Array<{ updatedAt: Date }>>`SELECT "UpdatedAt" AS "updatedAt" FROM sales."Returns" WHERE "id" = ${returnId}::uuid`;
      expect(rows[0].updatedAt.getTime()).toBeGreaterThan(new Date("2000-01-01T00:00:00.000Z").getTime());
    });
  });

  it.each([
    ["quantity cero", { quantity: "0" }, "ChkReturnDetailsQuantity"],
    ["UnitsPerPackage cero", { unitsPerPackage: "0" }, "ChkReturnDetailsQuantity"],
    ["UnitPrice negativo", { unitPrice: "-1" }, "ChkReturnDetailsAmounts"],
    ["UnitCost negativo", { unitCost: "-1" }, "ChkReturnDetailsAmounts"],
    ["DiscountAmount negativo", { discountAmount: "-1" }, "ChkReturnDetailsAmounts"],
    ["subtotal negativo", { subtotal: "-1" }, "ChkReturnDetailsAmounts"],
    ["TaxAmount negativo", { taxAmount: "-1" }, "ChkReturnDetailsAmounts"],
    ["RestockQuantity negativo", { restockQuantity: "-1" }, "ChkReturnDetailsRestock"],
    ["Restocked falso con cantidad", { restocked: false, restockQuantity: "1" }, "ChkReturnDetailsRestock"],
  ])("rechaza %s en ReturnDetails", async (_label, input, constraint) => {
    await expectPgFailure(() => withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      const returnId = await insertReturn(tx, fixture);
      await insertReturnDetail(tx, fixture, returnId, input);
    }), "23514", constraint);
  });

  it("rechaza Restocked falso con InventoryMovementId", async () => {
    await expectPgFailure(() => withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      const returnId = await insertReturn(tx, fixture);
      await insertReturnDetail(tx, fixture, returnId, { restocked: false, restockQuantity: "0", inventoryMovementId: fixture.inventoryMovementId });
    }), "23514", "ChkReturnDetailsRestock");
  });

  it("rechaza la misma línea para una devolución dos veces", async () => {
    await expectPgFailure(() => withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      const returnId = await insertReturn(tx, fixture);
      await insertReturnDetail(tx, fixture, returnId);
      await insertReturnDetail(tx, fixture, returnId);
    }), "23505", "UqReturnDetailsReturnLine");
  });

  it("rechaza el mismo InventoryMovementId no nulo en dos líneas", async () => {
    await expectPgFailure(() => withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      const firstReturnId = await insertReturn(tx, fixture);
      const secondReturnId = await insertReturn(tx, fixture);
      await insertReturnDetail(tx, fixture, firstReturnId, { inventoryMovementId: fixture.inventoryMovementId });
      await insertReturnDetail(tx, fixture, secondReturnId, { inventoryMovementId: fixture.inventoryMovementId });
    }), "23505", "UqReturnDetailsMovement");
  });

  it.each([
    ["amount cero", "0"],
    ["amount negativo", "-1"],
  ])("rechaza %s en CashMovements", async (_label, amount) => {
    await expectPgFailure(() => withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      await insertCashMovement(tx, fixture, { amount, movementType: "RETIRO", returnId: null });
    }), "23514", "ChkCashMovementsAmount");
  });

  it("rechaza EGRESO_DEVOLUCION", async () => {
    await expectPgFailure(() => withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      await insertCashMovement(tx, fixture, { movementType: "EGRESO_DEVOLUCION", returnId: null });
    }), "23514", "ChkCashMovementsType");
  });

  it.each([
    ["DEVOLUCION_EFECTIVO sin ReturnId", "DEVOLUCION_EFECTIVO", null],
    ["RETIRO con ReturnId", "RETIRO", randomUUID()],
  ])("rechaza referencia de devolución inconsistente: %s", async (_label, movementType, returnId) => {
    await expectPgFailure(() => withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      await insertCashMovement(tx, fixture, { movementType, returnId });
    }), "23514", "ChkCashMovementsReturnRef");
  });

  it("rechaza dos reembolsos de efectivo para la misma devolución", async () => {
    await expectPgFailure(() => withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      const returnId = await insertReturn(tx, fixture);
      await insertCashMovement(tx, fixture, { returnId });
      await insertCashMovement(tx, fixture, { returnId });
    }), "23505", "UqCashMovementsReturnRefund");
  });

  it("rechaza ClientRequestId duplicado en CashMovements", async () => {
    const clientRequestId = randomUUID();
    await expectPgFailure(() => withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      await insertCashMovement(tx, fixture, { movementType: "RETIRO", returnId: null, clientRequestId });
      await insertCashMovement(tx, fixture, { movementType: "INGRESO", returnId: null, clientRequestId });
    }), "23505", "UqCashMovementsClientRequest");
  });

  it("impone una sola sesión ABIERTA por caja, pero permite cerrada o caja distinta", async () => {
    await withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      const closedSessionId = randomUUID();
      const otherRegisterSessionId = randomUUID();
      await tx.$executeRaw`INSERT INTO sales."CashSessions" ("id", "EmployeeId", "CashRegisterCode", "status") VALUES (${closedSessionId}::uuid, ${fixture.secondEmployeeId}::uuid, (SELECT "CashRegisterCode" FROM sales."CashSessions" WHERE "id" = ${fixture.cashSessionId}::uuid), 'CERRADA')`;
      await tx.$executeRaw`INSERT INTO sales."CashSessions" ("id", "EmployeeId", "CashRegisterCode", "status") VALUES (${otherRegisterSessionId}::uuid, ${fixture.secondEmployeeId}::uuid, 'TEST-OTHER', 'ABIERTA')`;
    });

    await expectPgFailure(() => withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      await tx.$executeRaw`INSERT INTO sales."CashSessions" ("id", "EmployeeId", "CashRegisterCode", "status") VALUES (${randomUUID()}::uuid, ${fixture.secondEmployeeId}::uuid, (SELECT "CashRegisterCode" FROM sales."CashSessions" WHERE "id" = ${fixture.cashSessionId}::uuid), 'ABIERTA')`;
    }), "23505", "IdxCashSessionOpenByRegister");
  });

  it("rechaza borrar la orden que tiene una devolución", async () => {
    await expectPgFailure(() => withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      await insertReturn(tx, fixture);
      await tx.$executeRaw`DELETE FROM sales."Orders" WHERE "id" = ${fixture.orderId}::uuid`;
    }), "23503", "Returns_OrderId_fkey");
  });

  it("rechaza ReturnId inexistente en CashMovements", async () => {
    await expectPgFailure(() => withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      await insertCashMovement(tx, fixture, { returnId: randomUUID() });
    }), "23503", "CashMovements_ReturnId_fkey");
  });
});
