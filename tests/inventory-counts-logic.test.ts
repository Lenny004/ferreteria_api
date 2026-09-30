import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  buildCountReason,
  buildInventoryCountSummary,
  calculateStockAfter,
  calculateVariance,
  calculateVarianceValue,
  normalizeCountedQuantity,
} from "../src/modules/inventory/inventory-counts.logic.js";

describe("lógica de conteos físicos", () => {
  it("normaliza cantidades y rechaza más decimales o negativos", () => {
    expect(normalizeCountedQuantity("2.50", 2).toString()).toBe("2.5");
    expect(normalizeCountedQuantity("1.234", 3).toString()).toBe("1.234");
    expect(() => normalizeCountedQuantity("2.501", 2)).toThrow();
    expect(() => normalizeCountedQuantity("1.2345", 3)).toThrow();
    expect(() => normalizeCountedQuantity("-1", 0)).toThrow();
  });

  it("calcula varianza, valoración a dos decimales y stock negativo", () => {
    expect(calculateVariance("7.25", "5.00").toString()).toBe("2.25");
    expect(calculateVariance("4", "6").toString()).toBe("-2");
    expect(calculateVariance("5", "5").toString()).toBe("0");
    expect(calculateVarianceValue("2.25", "3.456").toString()).toBe("7.78");
    expect(calculateStockAfter("1", "-1.5")).toEqual({
      stockAfter: new Prisma.Decimal("-0.5"),
      isNegative: true,
    });
  });

  it("construye el resumen de pendientes, sobrantes, faltantes y neto", () => {
    const summary = buildInventoryCountSummary([
      { countedQuantity: new Prisma.Decimal("12"), systemStockAtCount: new Prisma.Decimal("10"), costPrice: new Prisma.Decimal("3") },
      { countedQuantity: new Prisma.Decimal("4"), systemStockAtCount: new Prisma.Decimal("6"), costPrice: new Prisma.Decimal("2.5") },
      { countedQuantity: null, systemStockAtCount: null, costPrice: new Prisma.Decimal("8") },
      { countedQuantity: new Prisma.Decimal("1"), systemStockAtCount: new Prisma.Decimal("1"), costPrice: new Prisma.Decimal("8") },
    ]);
    expect(summary).toMatchObject({ totalLines: 4, countedLines: 3, pendingLines: 1, linesWithVariance: 2 });
    expect(summary.surplusQty.toString()).toBe("2");
    expect(summary.surplusValue.toString()).toBe("6");
    expect(summary.shortageQty.toString()).toBe("2");
    expect(summary.shortageValue.toString()).toBe("5");
    expect(summary.netQty.toString()).toBe("0");
    expect(summary.netValue.toString()).toBe("1");
  });

  it("trunca el motivo a 300 caracteres", () => {
    const reason = buildCountReason(42, "x".repeat(400));
    expect(reason).toBe(`Conteo físico #42: ${"x".repeat(400)}`.slice(0, 300));
    expect(reason).toHaveLength(300);
  });
});
