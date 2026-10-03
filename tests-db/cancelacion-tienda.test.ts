import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { shopOrdersService } from "../src/modules/shop-orders/shop-orders.service.js";
import { shopPaymentsService } from "../src/modules/shop-payments/shop-payments.service.js";

const prisma = new PrismaClient();

type Fixture = {
  familyId: string;
  measurementId: string;
  productIds: [string, string];
  customerId: string;
  cartItemIds: [string, string];
  webUserId: string;
};

/** Crea dos productos y un carrito sin depender de seed para probar reposición. */
async function createFixture(): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const fixture: Fixture = {
    familyId: randomUUID(),
    measurementId: randomUUID(),
    productIds: [randomUUID(), randomUUID()],
    customerId: randomUUID(),
    cartItemIds: [randomUUID(), randomUUID()],
    webUserId: randomUUID(),
  };
  await prisma.$executeRaw`INSERT INTO public."Families" ("id", "code", "name") VALUES (${fixture.familyId}::uuid, ${`CF${suffix}`}, 'QA cancelación')`;
  await prisma.$executeRaw`INSERT INTO public."MeasurementTypes" ("id", "code", "name", "UnitLabel") VALUES (${fixture.measurementId}::uuid, ${`MC${suffix}`}, 'Unidad QA', 'u')`;
  await prisma.$executeRaw`INSERT INTO public."Products" ("id", "code", "description", "FamilyId", "MeasurementTypeId", "SalePrice", "CostPrice", "CurrentStock", "MinStock") VALUES
    (${fixture.productIds[0]}::uuid, ${`PC1${suffix}`}, 'Producto cancelación 1', ${fixture.familyId}::uuid, ${fixture.measurementId}::uuid, 10, 2, 5, 0),
    (${fixture.productIds[1]}::uuid, ${`PC2${suffix}`}, 'Producto cancelación 2', ${fixture.familyId}::uuid, ${fixture.measurementId}::uuid, 15, 3, 7, 0)`;
  await prisma.$executeRaw`INSERT INTO system."ShopCustomers" ("id", "Email", "PasswordHash", "FullName") VALUES (${fixture.customerId}::uuid, ${`qc-${suffix}@example.com`}, 'not-used', 'Cliente cancelación')`;
  await prisma.$executeRaw`INSERT INTO system."ShopCartItems" ("id", "ShopCustomerId", "ProductId", "Quantity") VALUES
    (${fixture.cartItemIds[0]}::uuid, ${fixture.customerId}::uuid, ${fixture.productIds[0]}::uuid, 2),
    (${fixture.cartItemIds[1]}::uuid, ${fixture.customerId}::uuid, ${fixture.productIds[1]}::uuid, 3)`;
  await prisma.$executeRaw`INSERT INTO system."WebUsers" ("id", "Username", "Email", "PasswordHash", "Role", "IsActive") VALUES (${fixture.webUserId}::uuid, ${`qc-${suffix}`}, ${`qca-${suffix}@example.com`}, 'not-used', 'ADMIN', TRUE)`;
  return fixture;
}

/** Elimina el fixture respetando las dependencias y la FK del movimiento nuevo. */
async function deleteFixture(fixture: Fixture): Promise<void> {
  await prisma.$executeRaw`DELETE FROM system."ShopOrders" WHERE "ShopCustomerId" = ${fixture.customerId}::uuid`;
  await prisma.$executeRaw`DELETE FROM system."ShopCartItems" WHERE "ShopCustomerId" = ${fixture.customerId}::uuid`;
  await prisma.$executeRaw`DELETE FROM public."StockAlerts" WHERE "ProductId" IN (${fixture.productIds[0]}::uuid, ${fixture.productIds[1]}::uuid)`;
  await prisma.$executeRaw`DELETE FROM public."InventoryMovements" WHERE "ProductId" IN (${fixture.productIds[0]}::uuid, ${fixture.productIds[1]}::uuid)`;
  await prisma.$executeRaw`DELETE FROM system."WebUsers" WHERE "id" = ${fixture.webUserId}::uuid`;
  await prisma.$executeRaw`DELETE FROM system."ShopCustomers" WHERE "id" = ${fixture.customerId}::uuid`;
  await prisma.$executeRaw`DELETE FROM public."Products" WHERE "id" IN (${fixture.productIds[0]}::uuid, ${fixture.productIds[1]}::uuid)`;
  await prisma.$executeRaw`DELETE FROM public."MeasurementTypes" WHERE "id" = ${fixture.measurementId}::uuid`;
  await prisma.$executeRaw`DELETE FROM public."Families" WHERE "id" = ${fixture.familyId}::uuid`;
}

/** Ejecuta checkout y devuelve el pedido con inventario ya descontado. */
async function checkout(fixture: Fixture) {
  return shopOrdersService.checkout(fixture.customerId, { paymentMethod: "TRANSFERENCIA" });
}

describe("cancelación de pedidos de tienda con reposición", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("repone dos productos y encadena stockBefore/stockAfter", { timeout: 30_000 }, async () => {
    const fixture = await createFixture();
    try {
      const order = await checkout(fixture);
      await shopOrdersService.updateAdmin(order.id, { status: "CANCELADA" });

      const rows = await prisma.$queryRaw<Array<{
        productId: string;
        movementType: string;
        shopOrderId: string | null;
        quantity: string;
        stockBefore: string;
        stockAfter: string;
      }>>`
        SELECT "ProductId" AS "productId", "MovementType" AS "movementType",
          "ShopOrderId" AS "shopOrderId", "quantity"::text AS quantity,
          "StockBefore"::text AS "stockBefore", "StockAfter"::text AS "stockAfter"
        FROM public."InventoryMovements" WHERE "ShopOrderId" = ${order.id}::uuid
        ORDER BY "ProductId", "CreatedAt"`;
      expect(rows.filter((row) => row.movementType === "ENTRADA_DEVOLUCION")).toHaveLength(2);
      expect(rows.filter((row) => row.movementType === "ENTRADA_DEVOLUCION").every((row) => row.shopOrderId === order.id)).toBe(true);
      // Se indexa por producto porque los UUID aleatorios no garantizan el orden de `ORDER BY "ProductId"`.
      const returnsByProduct = new Map(rows
        .filter((row) => row.movementType === "ENTRADA_DEVOLUCION")
        .map((row) => [row.productId, [row.stockBefore, row.stockAfter]]));
      expect(returnsByProduct.get(fixture.productIds[0])).toEqual(["3.000", "5.000"]);
      expect(returnsByProduct.get(fixture.productIds[1])).toEqual(["4.000", "7.000"]);
    } finally {
      await deleteFixture(fixture);
    }
  });

  it("es idempotente al cancelar dos veces en paralelo", { timeout: 30_000 }, async () => {
    const fixture = await createFixture();
    try {
      const order = await checkout(fixture);
      await shopOrdersService.updateAdmin(order.id, { status: "CANCELADA" });
      await shopOrdersService.updateAdmin(order.id, { status: "CANCELADA" });
      await Promise.all([
        shopOrdersService.updateAdmin(order.id, { status: "CANCELADA" }),
        shopOrdersService.updateAdmin(order.id, { status: "CANCELADA" }),
      ]);
      const count = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count FROM public."InventoryMovements"
        WHERE "ShopOrderId" = ${order.id}::uuid AND "MovementType" = 'ENTRADA_DEVOLUCION'`;
      expect(Number(count[0].count)).toBe(2);
    } finally {
      await deleteFixture(fixture);
    }
  });

  it("hace compatible la reposición con salidas antiguas sin ShopOrderId", { timeout: 30_000 }, async () => {
    const fixture = await createFixture();
    try {
      const order = await checkout(fixture);
      await prisma.$executeRaw`UPDATE public."InventoryMovements" SET "ShopOrderId" = NULL
        WHERE "ShopOrderId" = ${order.id}::uuid`;
      await shopOrdersService.updateAdmin(order.id, { status: "CANCELADA" });
      const count = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count FROM public."InventoryMovements"
        WHERE "ShopOrderId" = ${order.id}::uuid AND "MovementType" = 'ENTRADA_DEVOLUCION'`;
      expect(Number(count[0].count)).toBe(2);
    } finally {
      await deleteFixture(fixture);
    }
  });

  it("rechaza cancelar un pedido ENTREGADA sin reponer stock", { timeout: 30_000 }, async () => {
    const fixture = await createFixture();
    try {
      const order = await checkout(fixture);
      await prisma.$executeRaw`UPDATE system."ShopOrders" SET "Status" = 'ENTREGADA' WHERE "id" = ${order.id}::uuid`;
      await expect(shopOrdersService.updateAdmin(order.id, { status: "CANCELADA" }))
        .rejects.toMatchObject({ statusCode: 409 });
      const state = await prisma.$queryRaw<Array<{ status: string; returns: bigint }>>`
        SELECT so."Status" AS status,
          (SELECT COUNT(*) FROM public."InventoryMovements" im
           WHERE im."ShopOrderId" = so."id" AND im."MovementType" = 'ENTRADA_DEVOLUCION') AS returns
        FROM system."ShopOrders" so WHERE so."id" = ${order.id}::uuid`;
      expect(state[0].status).toBe("ENTREGADA");
      expect(Number(state[0].returns)).toBe(0);
    } finally {
      await deleteFixture(fixture);
    }
  });

  it("serializa cancelar contra confirmar pago: uno gana y el otro responde 409", { timeout: 30_000 }, async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const fixture = await createFixture();
      try {
        const order = await checkout(fixture);
        const results = await Promise.allSettled([
          shopOrdersService.updateAdmin(order.id, { status: "CANCELADA" }),
          shopPaymentsService.payOrder(order.id, {}, fixture.webUserId),
        ]);
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        expect(results.filter((result) => result.status === "rejected" && result.reason.statusCode === 409)).toHaveLength(1);

        const state = await prisma.$queryRaw<Array<{ status: string; paymentStatus: string; returns: bigint }>>`
          SELECT "Status" AS status, "PaymentStatus" AS "paymentStatus",
            (SELECT COUNT(*) FROM public."InventoryMovements" im
             WHERE im."ShopOrderId" = so."id" AND im."MovementType" = 'ENTRADA_DEVOLUCION') AS returns
          FROM system."ShopOrders" so WHERE so."id" = ${order.id}::uuid`;
        if (state[0].status === "CANCELADA") {
          expect(state[0].paymentStatus).toBe("PENDIENTE");
          expect(Number(state[0].returns)).toBe(2);
        } else {
          expect(state[0]).toMatchObject({ status: "PENDIENTE", paymentStatus: "PAGADO" });
          expect(Number(state[0].returns)).toBe(0);
        }
      } finally {
        await deleteFixture(fixture);
      }
    }
  });

  it("bloquea referencias solo del propietario del pedido", { timeout: 30_000 }, async () => {
    const fixture = await createFixture();
    try {
      const order = await checkout(fixture);
      let release!: () => void;
      let signalReady!: () => void;
      const held = new Promise<void>((resolve) => { release = resolve; });
      const ready = new Promise<void>((resolve) => { signalReady = resolve; });
      const holder = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM system."ShopOrders" WHERE "id" = ${order.id}::uuid FOR UPDATE`;
        signalReady();
        await held;
      });
      await ready;

      const started = Date.now();
      await expect(shopOrdersService.submitTransferReference(randomUUID(), order.id, { reference: "AJENA" }))
        .rejects.toMatchObject({ statusCode: 404 });
      expect(Date.now() - started).toBeLessThan(2_000);

      const ownerCall = shopOrdersService.submitTransferReference(
        fixture.customerId,
        order.id,
        { reference: "PROPIA" },
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
      release();
      await holder;
      await expect(ownerCall).resolves.toMatchObject({ paymentStatus: "EN_VERIFICACION" });
    } finally {
      await deleteFixture(fixture);
    }
  });
});
