import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  setting: { upsert: vi.fn() },
};

vi.mock("../src/lib/prisma.js", () => ({ prisma: prismaMock }));

const { settingsService } = await import("../src/modules/settings/settings.service.js");

describe("IvaPercentage de solo lectura", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["13", "13.0", "13.00"])("acepta el valor legal %s", async (value) => {
    prismaMock.setting.upsert.mockResolvedValue({ key: "IvaPercentage", value });

    await expect(settingsService.upsert("IvaPercentage", { value })).resolves.toEqual({
      key: "IvaPercentage",
      value,
    });
    expect(prismaMock.setting.upsert).toHaveBeenCalledTimes(1);
  });

  it.each(["12", "13.01", "texto"])("rechaza el valor %s sin persistirlo", async (value) => {
    await expect(settingsService.upsert("IvaPercentage", { value })).rejects.toMatchObject({
      statusCode: 400,
      message: "IvaPercentage es de solo lectura: el IVA (13 %) se define en código junto con el POS (a verificar con contador)",
    });
    expect(prismaMock.setting.upsert).not.toHaveBeenCalled();
  });
});
