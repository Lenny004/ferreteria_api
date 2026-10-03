import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inventoryService } from "../src/modules/inventory/inventory.service.js";
import { purchaseOrdersService } from "../src/modules/purchasing/purchase-orders.service.js";
import { shopOrdersService } from "../src/modules/shop-orders/shop-orders.service.js";
import { shopPaymentsService } from "../src/modules/shop-payments/shop-payments.service.js";

const prisma = new PrismaClient();
const ids = {
  family: randomUUID(),
  measurement: randomUUID(),
  product: randomUUID(),
  employee: randomUUID(),
  supplier: randomUUID(),
  purchaseOrder: randomUUID(),
  purchaseDetail: randomUUID(),
  receivingProduct: randomUUID(),
  customer: randomUUID(),
  cartItem: randomUUID(),
  checkoutProduct: randomUUID(),
  paymentCustomer: randomUUID(),
  paymentCartItem: randomUUID(),
  paymentProduct: randomUUID(),
  webUser: randomUUID(),
};
const suffix = randomUUID().slice(0, 8);

/** Crea fixtures mínimos con UUID propios para no depender del seed. */
async function createFixtures(): Promise<void> {
  await prisma.$executeRaw`INSERT INTO public."Families" ("id", "code", "name") VALUES (${ids.family}::uuid, ${`F${suffix}`}, 'QA concurrencia')`;
  await prisma.$executeRaw`INSERT INTO public."MeasurementTypes" ("id", "code", "name", "UnitLabel") VALUES (${ids.measurement}::uuid, ${`M${suffix}`}, 'Unidad QA', 'u')`;
  await prisma.$executeRaw`INSERT INTO public."Products" ("id", "code", "description", "FamilyId", "MeasurementTypeId", "SalePrice", "CostPrice", "CurrentStock", "MinStock") VALUES (${ids.product}::uuid, ${`QA-STOCK-${suffix}`}, 'Producto QA stock', ${ids.family}::uuid, ${ids.measurement}::uuid, 10, 5, 10, 0)`;
  await prisma.$executeRaw`INSERT INTO public."Products" ("id", "code", "description", "FamilyId", "MeasurementTypeId", "SalePrice", "CostPrice", "CurrentStock", "MinStock") VALUES (${ids.receivingProduct}::uuid, ${`QA-RECEIVE-${suffix}`}, 'Producto QA recepción', ${ids.family}::uuid, ${ids.measurement}::uuid, 10, 5, 4, 0)`;
  await prisma.$executeRaw`INSERT INTO hr."Employees" ("id", "FirstName", "LastName", "HireDate") VALUES (${ids.employee}::uuid, 'QA', 'Empleado', CURRENT_DATE)`;
  await prisma.$executeRaw`INSERT INTO purchasing."Suppliers" ("id", "name") VALUES (${ids.supplier}::uuid, ${`Proveedor QA ${suffix}`})`;
  await prisma.$executeRaw`INSERT INTO purchasing."PurchaseOrders" ("id", "SupplierId", "EmployeeId", "status", "subtotal", "TaxAmount", "total") VALUES (${ids.purchaseOrder}::uuid, ${ids.supplier}::uuid, ${ids.employee}::uuid, 'CONFIRMADA', 10, 1.3, 11.3)`;
  await prisma.$executeRaw`INSERT INTO purchasing."PurchaseOrderDetails" ("id", "PurchaseOrderId", "ProductId", "quantity", "UnitCost", "TaxRate", "subtotal", "total") VALUES (${ids.purchaseDetail}::uuid, ${ids.purchaseOrder}::uuid, ${ids.receivingProduct}::uuid, 2, 5, 0.13, 10, 11.3)`;
  await prisma.$executeRaw`INSERT INTO system."ShopCustomers" ("id", "Email", "PasswordHash", "FullName") VALUES (${ids.customer}::uuid, ${`qa-${suffix}@example.com`}, 'not-used', 'Cliente QA')`;
  await prisma.$executeRaw`INSERT INTO public."Products" ("id", "code", "description", "FamilyId", "MeasurementTypeId", "SalePrice", "CostPrice", "CurrentStock", "MinStock") VALUES (${ids.checkoutProduct}::uuid, ${`QA-CHECKOUT-${suffix}`}, 'Producto QA checkout', ${ids.family}::uuid, ${ids.measurement}::uuid, 1.25, 0.5, 2, 0)`;
  await prisma.$executeRaw`INSERT INTO system."ShopCartItems" ("id", "ShopCustomerId", "ProductId", "Quantity") VALUES (${ids.cartItem}::uuid, ${ids.customer}::uuid, ${ids.checkoutProduct}::uuid, 2)`;
  await prisma.$executeRaw`INSERT INTO public."Products" ("id", "code", "description", "FamilyId", "MeasurementTypeId", "SalePrice", "CostPrice", "CurrentStock", "MinStock") VALUES (${ids.paymentProduct}::uuid, ${`QA-PAYMENT-${suffix}`}, 'Producto QA pago', ${ids.family}::uuid, ${ids.measurement}::uuid, 1.25, 0.5, 1, 0)`;
  await prisma.$executeRaw`INSERT INTO system."ShopCustomers" ("id", "Email", "PasswordHash", "FullName") VALUES (${ids.paymentCustomer}::uuid, ${`qa-pay-${suffix}@example.com`}, 'not-used', 'Cliente QA pago')`;
  await prisma.$executeRaw`INSERT INTO system."ShopCartItems" ("id", "ShopCustomerId", "ProductId", "Quantity") VALUES (${ids.paymentCartItem}::uuid, ${ids.paymentCustomer}::uuid, ${ids.paymentProduct}::uuid, 1)`;
  await prisma.$executeRaw`INSERT INTO system."WebUsers" ("id", "Username", "Email", "PasswordHash", "Role", "IsActive") VALUES (${ids.webUser}::uuid, ${`qa-web-${suffix}`}, ${`qa-web-${suffix}@example.com`}, 'not-used', 'ADMIN', TRUE)`;
}

/** Elimina fixtures y efectos dependientes aun si un caso falla parcialmente. */
async function deleteFixtures(): Promise<void> {
  await prisma.$executeRaw`DELETE FROM public."InventoryMovements" WHERE "ProductId" IN (${ids.product}::uuid, ${ids.receivingProduct}::uuid, ${ids.checkoutProduct}::uuid, ${ids.paymentProduct}::uuid)`;
  await prisma.$executeRaw`DELETE FROM system."ShopOrders" WHERE "ShopCustomerId" IN (${ids.customer}::uuid, ${ids.paymentCustomer}::uuid)`;
  await prisma.$executeRaw`DELETE FROM system."ShopCartItems" WHERE "ShopCustomerId" IN (${ids.customer}::uuid, ${ids.paymentCustomer}::uuid)`;
  await prisma.$executeRaw`DELETE FROM public."StockAlerts" WHERE "ProductId" IN (${ids.product}::uuid, ${ids.receivingProduct}::uuid, ${ids.checkoutProduct}::uuid, ${ids.paymentProduct}::uuid)`;
  await prisma.$executeRaw`DELETE FROM purchasing."PurchaseOrderDetails" WHERE "PurchaseOrderId" = ${ids.purchaseOrder}::uuid`;
  await prisma.$executeRaw`DELETE FROM purchasing."PurchaseOrders" WHERE "id" = ${ids.purchaseOrder}::uuid`;
  await prisma.$executeRaw`DELETE FROM purchasing."Suppliers" WHERE "id" = ${ids.supplier}::uuid`;
  await prisma.$executeRaw`DELETE FROM system."ShopCustomers" WHERE "id" IN (${ids.customer}::uuid, ${ids.paymentCustomer}::uuid)`;
  await prisma.$executeRaw`DELETE FROM system."WebUsers" WHERE "id" = ${ids.webUser}::uuid`;
  await prisma.$executeRaw`DELETE FROM public."Products" WHERE "id" IN (${ids.product}::uuid, ${ids.receivingProduct}::uuid, ${ids.checkoutProduct}::uuid, ${ids.paymentProduct}::uuid)`;
  await prisma.$executeRaw`DELETE FROM hr."Employees" WHERE "id" = ${ids.employee}::uuid`;
  await prisma.$executeRaw`DELETE FROM public."MeasurementTypes" WHERE "id" = ${ids.measurement}::uuid`;
  await prisma.$executeRaw`DELETE FROM public."Families" WHERE "id" = ${ids.family}::uuid`;
}

describe("concurrencia real de inventario y tienda", () => {
  beforeAll(createFixtures);
  afterAll(async () => {
    await deleteFixtures();
    await prisma.$disconnect();
  });

  it("serializa entradas y salidas paralelas y conserva cadenas de saldos", async () => {
    const entries = Array.from({ length: 20 }, () => inventoryService.createMovement({
      productId: ids.product,
      movementType: "AJUSTE_ENTRADA",
      quantity: 1,
    }));
    await Promise.all(entries);

    const exits = Array.from({ length: 10 }, () => inventoryService.createMovement({
      productId: ids.product,
      movementType: "AJUSTE_SALIDA",
      quantity: 1,
    }));
    await Promise.all(exits);

    const product = await prisma.$queryRaw<Array<{ stock: string }>>`SELECT "CurrentStock"::text AS stock FROM public."Products" WHERE "id" = ${ids.product}::uuid`;
    expect(product[0].stock).toBe("20.000");
    const movements = await prisma.$queryRaw<Array<{ before: string; after: string }>>`SELECT "StockBefore"::text AS before, "StockAfter"::text AS after FROM public."InventoryMovements" WHERE "ProductId" = ${ids.product}::uuid AND "MovementType" = 'AJUSTE_ENTRADA' ORDER BY "StockBefore"`;
    expect(movements).toHaveLength(20);
    movements.forEach((movement, index) => {
      expect(movement.before).toBe(`${10 + index}.000`);
      expect(movement.after).toBe(`${11 + index}.000`);
      expect(Number(movement.after)).toBeGreaterThan(Number(movement.before));
      if (index > 0) expect(movement.before).toBe(movements[index - 1].after);
    });
    const exitMovements = await prisma.$queryRaw<Array<{ before: string; after: string }>>`SELECT "StockBefore"::text AS before, "StockAfter"::text AS after FROM public."InventoryMovements" WHERE "ProductId" = ${ids.product}::uuid AND "MovementType" = 'AJUSTE_SALIDA' ORDER BY "StockBefore" DESC`;
    expect(exitMovements).toHaveLength(10);
    exitMovements.forEach((movement, index) => {
      expect(movement.before).toBe(`${30 - index}.000`);
      expect(movement.after).toBe(`${29 - index}.000`);
      if (index > 0) expect(movement.before).toBe(exitMovements[index - 1].after);
    });
  });

  it("acepta una sola recepción concurrente y rechaza las siguientes", async () => {
    const results = await Promise.allSettled([
      purchaseOrdersService.receive(ids.purchaseOrder),
      purchaseOrdersService.receive(ids.purchaseOrder),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected" && result.reason.statusCode === 409)).toHaveLength(1);
    const receivedBeforeThirdCall = await prisma.$queryRaw<Array<{ stock: string }>>`SELECT "CurrentStock"::text AS stock FROM public."Products" WHERE "id" = ${ids.receivingProduct}::uuid`;
    await expect(purchaseOrdersService.receive(ids.purchaseOrder)).rejects.toMatchObject({ statusCode: 409 });
    const receivedAfterThirdCall = await prisma.$queryRaw<Array<{ stock: string }>>`SELECT "CurrentStock"::text AS stock FROM public."Products" WHERE "id" = ${ids.receivingProduct}::uuid`;
    expect(receivedBeforeThirdCall[0].stock).toBe("6.000");
    expect(receivedAfterThirdCall[0].stock).toBe("6.000");
    const movements = await prisma.$queryRaw<Array<{ quantity: string }>>`SELECT quantity::text AS quantity FROM public."InventoryMovements" WHERE "PurchaseOrderId" = ${ids.purchaseOrder}::uuid`;
    expect(movements).toHaveLength(1);
    expect(movements[0].quantity).toBe("2.000");
    const attribution = await prisma.$queryRaw<Array<{ receivedBy: string | null; employeeId: string | null }>>`
      SELECT po."ReceivedById" AS "receivedBy", im."EmployeeId" AS "employeeId"
      FROM purchasing."PurchaseOrders" po
      JOIN public."InventoryMovements" im ON im."PurchaseOrderId" = po."id"
      WHERE po."id" = ${ids.purchaseOrder}::uuid`;
    expect(attribution).toEqual([{ receivedBy: null, employeeId: null }]);
  });

  it("serializa dos checkouts del mismo cliente y descuenta una sola vez", async () => {
    const results = await Promise.allSettled([
      shopOrdersService.checkout(ids.customer, { paymentMethod: "TARJETA" }),
      shopOrdersService.checkout(ids.customer, { paymentMethod: "TARJETA" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const orders = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM system."ShopOrders" WHERE "ShopCustomerId" = ${ids.customer}::uuid`;
    expect(Number(orders[0].count)).toBe(1);
    const product = await prisma.$queryRaw<Array<{ stock: string }>>`SELECT "CurrentStock"::text AS stock FROM public."Products" WHERE "id" = ${ids.checkoutProduct}::uuid`;
    expect(product[0].stock).toBe("0.000");
  });

  it("confirma un pago de tarjeta una sola vez en concurrencia real", async () => {
    const order = await shopOrdersService.checkout(ids.paymentCustomer, { paymentMethod: "TARJETA" });
    const initialPayment = await prisma.$queryRaw<Array<{ status: string; providerRef: string | null }>>`SELECT "Status" AS status, "ProviderRef" AS "providerRef" FROM system."ShopPayments" WHERE "ShopOrderId" = ${order.id}::uuid`;
    expect(initialPayment).toEqual([{ status: "PENDIENTE", providerRef: null }]);

    const results = await Promise.allSettled([
      shopPaymentsService.payOrder(order.id, {}, ids.webUser),
      shopPaymentsService.payOrder(order.id, {}, ids.webUser),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected" && result.reason.statusCode === 409)).toHaveLength(1);

    const persistedOrder = await prisma.$queryRaw<Array<{ paymentStatus: string }>>`SELECT "PaymentStatus" AS "paymentStatus" FROM system."ShopOrders" WHERE "id" = ${order.id}::uuid`;
    const persistedPayment = await prisma.$queryRaw<Array<{ status: string; confirmedBy: string; confirmedAt: Date | null }>>`SELECT "Status" AS status, "ConfirmedByWebUserId" AS "confirmedBy", "ConfirmedAt" AS "confirmedAt" FROM system."ShopPayments" WHERE "ShopOrderId" = ${order.id}::uuid`;
    expect(persistedOrder[0].paymentStatus).toBe("PAGADO");
    expect(persistedPayment).toHaveLength(1);
    expect(persistedPayment[0]).toMatchObject({ status: "COMPLETADO", confirmedBy: ids.webUser });
    expect(persistedPayment[0].confirmedAt).not.toBeNull();
  });
});
