import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { resolveInitialPayment } from "../src/modules/shop-payments/shop-payments.service.js";

describe("estado inicial de pago de la tienda", () => {
  it("mantiene TARJETA pendiente y sin referencia simulada", () => {
    const result = resolveInitialPayment("TARJETA", new Prisma.Decimal("12.34"));
    expect(result.status).toBe("PENDIENTE");
    expect(result.orderPaymentStatus).toBe("PENDIENTE");
    expect(result.providerRef).toBeNull();
  });
});
