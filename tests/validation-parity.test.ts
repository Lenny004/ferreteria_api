import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ZodTypeAny } from "zod";
import { validationParityMap } from "./validation-parity.map.js";

interface ConstraintField {
  maxLength?: number;
  precision?: number;
  scale?: number;
  step?: number;
  max?: number;
  required: boolean;
  nullable: boolean;
}

interface ZodCheck {
  kind: string;
  value?: number;
}

interface ZodDefinition {
  typeName?: string;
  innerType?: ZodTypeAny;
  schema?: ZodTypeAny;
  shape?: (() => Record<string, ZodTypeAny>) | Record<string, ZodTypeAny>;
  checks?: ZodCheck[];
  values?: string[];
}

const constraints = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "generated/constraints.json"), "utf8"),
) as { models: Record<string, { fields: Record<string, ConstraintField> }> };

function definition(schema: ZodTypeAny): ZodDefinition {
  return (schema as unknown as { _def: ZodDefinition })._def;
}

function unwrap(schema: ZodTypeAny): ZodTypeAny {
  let current = schema;
  while (["ZodOptional", "ZodNullable", "ZodDefault", "ZodEffects", "ZodCatch", "ZodBranded"].includes(definition(current).typeName ?? "")) {
    const inner = definition(current).innerType ?? definition(current).schema;
    if (!inner) break;
    current = inner;
  }
  return current;
}

function shape(schema: ZodTypeAny): Record<string, ZodTypeAny> {
  const objectShape = definition(unwrap(schema)).shape;
  if (!objectShape) return {};
  return typeof objectShape === "function" ? objectShape() : objectShape;
}

function maxAllowedByZod(schema: ZodTypeAny): number | undefined {
  const base = definition(unwrap(schema));
  const explicitMax = base.checks?.find((check) => check.kind === "max")?.value;
  if (explicitMax !== undefined) return explicitMax;
  if (base.typeName === "ZodEnum" && base.values) {
    return Math.max(...base.values.map((value) => value.length));
  }
  return undefined;
}

describe("paridad explícita entre Zod y Prisma", () => {
  it("resuelve cada entrada del mapa contra un campo del modelo", () => {
    for (const entry of validationParityMap) {
      expect(constraints.models[entry.model]?.fields[entry.column], `${entry.model}.${entry.column}`).toBeDefined();
      expect(shape(entry.schema)[entry.field], `${entry.field} en el esquema`).toBeDefined();
    }
  });

  it("no permite límites Zod por encima de VarChar ni de Decimal", () => {
    for (const entry of validationParityMap) {
      const field = constraints.models[entry.model].fields[entry.column];
      const schemaField = shape(entry.schema)[entry.field];
      const zodMaxLength = maxAllowedByZod(schemaField);

      if (field.maxLength !== undefined && zodMaxLength !== undefined) {
        expect(zodMaxLength, `${entry.model}.${entry.column}`).toBeLessThanOrEqual(field.maxLength);
      }
      if (field.precision !== undefined && field.scale !== undefined && field.step !== undefined && field.max !== undefined) {
        const zodMax = definition(unwrap(schemaField)).checks?.find((check) => check.kind === "max")?.value;
        expect(zodMax, `${entry.model}.${entry.column} debe declarar max`).toBeDefined();
        expect(zodMax).toBeLessThanOrEqual(field.max);
        expect(schemaField.safeParse(field.max + field.step).success).toBe(false);
        expect(schemaField.safeParse(-(field.max + field.step)).success).toBe(false);
        expect(schemaField.safeParse(1 + field.step / 10).success).toBe(false);
      }
      if (entry.operation === "alta" && field.required) {
        expect(schemaField.isOptional(), `${entry.model}.${entry.column} debe ser requerido en alta`).toBe(false);
      }
    }
  });
});
