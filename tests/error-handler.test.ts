import { describe, expect, it } from "vitest";
import { ZodError, z } from "zod";
import { errorHandler } from "../src/middleware/error-handler.js";

function response() {
  return { statusCode: 200, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { return body; } } as never;
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
});
