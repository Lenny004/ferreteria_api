import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Restricciones de un campo scalar o relacional del modelo Prisma. */
export interface FieldConstraint {
  type: string;
  map?: string;
  maxLength?: number;
  precision?: number;
  scale?: number;
  step?: number;
  max?: number;
  required: boolean;
  nullable: boolean;
  unique: boolean;
  hasDefault: boolean;
}

/** Restricciones y metadatos físicos de un modelo Prisma. */
export interface ModelConstraints {
  map?: string;
  schema?: string;
  fields: Record<string, FieldConstraint>;
}

/** Documento versionado que consumen las pruebas de paridad y adminweb. */
export interface ConstraintsDocument {
  version: 1;
  source: "prisma/schema.prisma";
  models: Record<string, ModelConstraints>;
}

const MODEL_PATTERN = /^model\s+(\w+)\s*\{/;
const FIELD_PATTERN = /^\s{2}(\w+)\s+([\w]+)(\?)?(\[\])?\s*(.*)$/;
const DB_VAR_CHAR_PATTERN = /@db\.VarChar\((\d+)\)/;
const DB_DECIMAL_PATTERN = /@db\.Decimal\((\d+)\s*,\s*(\d+)\)/;
const MAP_PATTERN = /@map\("([^"]+)"\)/;
const MODEL_MAP_PATTERN = /@@map\("([^"]+)"\)/;
const SCHEMA_PATTERN = /@@schema\("([^"]+)"\)/;

/**
 * Obtiene los límites decimales sin depender de potencias negativas de punto flotante.
 *
 * @param precision - Cantidad total de dígitos permitidos.
 * @param scale - Cantidad de dígitos permitidos después del separador decimal.
 * @returns Paso mínimo y máximo representables por la columna decimal.
 */
function decimalBounds(precision: number, scale: number): { step: number; max: number } {
  const integerDigits = precision - scale;
  const fractionalPart = "9".repeat(scale);
  const maxText = `${"9".repeat(integerDigits)}${scale > 0 ? `.${fractionalPart}` : ""}`;

  return {
    step: Number(`1e-${scale}`),
    max: Number(maxText),
  };
}

/**
 * Convierte el schema Prisma en restricciones deterministas sin conectarse a la BD.
 *
 * @param source - Contenido completo de `prisma/schema.prisma`.
 * @returns Documento serializable con los límites de cada modelo y campo.
 */
export function parsePrismaConstraints(source: string): ConstraintsDocument {
  const models: Record<string, ModelConstraints> = {};
  let currentModel: string | undefined;
  const compoundUniqueFields = new Map<string, Set<string>>();

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const modelMatch = line.match(MODEL_PATTERN);
    if (modelMatch) {
      currentModel = modelMatch[1];
      models[currentModel] = { fields: {} };
      continue;
    }
    if (!currentModel) continue;
    if (line === "}") {
      currentModel = undefined;
      continue;
    }

    const model = models[currentModel];
    const modelMap = line.match(MODEL_MAP_PATTERN)?.[1];
    const schema = line.match(SCHEMA_PATTERN)?.[1];
    if (modelMap) model.map = modelMap;
    if (schema) model.schema = schema;

    const uniqueMatch = line.match(/@@unique\(\[([^\]]+)\]/);
    if (uniqueMatch) {
      const fields = uniqueMatch[1].split(",").map((field) => field.trim()).filter(Boolean);
      const key = `${currentModel}:${fields.join(",")}`;
      compoundUniqueFields.set(key, new Set(fields));
      continue;
    }

    const fieldMatch = line.match(FIELD_PATTERN);
    if (!fieldMatch || line.includes("@relation")) continue;

    const [, name, baseType, optionalMarker, listMarker, attributes] = fieldMatch;
    const nullable = Boolean(optionalMarker);
    const hasDefault = attributes.includes("@default(");
    const isArray = Boolean(listMarker);
    const varChar = attributes.match(DB_VAR_CHAR_PATTERN);
    const decimal = attributes.match(DB_DECIMAL_PATTERN);
    const decimalLimits = decimal ? decimalBounds(Number(decimal[1]), Number(decimal[2])) : undefined;
    const field: FieldConstraint = {
      type: `${baseType}${isArray ? "[]" : ""}`,
      ...(attributes.match(MAP_PATTERN)?.[1] ? { map: attributes.match(MAP_PATTERN)?.[1] } : {}),
      ...(varChar ? { maxLength: Number(varChar[1]) } : {}),
      ...(decimal
        ? {
            precision: Number(decimal[1]),
            scale: Number(decimal[2]),
            step: decimalLimits.step,
            max: decimalLimits.max,
          }
        : {}),
      required: !nullable && !hasDefault && !isArray,
      nullable,
      unique: attributes.includes("@unique") || attributes.includes("@id"),
      hasDefault,
    };
    model.fields[name] = field;
  }

  for (const [key, fields] of compoundUniqueFields) {
    const modelName = key.split(":", 1)[0];
    for (const fieldName of fields) {
      if (models[modelName]?.fields[fieldName]) models[modelName].fields[fieldName].unique = true;
    }
  }

  return { version: 1, source: "prisma/schema.prisma", models };
}

/**
 * Genera `generated/constraints.json` desde el schema Prisma del repositorio.
 *
 * @returns Promesa resuelta cuando el archivo versionado fue escrito.
 */
export async function generateConstraints(): Promise<void> {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const schemaPath = path.join(projectRoot, "prisma", "schema.prisma");
  const outputPath = path.join(projectRoot, "generated", "constraints.json");
  const source = await readFile(schemaPath, "utf8");
  const document = parsePrismaConstraints(source);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

const entryPoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entryPoint) await generateConstraints();
