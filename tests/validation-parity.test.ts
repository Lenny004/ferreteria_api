import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { z, type ZodTypeAny } from "zod";
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
  type?: ZodTypeAny;
  shape?: (() => Record<string, ZodTypeAny>) | Record<string, ZodTypeAny>;
  checks?: ZodCheck[];
  values?: string[];
}

/** Campo string o numérico descubierto en un esquema exportado. */
interface DiscoveredPrimitiveField {
  schema: ZodTypeAny;
  field: string;
  path: string;
  schemaName: string;
  kind: "string" | "number";
}

/** Excepción documentada para una entrada sin columna VarChar o Decimal. */
interface ValidationParityExclusion {
  schemaName: string;
  path: string;
  reason: string;
}

/**
 * Excepciones deliberadas del mapa de paridad.
 *
 * Solo deben incluir credenciales, tokens, confirmaciones, paginación,
 * UUID, fechas/años de consulta u otros filtros sin columna VarChar/Decimal.
 * Todo campo nuevo debe agregarse aquí con su motivo o al mapa explícito.
 */
/** Crea exclusiones individuales manteniendo un motivo común y explícito. */
const exclude = (schemaName: string, paths: string[], reason: string): ValidationParityExclusion[] => paths.map((path) => ({
  schemaName,
  path,
  reason,
}));

const validationParityExclusions: ValidationParityExclusion[] = [
  ...exclude("src/modules/aguinaldo/aguinaldo.controller.ts#ListSchema", ["take", "skip"], "Paginación, no es una columna persistida."),
  ...exclude("src/modules/auth/auth.controller.ts#changePasswordSchema", ["currentPassword", "newPassword"], "Credenciales de autenticación, no se persisten como columnas de negocio."),
  ...exclude("src/modules/auth/auth.controller.ts#loginSchema", ["password"], "Contraseña de autenticación, no se persiste en claro."),
  ...exclude("src/modules/auth/auth.controller.ts#resetPasswordSchema", ["token", "newPassword"], "Token o contraseña de recuperación, no es una columna VarChar/Decimal de entrada."),
  ...exclude("src/modules/banks/banks.controller.ts#listQuerySchema", ["activeOnly"], "Filtro booleano derivado de isActive, no es VarChar/Decimal."),
  ...exclude("src/modules/cart/cart.controller.ts#upsertSchema", ["productId"], "Identificador UUID, no es VarChar/Decimal."),
  ...exclude("src/modules/contact/contact.controller.ts#listQuerySchema", ["take", "skip"], "Paginación, no es una columna persistida."),
  ...exclude("src/modules/customers/customers.controller.ts#listQuerySchema", ["hasNit", "hasNrc", "take", "skip"], "Filtro booleano derivado o paginación, no es VarChar/Decimal."),
  ...exclude("src/modules/employee-terminations/employee-terminations.controller.ts#ListSchema", ["take", "skip"], "Paginación, no es una columna persistida."),
  ...exclude("src/modules/employees/employee-bank-accounts.controller.ts#updateSchema", ["bankId"], "Identificador UUID, no es VarChar/Decimal."),
  ...exclude("src/modules/employees/employees.controller.ts#listQuerySchema", ["isActive", "departmentId", "canSell", "canCashier", "take", "skip"], "Filtro booleano/UUID o paginación, no es VarChar/Decimal."),
  ...exclude("src/modules/fiscal/fiscal.controller.ts#dteQuerySchema", ["year", "month", "take", "skip"], "Periodo de consulta o paginación, no es VarChar/Decimal."),
  ...exclude("src/modules/fiscal/fiscal.controller.ts#listQuerySchema", ["year", "month"], "Periodo de consulta sobre columnas Int, no es VarChar/Decimal."),
  ...exclude("src/modules/fiscal/fiscal.controller.ts#periodParamsSchema", ["year", "month"], "Parámetros de periodo sobre columnas Int, no es VarChar/Decimal."),
  ...exclude("src/modules/inventory/inventory-counts.controller.ts#linesQuerySchema", ["filter", "take", "skip"], "Filtro calculado o paginación, no es VarChar/Decimal."),
  ...exclude("src/modules/inventory/inventory-counts.controller.ts#listSchema", ["take", "skip"], "Paginación, no es una columna persistida."),
  ...exclude("src/modules/inventory/inventory.controller.ts#alertsQuerySchema", ["resolved", "take", "skip"], "Filtro booleano o paginación, no es VarChar/Decimal."),
  ...exclude("src/modules/inventory/inventory.controller.ts#listQuerySchema", ["productId", "take", "skip"], "Identificador UUID o paginación, no es VarChar/Decimal."),
  ...exclude("src/modules/leave-requests/leave-requests.controller.ts#ListSchema", ["employeeId", "leaveTypeId", "startDateFrom", "startDateTo", "take", "skip"], "Identificador UUID, fecha de consulta o paginación; no es VarChar/Decimal."),
  ...exclude("src/modules/payroll-periods/payroll-periods.controller.ts#ListQuerySchema", ["year"], "Filtro de año sobre columna Int, no es VarChar/Decimal."),
  ...exclude("src/modules/payroll-runs/payroll-runs.controller.ts#ListRunsSchema", ["periodId", "createdBy", "take", "skip"], "Identificador UUID o paginación, no es VarChar/Decimal."),
  ...exclude("src/modules/products/products.controller.ts#listQuerySchema", ["familyId", "subfamilyId", "inStock", "take", "skip"], "Identificador UUID, filtro calculado o paginación, no es VarChar/Decimal."),
  ...exclude("src/modules/public-catalog/public-catalog.controller.ts#listQuerySchema", ["familyId", "subfamilyId", "inStock", "take", "skip", "sort"], "Identificador UUID, filtro calculado, ordenamiento o paginación, no es VarChar/Decimal."),
  ...exclude("src/modules/purchasing/purchase-orders.controller.ts#createSchema", ["lines[].productId"], "Identificador UUID anidado, no es VarChar/Decimal."),
  ...exclude("src/modules/purchasing/purchase-orders.controller.ts#lineSchema", ["productId"], "Identificador UUID, no es VarChar/Decimal."),
  ...exclude("src/modules/purchasing/purchase-orders.controller.ts#listQuerySchema", ["supplierId", "take", "skip"], "Identificador UUID o paginación, no es VarChar/Decimal."),
  ...exclude("src/modules/purchasing/purchase-orders.controller.ts#updateSchema", ["lines[].productId"], "Identificador UUID anidado, no es VarChar/Decimal."),
  ...exclude("src/modules/purchasing/suppliers.controller.ts#listQuerySchema", ["take", "skip", "activeOnly", "withCredit"], "Paginación o filtro booleano derivado, no es VarChar/Decimal."),
  ...exclude("src/modules/shop-auth/shop-auth.controller.ts#changePasswordSchema", ["currentPassword", "newPassword"], "Credenciales de autenticación, no se persisten como columnas de negocio."),
  ...exclude("src/modules/shop-auth/shop-auth.controller.ts#loginSchema", ["password"], "Contraseña de autenticación, no se persiste en claro."),
  ...exclude("src/modules/shop-auth/shop-auth.controller.ts#registerSchema", ["password"], "Contraseña de autenticación, se almacena únicamente como hash."),
  ...exclude("src/modules/shop-auth/shop-auth.controller.ts#resetSchema", ["token", "newPassword"], "Token o contraseña de recuperación, no es una columna VarChar/Decimal de entrada."),
  ...exclude("src/modules/shop-orders/shop-orders.controller.ts#adminListSchema", ["take", "skip"], "Paginación, no es una columna persistida."),
  ...exclude("src/modules/vacation-balances/vacation-balances.controller.ts#EnsureSchema", ["year"], "Año de cálculo, no es columna VarChar/Decimal."),
  ...exclude("src/modules/vacation-balances/vacation-balances.controller.ts#ListSchema", ["year", "employeeId"], "Año o identificador UUID de consulta, no es VarChar/Decimal."),
];

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

/** Recorre una carpeta y obtiene sus controladores HTTP TypeScript. */
function controllerFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return controllerFiles(file);
    return entry.name.endsWith(".controller.ts") ? [file] : [];
  });
}

/** Identifica tipos cuyo límite puede corresponder a una columna Prisma. */
function primitiveKind(schema: ZodTypeAny): "string" | "number" | undefined {
  const typeName = definition(unwrap(schema)).typeName;
  if (typeName === "ZodString" || typeName === "ZodEnum" || typeName === "ZodNativeEnum") return "string";
  if (typeName === "ZodNumber") return "number";
  return undefined;
}

/**
 * Recorre objetos y arreglos de objetos, conservando el esquema propietario
 * para que los contratos reutilizables se registren sin coincidencias por nombre.
 */
function discoverPrimitiveFields(
  schemaName: string,
  currentSchema: ZodTypeAny,
  prefix = "",
): DiscoveredPrimitiveField[] {
  const result: DiscoveredPrimitiveField[] = [];
  for (const [field, fieldSchema] of Object.entries(shape(currentSchema))) {
    const fieldPath = prefix ? `${prefix}.${field}` : field;
    const kind = primitiveKind(fieldSchema);
    if (kind) {
      result.push({ schema: currentSchema, field, path: fieldPath, schemaName, kind });
      continue;
    }

    const fieldDefinition = definition(unwrap(fieldSchema));
    if (fieldDefinition.typeName === "ZodArray" && fieldDefinition.type) {
      result.push(...discoverPrimitiveFields(schemaName, fieldDefinition.type, `${fieldPath}[]`));
    } else if (fieldDefinition.typeName === "ZodObject") {
      result.push(...discoverPrimitiveFields(schemaName, fieldSchema, fieldPath));
    }
  }
  return result;
}

/** Importa todos los esquemas Zod exportados por los controladores. */
async function exportedControllerSchemas(): Promise<Array<{ name: string; schema: ZodTypeAny }>> {
  const files = controllerFiles(path.resolve(process.cwd(), "src/modules"));
  const modules = await Promise.all(files.sort().map(async (file) => ({
    name: path.relative(process.cwd(), file).replaceAll(path.sep, "/"),
    module: await import(pathToFileURL(file).href),
  })));

  return modules.flatMap(({ name, module }) => Object.entries(module)
    .filter(([, value]): value is ZodTypeAny => value instanceof z.ZodType)
    .map(([exportName, schema]) => ({ name: `${name}#${exportName}`, schema })));
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
        expect(schemaField.safeParse(1 + field.step / 10).success).toBe(entry.allowsRounding === true);
      }
      if (entry.operation === "alta" && field.required) {
        expect(schemaField.isOptional(), `${entry.model}.${entry.column} debe ser requerido en alta`).toBe(false);
      }
    }
  });

  it("cubre los campos string y numéricos de todos los esquemas exportados", async () => {
    const schemas = await exportedControllerSchemas();
    expect(schemas.length).toBeGreaterThan(0);
    const discovered = schemas.flatMap(({ name, schema }) => discoverPrimitiveFields(name, schema));
    const exclusions = new Map(validationParityExclusions.map((entry) => [`${entry.schemaName}:${entry.path}`, entry]));
    const uncovered = discovered.filter((entry) => {
      const isMapped = validationParityMap.some(
        (mappedEntry) => mappedEntry.schema === entry.schema && mappedEntry.field === entry.field,
      );
      return !isMapped && !exclusions.has(`${entry.schemaName}:${entry.path}`);
    });

    expect(validationParityExclusions.every((entry) => entry.reason.trim().length > 0)).toBe(true);
    expect(uncovered.map((entry) => `${entry.schemaName}.${entry.path} (${entry.kind})`)).toEqual([]);
  });
});
