import { describe, expect, it } from "vitest";
import { parsePaginationQuery, parseUuidParam } from "../src/shared/validation.js";

describe("validación compartida", () => {
  it("acota y aplica la paginación", () => {
    expect(parsePaginationQuery({ page: "2", pageSize: "50" })).toEqual({ page: 2, pageSize: 50 });
    expect(() => parsePaginationQuery({ pageSize: 101 })).toThrow();
  });

  it("solo acepta UUID en :id", () => {
    expect(parseUuidParam({ id: "550e8400-e29b-41d4-a716-446655440000" }).id).toContain("550e8400");
    expect(() => parseUuidParam({ id: "1" })).toThrow();
  });
});
