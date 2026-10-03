import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { calculateIva, roundMoney } from "../src/shared/tax.js";

describe("dinero e IVA de la tienda", () => {
  it.each([
    ["0.005", "0.01"],
    ["0.004", "0.00"],
    ["0.1", "0.10"],
    ["0.2", "0.20"],
    ["1.2349", "1.23"],
  ])("redondea %s a %s", (value, expected) => {
    expect(roundMoney(value).toFixed(2)).toBe(expected);
  });

  it("calcula IVA sobre subtotal Decimal sin errores binarios", () => {
    const subtotal = roundMoney(new Prisma.Decimal("0.1").add("0.2"));
    expect(subtotal.toFixed(2)).toBe("0.30");
    expect(calculateIva(subtotal).toFixed(2)).toBe("0.04");
  });
});
