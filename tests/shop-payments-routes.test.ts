import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createCsrfToken } from "../src/shared/cookies.js";
import { signAccessToken } from "../src/shared/jwt.js";

const adminId = "550e8400-e29b-41d4-a716-446655440000";
const accountantId = "650e8400-e29b-41d4-a716-446655440000";
const shopId = "750e8400-e29b-41d4-a716-446655440000";
const orderId = "850e8400-e29b-41d4-a716-446655440000";
const ownerId = "950e8400-e29b-41d4-a716-446655440000";

const prismaMock = {
  webUser: {
    findUnique: vi.fn(({ where }: { where: { id: string } }) => Promise.resolve({
      isActive: true,
      role: where.id === accountantId ? "ACCOUNTANT" : where.id === ownerId ? "OWNER" : "ADMIN",
      tokenVersion: 0,
    })),
  },
  shopCustomer: { findUnique: vi.fn() },
};
const payOrderMock = vi.fn().mockResolvedValue({ id: orderId, paymentStatus: "PAGADO" });

vi.mock("../src/lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../src/modules/shop-payments/shop-payments.service.js", () => ({
  resolveInitialPayment: vi.fn(),
  shopPaymentsService: { payOrder: payOrderMock },
}));

describe("confirmación manual de pagos de tienda", () => {
  let app: typeof import("../src/app.js").default;

  beforeAll(async () => {
    ({ default: app } = await import("../src/app.js"));
  });

  beforeEach(() => vi.clearAllMocks());

  it("rechaza cliente SHOP y ACCOUNTANT", async () => {
    const shop = await request(app)
      .post(`/api/v1/shop/orders/${orderId}/pay`)
      .set("Authorization", `Bearer ${signAccessToken({ userId: shopId, role: "SHOP", tv: 0 })}`)
      .send({ method: "TRANSFERENCIA" });
    expect(shop.status).toBe(403);

    const shopCookie = await request(app)
      .post(`/api/v1/shop/orders/${orderId}/pay`)
      .set("Cookie", `fer_shop_access=${signAccessToken({ userId: shopId, role: "SHOP", tv: 0 })}`)
      .send({ method: "TRANSFERENCIA" });
    expect(shopCookie.status).toBe(401);

    const accountant = await request(app)
      .post(`/api/v1/shop/orders/${orderId}/pay`)
      .set("Authorization", `Bearer ${signAccessToken({ userId: accountantId, role: "ACCOUNTANT", tv: 0 })}`)
      .send({ method: "TRANSFERENCIA" });
    expect(accountant.status).toBe(403);
  });

  it("permite ADMIN y atribuye la confirmación al usuario del panel", async () => {
    const response = await request(app)
      .post(`/api/v1/shop/orders/${orderId}/pay`)
      .set("Authorization", `Bearer ${signAccessToken({ userId: adminId, role: "ADMIN", tv: 0 })}`)
      .send({ method: "TRANSFERENCIA", providerRef: "TR-1", notes: "Verificado" });
    expect(response.status).toBe(200);
    expect(payOrderMock).toHaveBeenCalledWith(orderId, {
      method: "TRANSFERENCIA",
      providerRef: "TR-1",
      notes: "Verificado",
    }, adminId);
  });

  it("permite OWNER y atribuye el pago al usuario autenticado", async () => {
    const response = await request(app)
      .post(`/api/v1/shop/orders/${orderId}/pay`)
      .set("Authorization", `Bearer ${signAccessToken({ userId: ownerId, role: "OWNER", tv: 0 })}`)
      .send({ method: "TRANSFERENCIA" });
    expect(response.status).toBe(200);
    expect(payOrderMock).toHaveBeenCalledWith(orderId, {
      method: "TRANSFERENCIA",
    }, ownerId);
  });

  it("transporta la referencia y su fecha esperadas al servicio", async () => {
    const expectedCustomerReferenceAt = "2026-01-15T12:00:00.000Z";
    const response = await request(app)
      .post(`/api/v1/shop/orders/${orderId}/pay`)
      .set("Authorization", `Bearer ${signAccessToken({ userId: adminId, role: "ADMIN", tv: 0 })}`)
      .send({ expectedCustomerReference: "REF-A", expectedCustomerReferenceAt });

    expect(response.status).toBe(200);
    expect(payOrderMock).toHaveBeenCalledWith(orderId, {
      expectedCustomerReference: "REF-A",
      expectedCustomerReferenceAt,
    }, adminId);
  });

  it("exige CSRF cuando el panel usa cookie y acepta el token CSRF válido", async () => {
    const token = signAccessToken({ userId: adminId, role: "ADMIN", tv: 0 });
    const csrf = createCsrfToken(adminId, "admin");
    const cookie = [`fer_access=${token}`, `fer_csrf=${csrf}`];

    const missingCsrf = await request(app)
      .post(`/api/v1/shop/orders/${orderId}/pay`)
      .set("Cookie", cookie)
      .send({ method: "TRANSFERENCIA" });
    expect(missingCsrf.status).toBe(403);
    expect(missingCsrf.body.error).toBe("CSRF_INVALID");

    const validCsrf = await request(app)
      .post(`/api/v1/shop/orders/${orderId}/pay`)
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrf)
      .send({ method: "TRANSFERENCIA" });
    expect(validCsrf.status).toBe(200);
  });
});
