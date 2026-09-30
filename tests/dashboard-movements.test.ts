import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { mapMovementsToday } from "../src/modules/dashboard/dashboard.service.js";

describe("movimientos del dashboard", () => {
  it("mantiene cantidades positivas y dirección por tipo con signos históricos mixtos", () => {
    const result = mapMovementsToday([
      { movementType: "AJUSTE_SALIDA", count: 2, quantity: new Prisma.Decimal("6") },
      { movementType: "SALIDA_VENTA", count: 1, quantity: "-3.5" },
      { movementType: "ENTRADA_COMPRA", count: 2, quantity: "8" },
    ]);

    expect(result).toEqual([
      { movementType: "AJUSTE_SALIDA", count: 2, quantity: 6, direction: "SALIDA" },
      { movementType: "SALIDA_VENTA", count: 1, quantity: 3.5, direction: "SALIDA" },
      { movementType: "ENTRADA_COMPRA", count: 2, quantity: 8, direction: "ENTRADA" },
    ]);
  });
});
