import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { signAccessToken } from "../src/shared/jwt.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";
const orderId = "650e8400-e29b-41d4-a716-446655440000";

const prismaMock = {
  webUser: {
    findUnique: vi.fn().mockResolvedValue({ isActive: true, role: "ADMIN", tokenVersion: 0 }),
  },
};
const updateAdminMock = vi.fn().mockResolvedValue({ id: orderId, status: "CANCELADA" });

vi.mock("../src/lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../src/modules/shop-orders/shop-orders.service.js", () => ({
  shopOrdersService: { updateAdmin: updateAdminMock },
}));

describe("validación HTTP de cancellationNote", () => {
  let app: typeof import("../src/app.js").default;

  beforeAll(async () => {
    ({ default: app } = await import("../src/app.js"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    updateAdminMock.mockResolvedValue({ id: orderId, status: "CANCELADA" });
  });

  it("recorta la nota antes de entregarla al servicio", async () => {
    const response = await request(app)
      .patch(`/api/v1/shop-orders/${orderId}`)
      .set("Authorization", `Bearer ${signAccessToken({ userId, role: "ADMIN", tv: 0 })}`)
      .send({ status: "CANCELADA", cancellationNote: "  Motivo QA  " });

    expect(response.status).toBe(200);
    expect(updateAdminMock).toHaveBeenCalledWith(orderId, {
      status: "CANCELADA",
      cancellationNote: "Motivo QA",
    });
  });

  it("rechaza una nota de 301 caracteres con 400", async () => {
    const response = await request(app)
      .patch(`/api/v1/shop-orders/${orderId}`)
      .set("Authorization", `Bearer ${signAccessToken({ userId, role: "ADMIN", tv: 0 })}`)
      .send({ status: "CANCELADA", cancellationNote: "a".repeat(301) });

    expect(response.status).toBe(400);
    expect(updateAdminMock).not.toHaveBeenCalled();
  });
});
