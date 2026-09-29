import { describe, expect, it } from "vitest";
import { SALE_UNITS, saleUnitValuesSql, shouldSeedDemoAccountant } from "../prisma/seed.js";

describe("catálogo de unidades de venta", () => {
  it("mantiene las 11 unidades del POS con códigos únicos", () => {
    const codes = SALE_UNITS.map((unit) => unit.code);
    expect(SALE_UNITS).toHaveLength(11);
    expect(new Set(codes).size).toBe(11);
    expect(codes).toEqual([
      "UNIDAD",
      "MEDIA_DOCENA",
      "DOCENA",
      "PAR",
      "CIENTO",
      "MILLAR",
      "CAJA",
      "BULTO",
      "SACO",
      "ROLLO",
      "JUEGO",
    ]);
    expect(SALE_UNITS[1].abbreviation).toBe("½doc");
  });

  it("genera las filas SQL del seed desde la misma constante", () => {
    const sql = saleUnitValuesSql();
    expect(sql.split("\n")).toHaveLength(11);
    expect(sql).toContain("('UNIDAD', 'Unidad', 'u')");
    expect(sql).toContain("('JUEGO', 'Juego', 'jgo')");
  });

  it.each([
    ["production", false],
    ["development", true],
    ["test", true],
    [undefined, true],
  ] as const)("decide el seed del contador para NODE_ENV=%s", (nodeEnv, expected) => {
    expect(shouldSeedDemoAccountant({ NODE_ENV: nodeEnv })).toBe(expected);
  });
});
