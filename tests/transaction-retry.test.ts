import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  $transaction: vi.fn(),
};

vi.mock("../src/lib/prisma.js", () => ({ prisma: prismaMock }));

const { runWithTransactionRetry } = await import("../src/shared/transaction-retry.js");

describe("reintento de transacciones por concurrencia", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    { code: "P2034" },
    { code: "P2010", meta: { code: "40001" } },
    { code: "P2010", meta: { sqlState: "40P01" } },
  ])("reintenta $code/$meta", async (error) => {
    prismaMock.$transaction
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce("ok");

    await expect(runWithTransactionRetry(async () => "ok", { baseDelayMs: 0 })).resolves.toBe("ok");
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
  });

  it("reconoce SQLSTATE en el mensaje y no reintenta errores de negocio", async () => {
    prismaMock.$transaction.mockRejectedValueOnce(new Error("deadlock detected (40P01)"));
    await expect(runWithTransactionRetry(async () => "ok", { baseDelayMs: 0 })).rejects.toThrow("40P01");
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);

    prismaMock.$transaction.mockRejectedValueOnce({ code: "P2002" });
    await expect(runWithTransactionRetry(async () => "ok", { baseDelayMs: 0 })).rejects.toMatchObject({ code: "P2002" });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
  });

  it("se rinde después de tres intentos", async () => {
    const error = { code: "P2034" };
    prismaMock.$transaction.mockRejectedValue(error);

    await expect(runWithTransactionRetry(async () => "ok", { baseDelayMs: 0 })).rejects.toEqual(error);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(3);
  });
});
