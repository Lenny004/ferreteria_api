import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { purchaseOrdersService } from "../src/modules/purchasing/purchase-orders.service.js";
import { shopOrdersService } from "../src/modules/shop-orders/shop-orders.service.js";
import { shopPaymentsService } from "../src/modules/shop-payments/shop-payments.service.js";

const prisma = new PrismaClient();

type PurchaseRaceFixture = {
  familyId: string;
  measurementId: string;
  productId: string;
  employeeId: string;
  supplierId: string;
  orderId: string;
  detailId: string;
  webUserId: string;
};

type ShopRaceFixture = {
  customerId: string;
  orderId: string;
  paymentId: string;
  webUserId: string;
};

type TransferFlowFixture = {
  familyId: string;
  measurementId: string;
  productId: string;
  customerId: string;
  cartItemId: string;
  webUserId: string;
};

/** Crea una OC confirmada mínima para probar cancelación contra recepción. */
async function createPurchaseRaceFixture(): Promise<PurchaseRaceFixture> {
  const fixture: PurchaseRaceFixture = {
    familyId: randomUUID(),
    measurementId: randomUUID(),
    productId: randomUUID(),
    employeeId: randomUUID(),
    supplierId: randomUUID(),
    orderId: randomUUID(),
    detailId: randomUUID(),
    webUserId: randomUUID(),
  };
  const suffix = fixture.orderId.slice(0, 8);
  await prisma.$executeRaw`INSERT INTO public."Families" ("id", "code", "name") VALUES (${fixture.familyId}::uuid, ${`FR${suffix}`}, 'QA race')`;
  await prisma.$executeRaw`INSERT INTO public."MeasurementTypes" ("id", "code", "name", "UnitLabel") VALUES (${fixture.measurementId}::uuid, ${`MR${suffix}`}, 'Unidad QA', 'u')`;
  await prisma.$executeRaw`INSERT INTO public."Products" ("id", "code", "description", "FamilyId", "MeasurementTypeId", "SalePrice", "CostPrice", "CurrentStock", "MinStock") VALUES (${fixture.productId}::uuid, ${`P-RACE-${suffix}`}, 'Producto race', ${fixture.familyId}::uuid, ${fixture.measurementId}::uuid, 10, 5, 0, 0)`;
  await prisma.$executeRaw`INSERT INTO hr."Employees" ("id", "FirstName", "LastName", "HireDate") VALUES (${fixture.employeeId}::uuid, 'QA', 'Race', CURRENT_DATE)`;
  await prisma.$executeRaw`INSERT INTO purchasing."Suppliers" ("id", "name") VALUES (${fixture.supplierId}::uuid, ${`Supplier race ${suffix}`})`;
  await prisma.$executeRaw`INSERT INTO purchasing."PurchaseOrders" ("id", "SupplierId", "EmployeeId", "status", "subtotal", "TaxAmount", "total") VALUES (${fixture.orderId}::uuid, ${fixture.supplierId}::uuid, ${fixture.employeeId}::uuid, 'CONFIRMADA', 10, 1.3, 11.3)`;
  await prisma.$executeRaw`INSERT INTO purchasing."PurchaseOrderDetails" ("id", "PurchaseOrderId", "ProductId", "quantity", "UnitCost", "TaxRate", "subtotal", "total") VALUES (${fixture.detailId}::uuid, ${fixture.orderId}::uuid, ${fixture.productId}::uuid, 2, 5, 0.13, 10, 11.3)`;
  // La recepción exige el WebUser autenticado y lo guarda en `ReceivedByWebUserId`.
  await prisma.$executeRaw`INSERT INTO system."WebUsers" ("id", "Username", "Email", "PasswordHash", "Role", "IsActive") VALUES (${fixture.webUserId}::uuid, ${`qa-po-race-${suffix}`}, ${`qa-po-race-${suffix}@example.com`}, 'not-used', 'ADMIN', TRUE)`;
  return fixture;
}

/** Elimina una OC de prueba en orden seguro respecto de sus claves foráneas. */
async function deletePurchaseRaceFixture(fixture: PurchaseRaceFixture): Promise<void> {
  await prisma.$executeRaw`DELETE FROM public."StockAlerts" WHERE "ProductId" = ${fixture.productId}::uuid`;
  await prisma.$executeRaw`DELETE FROM public."InventoryMovements" WHERE "ProductId" = ${fixture.productId}::uuid`;
  await prisma.$executeRaw`DELETE FROM purchasing."PurchaseOrderDetails" WHERE "PurchaseOrderId" = ${fixture.orderId}::uuid`;
  await prisma.$executeRaw`DELETE FROM purchasing."PurchaseOrders" WHERE "id" = ${fixture.orderId}::uuid`;
  await prisma.$executeRaw`DELETE FROM system."WebUsers" WHERE "id" = ${fixture.webUserId}::uuid`;
  await prisma.$executeRaw`DELETE FROM purchasing."Suppliers" WHERE "id" = ${fixture.supplierId}::uuid`;
  await prisma.$executeRaw`DELETE FROM public."Products" WHERE "id" = ${fixture.productId}::uuid`;
  await prisma.$executeRaw`DELETE FROM hr."Employees" WHERE "id" = ${fixture.employeeId}::uuid`;
  await prisma.$executeRaw`DELETE FROM public."MeasurementTypes" WHERE "id" = ${fixture.measurementId}::uuid`;
  await prisma.$executeRaw`DELETE FROM public."Families" WHERE "id" = ${fixture.familyId}::uuid`;
}

/** Crea un pedido de transferencia pendiente y un usuario de panel mínimo. */
async function createShopRaceFixture(): Promise<ShopRaceFixture> {
  const fixture: ShopRaceFixture = {
    customerId: randomUUID(),
    orderId: randomUUID(),
    paymentId: randomUUID(),
    webUserId: randomUUID(),
  };
  const suffix = fixture.orderId.slice(0, 8);
  await prisma.$executeRaw`INSERT INTO system."ShopCustomers" ("id", "Email", "PasswordHash", "FullName") VALUES (${fixture.customerId}::uuid, ${`qa-race-${suffix}@example.com`}, 'not-used', 'Cliente race')`;
  await prisma.$executeRaw`INSERT INTO system."ShopOrders" ("id", "ShopCustomerId", "Status", "Subtotal", "TaxAmount", "Total", "PaymentStatus", "PaymentMethod") VALUES (${fixture.orderId}::uuid, ${fixture.customerId}::uuid, 'PENDIENTE', 10, 1.3, 11.3, 'PENDIENTE', 'TRANSFERENCIA')`;
  await prisma.$executeRaw`INSERT INTO system."ShopPayments" ("id", "ShopOrderId", "Method", "Amount", "Status") VALUES (${fixture.paymentId}::uuid, ${fixture.orderId}::uuid, 'TRANSFERENCIA', 11.3, 'PENDIENTE')`;
  await prisma.$executeRaw`INSERT INTO system."WebUsers" ("id", "Username", "Email", "PasswordHash", "Role", "IsActive") VALUES (${fixture.webUserId}::uuid, ${`qa-race-${suffix}`}, ${`qa-race-${suffix}@example.com`}, 'not-used', 'ADMIN', TRUE)`;
  return fixture;
}

/** Elimina el pedido y las identidades usadas por una carrera de pagos. */
async function deleteShopRaceFixture(fixture: ShopRaceFixture): Promise<void> {
  await prisma.$executeRaw`DELETE FROM public."InventoryMovements" WHERE "ShopOrderId" = ${fixture.orderId}::uuid`;
  await prisma.$executeRaw`DELETE FROM system."ShopPayments" WHERE "ShopOrderId" = ${fixture.orderId}::uuid`;
  await prisma.$executeRaw`DELETE FROM system."ShopOrders" WHERE "id" = ${fixture.orderId}::uuid`;
  await prisma.$executeRaw`DELETE FROM system."ShopCustomers" WHERE "id" = ${fixture.customerId}::uuid`;
  await prisma.$executeRaw`DELETE FROM system."WebUsers" WHERE "id" = ${fixture.webUserId}::uuid`;
}

/** Crea los datos mínimos para verificar checkout y confirmación de transferencia. */
async function createTransferFlowFixture(): Promise<TransferFlowFixture> {
  const fixture: TransferFlowFixture = {
    familyId: randomUUID(),
    measurementId: randomUUID(),
    productId: randomUUID(),
    customerId: randomUUID(),
    cartItemId: randomUUID(),
    webUserId: randomUUID(),
  };
  const suffix = fixture.productId.slice(0, 8);
  await prisma.$executeRaw`INSERT INTO public."Families" ("id", "code", "name") VALUES (${fixture.familyId}::uuid, ${`FT${suffix}`}, 'QA transfer')`;
  await prisma.$executeRaw`INSERT INTO public."MeasurementTypes" ("id", "code", "name", "UnitLabel") VALUES (${fixture.measurementId}::uuid, ${`MT${suffix}`}, 'Unidad QA', 'u')`;
  await prisma.$executeRaw`INSERT INTO public."Products" ("id", "code", "description", "FamilyId", "MeasurementTypeId", "SalePrice", "CostPrice", "CurrentStock", "MinStock") VALUES (${fixture.productId}::uuid, ${`P-TRANSFER-${suffix}`}, 'Producto transfer', ${fixture.familyId}::uuid, ${fixture.measurementId}::uuid, 10, 5, 1, 0)`;
  await prisma.$executeRaw`INSERT INTO system."ShopCustomers" ("id", "Email", "PasswordHash", "FullName") VALUES (${fixture.customerId}::uuid, ${`qa-transfer-${suffix}@example.com`}, 'not-used', 'Cliente transfer')`;
  await prisma.$executeRaw`INSERT INTO system."ShopCartItems" ("id", "ShopCustomerId", "ProductId", "Quantity") VALUES (${fixture.cartItemId}::uuid, ${fixture.customerId}::uuid, ${fixture.productId}::uuid, 1)`;
  await prisma.$executeRaw`INSERT INTO system."WebUsers" ("id", "Username", "Email", "PasswordHash", "Role", "IsActive") VALUES (${fixture.webUserId}::uuid, ${`qa-transfer-${suffix}`}, ${`qa-transfer-${suffix}@example.com`}, 'not-used', 'ADMIN', TRUE)`;
  return fixture;
}

/** Elimina los datos del flujo de transferencia después de verificar sus efectos. */
async function deleteTransferFlowFixture(fixture: TransferFlowFixture): Promise<void> {
  await prisma.$executeRaw`DELETE FROM public."InventoryMovements" WHERE "ProductId" = ${fixture.productId}::uuid`;
  await prisma.$executeRaw`DELETE FROM system."ShopOrders" WHERE "ShopCustomerId" = ${fixture.customerId}::uuid`;
  await prisma.$executeRaw`DELETE FROM system."ShopCartItems" WHERE "ShopCustomerId" = ${fixture.customerId}::uuid`;
  await prisma.$executeRaw`DELETE FROM public."StockAlerts" WHERE "ProductId" = ${fixture.productId}::uuid`;
  await prisma.$executeRaw`DELETE FROM system."ShopCustomers" WHERE "id" = ${fixture.customerId}::uuid`;
  await prisma.$executeRaw`DELETE FROM system."WebUsers" WHERE "id" = ${fixture.webUserId}::uuid`;
  await prisma.$executeRaw`DELETE FROM public."Products" WHERE "id" = ${fixture.productId}::uuid`;
  await prisma.$executeRaw`DELETE FROM public."MeasurementTypes" WHERE "id" = ${fixture.measurementId}::uuid`;
  await prisma.$executeRaw`DELETE FROM public."Families" WHERE "id" = ${fixture.familyId}::uuid`;
}

describe("transiciones de estado concurrentes", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Cada carrera crea y limpia sus datos; se amplía el tiempo para Postgres en Docker local.
  it("serializa cancelar y recibir la misma OC en cinco carreras", { timeout: 30_000 }, async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const fixture = await createPurchaseRaceFixture();
      try {
        const results = await Promise.allSettled([
          purchaseOrdersService.cancel(fixture.orderId),
          purchaseOrdersService.receive(fixture.orderId, {}, fixture.webUserId),
        ]);
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        expect(results.filter((result) => result.status === "rejected" && result.reason.statusCode === 409)).toHaveLength(1);

        const state = await prisma.$queryRaw<Array<{ status: string; stock: string; movements: bigint }>>`
          SELECT po."status", p."CurrentStock"::text AS stock,
            (SELECT COUNT(*) FROM public."InventoryMovements" im WHERE im."PurchaseOrderId" = po."id") AS movements
          FROM purchasing."PurchaseOrders" po
          JOIN public."Products" p ON p."id" = ${fixture.productId}::uuid
          WHERE po."id" = ${fixture.orderId}::uuid`;
        expect(state).toHaveLength(1);
        if (state[0].status === "RECIBIDA") {
          expect(state[0].stock).toBe("2.000");
          expect(Number(state[0].movements)).toBe(1);
        } else {
          expect(state[0].status).toBe("CANCELADA");
          expect(state[0].stock).toBe("0.000");
          expect(Number(state[0].movements)).toBe(0);
        }
      } finally {
        await deletePurchaseRaceFixture(fixture);
      }
    }
  });

  // Cada carrera crea y limpia sus datos; se amplía el tiempo para Postgres en Docker local.
  it("serializa cancelar y confirmar pago del mismo pedido en cinco carreras", { timeout: 30_000 }, async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const fixture = await createShopRaceFixture();
      try {
        const results = await Promise.allSettled([
          shopOrdersService.updateAdmin(fixture.orderId, { status: "CANCELADA" }),
          shopPaymentsService.payOrder(fixture.orderId, {}, fixture.webUserId),
        ]);
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        expect(results.filter((result) => result.status === "rejected" && result.reason.statusCode === 409)).toHaveLength(1);

        const state = await prisma.$queryRaw<Array<{ status: string; paymentStatus: string }>>`
          SELECT "Status" AS status, "PaymentStatus" AS "paymentStatus"
          FROM system."ShopOrders" WHERE "id" = ${fixture.orderId}::uuid`;
        expect(state).toHaveLength(1);
        expect([
          { status: "CANCELADA", paymentStatus: "PENDIENTE" },
          { status: "PENDIENTE", paymentStatus: "PAGADO" },
        ]).toContainEqual(state[0]);
      } finally {
        await deleteShopRaceFixture(fixture);
      }
    }
  });

  it("conserva la referencia del cliente al confirmar transferencia desde el panel", async () => {
    const fixture = await createTransferFlowFixture();
    try {
      const checkout = await shopOrdersService.checkout(fixture.customerId, {
        paymentMethod: "TRANSFERENCIA",
      });
      expect(checkout.paymentStatus).toBe("PENDIENTE");

      const verification = await shopOrdersService.submitTransferReference(
        fixture.customerId,
        checkout.id,
        { reference: "TRF-QA-123", notes: "Comprobante QA" },
      );
      expect(verification.paymentStatus).toBe("EN_VERIFICACION");

      const reference = await prisma.$queryRaw<Array<{
        customerReference: string | null;
        customerReferenceAt: Date | null;
      }>>`
        SELECT "CustomerReference" AS "customerReference", "CustomerReferenceAt" AS "customerReferenceAt"
        FROM system."ShopPayments" WHERE "ShopOrderId" = ${checkout.id}::uuid
        ORDER BY "CreatedAt" DESC LIMIT 1`;
      const paid = await shopPaymentsService.payOrder(checkout.id, {
        expectedCustomerReference: reference[0].customerReference,
        expectedCustomerReferenceAt: reference[0].customerReferenceAt?.toISOString() ?? null,
      }, fixture.webUserId);
      expect(paid.paymentStatus).toBe("PAGADO");
      const payment = await prisma.$queryRaw<Array<{
        providerRef: string | null;
        confirmedBy: string | null;
        status: string;
      }>>`
        SELECT "ProviderRef" AS "providerRef", "ConfirmedByWebUserId" AS "confirmedBy", "Status" AS status
        FROM system."ShopPayments" WHERE "ShopOrderId" = ${checkout.id}::uuid`;
      expect(payment).toEqual([{ providerRef: "TRF-QA-123", confirmedBy: fixture.webUserId, status: "COMPLETADO" }]);
    } finally {
      await deleteTransferFlowFixture(fixture);
    }
  });
});
