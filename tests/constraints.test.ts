import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parsePrismaConstraints } from "../scripts/generate-constraints.js";
import { loadEnv } from "../src/config/env.js";

const root = path.resolve(process.cwd());

describe("contrato de restricciones Prisma", () => {
  it("mantiene generado/constraints.json sincronizado con Prisma", () => {
    const source = readFileSync(path.join(root, "prisma", "schema.prisma"), "utf8");
    const generated = JSON.parse(readFileSync(path.join(root, "generated", "constraints.json"), "utf8"));

    expect(generated).toEqual(parsePrismaConstraints(source));
  });

  it("incluye todos los campos Prisma con VarChar", () => {
    const source = readFileSync(path.join(root, "prisma", "schema.prisma"), "utf8");
    const document = parsePrismaConstraints(source);
    const varCharFields = Object.values(document.models).flatMap((model) =>
      Object.entries(model.fields).filter(([, field]) => field.maxLength !== undefined),
    );

    expect(varCharFields.length).toBe((source.match(/@db\.VarChar\(/g) ?? []).length);
    for (const [, field] of varCharFields) expect(field.maxLength).toBeGreaterThan(0);
  });
});

describe("variables opcionales de entorno", () => {
  it("trata COOKIE_DOMAIN vacío como no definido", () => {
    const env = loadEnv({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
      JWT_SECRET: "x".repeat(40),
      CORS_ORIGIN: "http://localhost:3000",
      COOKIE_DOMAIN: "",
    });

    expect(env.COOKIE_DOMAIN).toBeUndefined();
  });
});
