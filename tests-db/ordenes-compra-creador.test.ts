import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { purchaseOrdersService } from "../src/modules/purchasing/purchase-orders.service.js";

const prisma = new PrismaClient();

type Fixture = {
  familyId: string;
  measurementId: string;
  productId: string;
  supplierId: string;
  webUserId: string;
};

/** Crea un producto, proveedor y WebUser mínimos para probar una OC sin empleado. */
async function createFixture(): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const fixture: Fixture = {
    familyId: randomUUID(),
    measurementId: randomUUID(),
    productId: randomUUID(),
    supplierId: randomUUID(),
    webUserId: randomUUID(),
  };

  await prisma.$executeRaw`INSERT INTO public."Families" ("id", "code", "name") VALUES
    (${fixture.familyId}::uuid, ${`FO${suffix}`}, 'QA OC creador')`;
  await prisma.$executeRaw`INSERT INTO public."MeasurementTypes" ("id", "code", "name", "UnitLabel") VALUES
    (${fixture.measurementId}::uuid, ${`MO${suffix}`}, 'Unidad QA', 'u')`;
  await prisma.$executeRaw`INSERT INTO public."Products"
    ("id", "code", "description", "FamilyId", "MeasurementTypeId", "SalePrice", "CostPrice", "CurrentStock", "MinStock")
    VALUES (${fixture.productId}::uuid, ${`PO-CREADOR-${suffix}`}, 'Producto OC creador',
      ${fixture.familyId}::uuid, ${fixture.measurementId}::uuid, 10, 2, 0, 0)`;
  await prisma.$executeRaw`INSERT INTO purchasing."Suppliers" ("id", "name") VALUES
    (${fixture.supplierId}::uuid, ${`Proveedor OC creador ${suffix}`})`;
  await prisma.$executeRaw`INSERT INTO system."WebUsers"
    ("id", "Username", "Email", "PasswordHash", "Role", "IsActive")
    VALUES (${fixture.webUserId}::uuid, ${`qa-oc-${suffix}`}, ${`qa-oc-${suffix}@example.com`},
      'not-used', 'ADMIN', TRUE)`;
  return fixture;
}

/** Elimina primero la OC y después las filas referenciadas por sus datos de prueba. */
async function deleteFixture(fixture: Fixture): Promise<void> {
  await prisma.$executeRaw`DELETE FROM purchasing."PurchaseOrderDetails"
    WHERE "PurchaseOrderId" IN (
      SELECT "id" FROM purchasing."PurchaseOrders" WHERE "CreatedByWebUserId" = ${fixture.webUserId}::uuid
    )`;
  await prisma.$executeRaw`DELETE FROM purchasing."PurchaseOrders" WHERE "CreatedByWebUserId" = ${fixture.webUserId}::uuid`;
  await prisma.$executeRaw`DELETE FROM system."WebUsers" WHERE "id" = ${fixture.webUserId}::uuid`;
  await prisma.$executeRaw`DELETE FROM public."Products" WHERE "id" = ${fixture.productId}::uuid`;
  await prisma.$executeRaw`DELETE FROM purchasing."Suppliers" WHERE "id" = ${fixture.supplierId}::uuid`;
  await prisma.$executeRaw`DELETE FROM public."MeasurementTypes" WHERE "id" = ${fixture.measurementId}::uuid`;
  await prisma.$executeRaw`DELETE FROM public."Families" WHERE "id" = ${fixture.familyId}::uuid`;
}

describe("creador de órdenes de compra", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("permite a un ADMIN sin empleado crear una OC y registra su WebUser", { timeout: 30_000 }, async () => {
    const fixture = await createFixture();
    try {
      const order = await purchaseOrdersService.create({
        supplierId: fixture.supplierId,
        lines: [{ productId: fixture.productId, quantity: 1, unitCost: 2 }],
      }, { userId: fixture.webUserId, role: "ADMIN" });

      const rows = await prisma.$queryRaw<Array<{ employeeId: string | null; createdByWebUserId: string }>>`
        SELECT "EmployeeId" AS "employeeId", "CreatedByWebUserId" AS "createdByWebUserId"
        FROM purchasing."PurchaseOrders" WHERE "id" = ${order.id}::uuid`;
      expect(rows).toEqual([{ employeeId: null, createdByWebUserId: fixture.webUserId }]);
    } finally {
      await deleteFixture(fixture);
    }
  });
});
