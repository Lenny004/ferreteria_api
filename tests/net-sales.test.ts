import { describe, expect, it } from "vitest";
import {
  averageTicket,
  fillDailySeries,
  mergeByKey,
  monthOverMonthPct,
  netAmount,
} from "../src/modules/dashboard/net-sales.js";

describe("ventas netas", () => {
  it("calcula netos negativos y redondea a dos decimales", () => {
    expect(netAmount(10, 12)).toBe(-2);
    expect(netAmount(10.13, 2.12)).toBe(8.01);
    expect(netAmount(0.3, 0.1)).toBe(0.2);
  });

  it("combina claves presentes en un solo lado", () => {
    expect(
      mergeByKey(
        [
          { key: "A", amount: 10, quantity: 2, count: 1 },
          { key: "A", amount: 5, quantity: 1, count: 1 },
        ],
        [{ key: "B", amount: 12, quantity: 3, count: 1 }],
      ),
    ).toEqual([
      {
        key: "A",
        gross: 15,
        returns: 0,
        net: 15,
        grossQuantity: 3,
        returnedQuantity: 0,
        quantity: 3,
        grossCount: 2,
        returnsCount: 0,
      },
      {
        key: "B",
        gross: 0,
        returns: 12,
        net: -12,
        grossQuantity: 0,
        returnedQuantity: 3,
        quantity: -3,
        grossCount: 0,
        returnsCount: 1,
      },
    ]);
  });

  it("rellena siete días en orden ascendente", () => {
    const series = fillDailySeries(
      new Date("2031-03-09T00:00:00.000Z"),
      7,
      [{ date: "2031-03-10", amount: 20, count: 1 }],
      [{ date: "2031-03-15", amount: 25, count: 2 }],
    );

    expect(series).toHaveLength(7);
    expect(series[0]).toEqual({ date: "2031-03-09", gross: 0, returns: 0, net: 0, tx: 0, returnsCount: 0 });
    expect(series[1]).toEqual({ date: "2031-03-10", gross: 20, returns: 0, net: 20, tx: 1, returnsCount: 0 });
    expect(series[6]).toEqual({ date: "2031-03-15", gross: 0, returns: 25, net: -25, tx: 0, returnsCount: 2 });
  });

  it("calcula MoM sobre neto y devuelve null con prevMonth no positivo", () => {
    expect(monthOverMonthPct(115, 100)).toBe(15);
    expect(monthOverMonthPct(-10, 0)).toBeNull();
    expect(monthOverMonthPct(10, -5)).toBeNull();
  });

  it("devuelve ticket cero cuando no hay transacciones", () => {
    expect(averageTicket(-25, 0)).toBe(0);
    expect(averageTicket(115, 2)).toBe(57.5);
  });
});
