import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { ZodError, z } from "zod";
import { errorHandler } from "../src/middleware/error-handler.js";

function response() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return body; },
  } as never;
}

describe("errorHandler", () => {
  it("serializa errores Zod como 400", () => {
    const res = response();
    errorHandler(new ZodError(z.string().safeParse(1).error?.issues ?? []), {} as never, res, (() => undefined) as never);
    expect(res.statusCode).toBe(400);
  });

  it("no expone detalles de errores desconocidos", () => {
    const res = response();
    errorHandler(new Error("secreto"), {} as never, res, (() => undefined) as never);
    expect(res.statusCode).toBe(500);
  });

  it("mapea P2002 con los campos de la restricción única", () => {
    const res = response();
    const error = new Prisma.PrismaClientKnownRequestError("SQL secreto", {
      code: "P2002",
      clientVersion: "6.19.3",
      meta: { target: ["email", "username"] },
    });
    errorHandler(error, {} as never, res, (() => undefined) as never);
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual(expect.objectContaining({
      error: "CONFLICT",
      message: "Ya existe un registro con el mismo valor en: email, username",
    }));
    expect(JSON.stringify(res.body)).not.toContain("SQL secreto");
  });

  it("mapea P2025 y P2003 según el método HTTP", () => {
    const notFound = new Prisma.PrismaClientKnownRequestError("internal", {
      code: "P2025",
      clientVersion: "6.19.3",
    });
    const foreignKey = new Prisma.PrismaClientKnownRequestError("internal", {
      code: "P2003",
      clientVersion: "6.19.3",
      meta: { field_name: "secret_fk" },
    });
    const notFoundResponse = response();
    errorHandler(notFound, {} as never, notFoundResponse, (() => undefined) as never);
    expect(notFoundResponse.statusCode).toBe(404);
    expect(notFoundResponse.body).toEqual(expect.objectContaining({ error: "NOT_FOUND" }));

    const deleteResponse = response();
    errorHandler(foreignKey, { method: "DELETE" } as never, deleteResponse, (() => undefined) as never);
    expect(deleteResponse.statusCode).toBe(409);
    expect(deleteResponse.body).toEqual(expect.objectContaining({ error: "FOREIGN_KEY_CONFLICT" }));

    const createResponse = response();
    errorHandler(foreignKey, { method: "POST" } as never, createResponse, (() => undefined) as never);
    expect(createResponse.statusCode).toBe(400);
    expect(createResponse.body).toEqual(expect.objectContaining({ error: "INVALID_REFERENCE" }));
    expect(JSON.stringify(createResponse.body)).not.toContain("secret_fk");
  });
});
