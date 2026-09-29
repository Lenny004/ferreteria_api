import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { signAccessToken } from "../src/shared/jwt.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";
const countId = "750e8400-e29b-41d4-a716-446655440000";

const serviceMock = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  getById: vi.fn(),
  listLines: vi.fn(),
  captureLines: vi.fn(),
  apply: vi.fn(),
  cancel: vi.fn(),
  exportXlsx: vi.fn(),
}));

vi.mock("../src/modules/inventory/inventory-counts.service.js", () => ({ inventoryCountsService: serviceMock }));

describe("rutas de conteos físicos", () => {
  let app: typeof import("../src/app.js").default;

  beforeAll(async () => {
    ({ default: app } = await import("../src/app.js"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    serviceMock.list.mockResolvedValue({ items: [], total: 0, take: 50, skip: 0 });
    serviceMock.create.mockResolvedValue({ id: countId });
    serviceMock.apply.mockResolvedValue({ id: countId, status: "APLICADO" });
    serviceMock.exportXlsx.mockResolvedValue({ buffer: Buffer.from("PK-test"), folio: 12 });
  });

  it("permite a ADMIN crear, aplicar y exportar", async () => {
    const token = signAccessToken({ userId, role: "ADMIN" });
    const createResponse = await request(app)
      .post("/api/v1/inventory/counts")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Conteo semanal", familyId: userId });
    const applyResponse = await request(app)
      .post(`/api/v1/inventory/counts/${countId}/apply`)
      .set("Authorization", `Bearer ${token}`)
      .send({ confirm: true });
    const exportResponse = await request(app)
      .get(`/api/v1/inventory/counts/${countId}/export`)
      .set("Authorization", `Bearer ${token}`);

    expect(createResponse.status).toBe(201);
    expect(applyResponse.status).toBe(200);
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers["content-type"]).toMatch(/^application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
    expect(exportResponse.headers["content-disposition"]).toContain('attachment; filename="conteo-12.xlsx"');
    expect(serviceMock.exportXlsx).toHaveBeenCalledWith(countId);
  });

  it("devuelve 400 para UUID, confirmación y tamaños de lote inválidos", async () => {
    const token = signAccessToken({ userId, role: "ADMIN" });
    const invalidId = await request(app)
      .get("/api/v1/inventory/counts/no-es-uuid")
      .set("Authorization", `Bearer ${token}`);
    const invalidConfirm = await request(app)
      .post(`/api/v1/inventory/counts/${countId}/apply`)
      .set("Authorization", `Bearer ${token}`)
      .send({ confirm: false });
    const emptyItems = await request(app)
      .patch(`/api/v1/inventory/counts/${countId}/lines`)
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [] });
    const tooManyItems = await request(app)
      .patch(`/api/v1/inventory/counts/${countId}/lines`)
      .set("Authorization", `Bearer ${token}`)
      .send({ items: Array.from({ length: 501 }, () => ({ productId: userId, countedQuantity: 1 })) });

    expect(invalidId.status).toBe(400);
    expect(invalidConfirm.status).toBe(400);
    expect(emptyItems.status).toBe(400);
    expect(tooManyItems.status).toBe(400);
  });

  it("bloquea a ACCOUNTANT en cada mutación", async () => {
    const token = signAccessToken({ userId, role: "ACCOUNTANT" });
    const headers = { Authorization: `Bearer ${token}` };
    const responses = await Promise.all([
      request(app).post("/api/v1/inventory/counts").set(headers).send({ name: "x", familyId: userId }),
      request(app).patch(`/api/v1/inventory/counts/${countId}/lines`).set(headers).send({ items: [] }),
      request(app).post(`/api/v1/inventory/counts/${countId}/apply`).set(headers).send({ confirm: true }),
      request(app).post(`/api/v1/inventory/counts/${countId}/cancel`).set(headers).send({}),
    ]);

    expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403]);
  });

  it("devuelve 401 sin token y 403 para cookie admin sin CSRF", async () => {
    const noToken = await request(app).get("/api/v1/inventory/counts");
    const token = signAccessToken({ userId, role: "ADMIN" });
    const missingCsrf = await request(app)
      .post("/api/v1/inventory/counts")
      .set("Cookie", `fer_access=${token}`)
      .send({ name: "x", familyId: userId });

    expect(noToken.status).toBe(401);
    expect(missingCsrf.status).toBe(403);
  });
});
