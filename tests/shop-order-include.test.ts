import { describe, expect, it } from "vitest";
import { shopOrderClientInclude } from "../src/modules/shop-orders/shop-order.include.js";

describe("proyección de pedidos para cliente de tienda", () => {
  it("omite el UUID interno del personal que confirmó el pago", () => {
    const paymentSelect = shopOrderClientInclude.payments.select;
    expect(paymentSelect).not.toHaveProperty("confirmedByWebUserId");
    expect(paymentSelect).toMatchObject({ id: true, status: true, confirmedAt: true });
  });
});
