import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env.js";
import {
  DEFAULT_BUSINESS_TZ,
  businessDateKey,
  businessTimeZone,
  dateKeyToDbDate,
  isValidTimeZone,
} from "../src/shared/business-time.js";
import { fillDailySeries } from "../src/modules/dashboard/net-sales.js";

const SV = "America/El_Salvador";

describe("zona horaria del negocio", () => {
  it("usa America/El_Salvador por defecto y respeta BUSINESS_TZ", () => {
    expect(DEFAULT_BUSINESS_TZ).toBe(SV);
    expect(businessTimeZone({})).toBe(SV);
    expect(businessTimeZone({ BUSINESS_TZ: "  " })).toBe(SV);
    expect(businessTimeZone({ BUSINESS_TZ: " UTC " })).toBe("UTC");
    expect(() => businessTimeZone({ BUSINESS_TZ: "Marte/Olympus" })).toThrow(/BUSINESS_TZ/);
    expect(isValidTimeZone(SV)).toBe(true);
    expect(isValidTimeZone("No/Existe")).toBe(false);
  });

  it("fecha local: 11:30 PM sigue siendo el mismo día y 12:05 AM ya es el siguiente", () => {
    // 2031-03-15 23:30 hora local = 2031-03-16T05:30Z; en UTC ya sería el 16.
    expect(businessDateKey(new Date("2031-03-16T05:30:00.000Z"), SV)).toBe("2031-03-15");
    expect(businessDateKey(new Date("2031-03-16T05:30:00.000Z"), "UTC")).toBe("2031-03-16");
    // 2031-03-16 00:05 hora local = 2031-03-16T06:05Z.
    expect(businessDateKey(new Date("2031-03-16T06:05:00.000Z"), SV)).toBe("2031-03-16");
  });

  it("fecha local en el cambio de mes y de año", () => {
    expect(businessDateKey(new Date("2031-04-01T05:30:00.000Z"), SV)).toBe("2031-03-31");
    expect(businessDateKey(new Date("2031-04-01T06:05:00.000Z"), SV)).toBe("2031-04-01");
    expect(businessDateKey(new Date("2032-01-01T05:59:59.999Z"), SV)).toBe("2031-12-31");
  });

  it("convierte fechas locales a columnas date y suma días cruzando el mes", () => {
    expect(dateKeyToDbDate("2031-03-31").toISOString()).toBe("2031-03-31T00:00:00.000Z");
    expect(dateKeyToDbDate("2031-03-31", 1).toISOString()).toBe("2031-04-01T00:00:00.000Z");
    expect(dateKeyToDbDate("2031-12-15", 30).toISOString()).toBe("2032-01-14T00:00:00.000Z");
  });

  it("rellena la serie diaria desde una fecha local y cruza el fin de mes", () => {
    const series = fillDailySeries("2031-03-28", 7, [{ date: "2031-04-01", amount: 10, count: 1 }], []);
    expect(series.map((row) => row.date)).toEqual([
      "2031-03-28",
      "2031-03-29",
      "2031-03-30",
      "2031-03-31",
      "2031-04-01",
      "2031-04-02",
      "2031-04-03",
    ]);
    expect(series[4]).toMatchObject({ gross: 10, tx: 1 });
  });

  it("loadEnv valida BUSINESS_TZ con America/El_Salvador por defecto", () => {
    const base = {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
      JWT_SECRET: "x".repeat(40),
      CORS_ORIGIN: "http://localhost:3000",
    } as NodeJS.ProcessEnv;
    expect(loadEnv(base).BUSINESS_TZ).toBe(SV);
    expect(loadEnv({ ...base, BUSINESS_TZ: "UTC" }).BUSINESS_TZ).toBe("UTC");
    expect(() => loadEnv({ ...base, BUSINESS_TZ: "Marte/Olympus" })).toThrow(/BUSINESS_TZ/);
  });
});