import { describe, expect, it } from "vitest";
import { decimalNumber, parsePaginationQuery, parseUuidParam } from "../src/shared/validation.js";

describe("validación compartida", () => {
  it("acota y aplica la paginación", () => {
    expect(parsePaginationQuery({ page: "2", pageSize: "50" })).toEqual({ page: 2, pageSize: 50 });
    expect(() => parsePaginationQuery({ pageSize: 101 })).toThrow();
  });

  it("solo acepta UUID en :id", () => {
    expect(parseUuidParam({ id: "550e8400-e29b-41d4-a716-446655440000" }).id).toContain("550e8400");
    expect(() => parseUuidParam({ id: "1" })).toThrow();
  });

  describe("decimalNumber", () => {
    it("respeta el rango de precisión y escala", () => {
      const schema = decimalNumber(5, 2);

      expect(schema.safeParse(999.99).success).toBe(true);
      expect(schema.safeParse(1000).success).toBe(false);
      expect(schema.safeParse(-999.99).success).toBe(true);
      expect(schema.safeParse(-1000).success).toBe(false);
      expect(schema.safeParse(1.23).success).toBe(true);
      expect(schema.safeParse(1.234).success).toBe(false);
    });

    it("rechaza negativos cuando se configura como no negativo", () => {
      const schema = decimalNumber(5, 2, { nonnegative: true });

      expect(schema.safeParse(0).success).toBe(true);
      expect(schema.safeParse(-0.01).success).toBe(false);
    });

    it("rechaza entradas vacías, nulas, booleanas y arrays con un mensaje claro", () => {
      const schema = decimalNumber(5, 2);

      for (const input of ["", "   ", null, undefined, false, []]) {
        const result = schema.safeParse(input);
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error.issues[0]?.message).toBe("Ingrese un número válido.");
      }

      expect(schema.optional().safeParse(undefined).success).toBe(true);
    });

    it("solo acepta strings numéricas cuando la coerción está habilitada", () => {
      const coercive = decimalNumber(5, 2, { coerce: true });
      const strict = decimalNumber(5, 2, { coerce: false });

      expect(coercive.parse(" 12.5 ")).toBe(12.5);
      expect(strict.safeParse("12.5").success).toBe(false);
      expect(strict.parse(12.5)).toBe(12.5);
    });

    it("calcula la escala de valores en notación exponencial usando la mantisa", () => {
      expect(decimalNumber(10, 8).safeParse(1.5e-7).success).toBe(true);
      expect(decimalNumber(10, 7).safeParse(1.5e-7).success).toBe(false);
    });

    it("mantiene paso, máximo y mensajes decimales exactos", () => {
      const cases = [
        { precision: 10, scale: 4, step: 0.0001, max: 999999.9999 },
        { precision: 5, scale: 1, step: 0.1, max: 9999.9 },
        { precision: 12, scale: 2, step: 0.01, max: 9999999999.99 },
      ];

      for (const { precision, scale, step, max } of cases) {
        const schema = decimalNumber(precision, scale);

        expect(schema.safeParse(step).success).toBe(true);
        expect(schema.safeParse(max).success).toBe(true);
        const overflow = schema.safeParse(max + step);
        expect(overflow.success).toBe(false);
        if (!overflow.success) {
          expect(overflow.error.issues.map((issue) => issue.message)).toContain(
            `El valor no puede superar ${max.toFixed(scale)}.`,
          );
        }
      }
    });
  });
});
