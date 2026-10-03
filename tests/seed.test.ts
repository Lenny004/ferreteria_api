import { describe, expect, it } from "vitest";
import {
  SALE_UNITS,
  assertSeedMode,
  describeAdminSeedPlan,
  getAdminSeedConfig,
  saleUnitValuesSql,
  shouldSeedDemoAccountant,
  shouldSeedDemoData,
} from "../prisma/seed.js";

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

  it.each([["production", false], ["development", false], ["test", false]] as const)(
    "mantiene el seed demo apagado por defecto para NODE_ENV=%s",
    (nodeEnv, expected) => {
      expect(shouldSeedDemoAccountant({ NODE_ENV: nodeEnv })).toBe(expected);
      expect(shouldSeedDemoData({ NODE_ENV: nodeEnv })).toBe(expected);
    },
  );

  it("activa demos solo fuera de producción", () => {
    expect(shouldSeedDemoData({ NODE_ENV: "development", SEED_DEMO: "true" })).toBe(true);
    expect(shouldSeedDemoData({ NODE_ENV: "production", SEED_DEMO: "true" })).toBe(false);
    expect(() => assertSeedMode({ NODE_ENV: "production", SEED_DEMO: "true" })).toThrow(/producción/);
  });

  it("valida admin desde entorno y omite si no hay variables", () => {
    expect(getAdminSeedConfig({})).toBeNull();
    expect(getAdminSeedConfig({ SEED_ADMIN_USER: "root", SEED_ADMIN_PASSWORD: "Una-clave-segura-123" })).toEqual({
      username: "root",
      password: "Una-clave-segura-123",
      email: "root@ferreteria.local",
    });
    expect(() => getAdminSeedConfig({ SEED_ADMIN_USER: "root", SEED_ADMIN_PASSWORD: "admin123" })).toThrow();
    expect(() => getAdminSeedConfig({ SEED_ADMIN_USER: "root", SEED_ADMIN_PASSWORD: "corta" })).toThrow();
  });

  it("describe la decisión de crear u omitir el admin sin conectarse a BD", () => {
    expect(describeAdminSeedPlan({})).toEqual({
      configured: false,
      message: "Admin inicial omitido: defina SEED_ADMIN_USER y SEED_ADMIN_PASSWORD",
    });
    expect(describeAdminSeedPlan({
      SEED_ADMIN_USER: "root",
      SEED_ADMIN_PASSWORD: "Una-clave-segura-123",
    })).toEqual({ configured: true, message: "Admin inicial configurado" });
  });

  it("permite el contador demo solo cuando el modo demo se declara", () => {
    expect(shouldSeedDemoAccountant({ NODE_ENV: "development", SEED_DEMO: "true" })).toBe(true);
    expect(shouldSeedDemoAccountant({ NODE_ENV: "production", SEED_DEMO: "true" })).toBe(false);
  });
});
