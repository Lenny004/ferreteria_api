import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { signAccessToken } from "../src/shared/jwt.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";
const productId = "650e8400-e29b-41d4-a716-446655440000";
const familyId = "750e8400-e29b-41d4-a716-446655440000";
const measurementTypeId = "850e8400-e29b-41d4-a716-446655440000";

const prismaMock = vi.hoisted(() => ({
  webUser: { findUnique: vi.fn() },
}));

vi.mock("../src/lib/prisma.js", () => ({ prisma: prismaMock }));

const serviceMock = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  listFormOptions: vi.fn(),
}));

vi.mock("../src/modules/products/products.service.js", () => ({ productsService: serviceMock }));

/** Firma un token y deja al usuario activo con el rol indicado. */
function tokenFor(role: "ADMIN" | "ACCOUNTANT" | "OWNER"): string {
  prismaMock.webUser.findUnique.mockResolvedValue({ isActive: true, role, tokenVersion: 0 });
  return signAccessToken({ userId, role, tv: 0 });
}

describe("rutas de productos", () => {
  let app: typeof import("../src/app.js").default;

  beforeAll(async () => {
    ({ default: app } = await import("../src/app.js"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    serviceMock.list.mockResolvedValue({ items: [], total: 0, take: 20, skip: 0 });
    serviceMock.listFormOptions.mockResolvedValue({ families: [], measurementTypes: [] });
    serviceMock.create.mockResolvedValue({ id: productId });
    serviceMock.update.mockResolvedValue({ id: productId });
  });

  it("resuelve /options antes de /:id y lo permite al contador", async () => {
    const response = await request(app)
      .get("/api/v1/products/options")
      .set("Authorization", `Bearer ${tokenFor("ACCOUNTANT")}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ families: [], measurementTypes: [] });
    expect(serviceMock.listFormOptions).toHaveBeenCalledTimes(1);
    expect(serviceMock.getById).not.toHaveBeenCalled();
  });

  it("traduce includeInactive=true a booleano", async () => {
    const response = await request(app)
      .get("/api/v1/products?includeInactive=true&take=20")
      .set("Authorization", `Bearer ${tokenFor("ADMIN")}`);

    expect(response.status).toBe(200);
    expect(serviceMock.list).toHaveBeenCalledWith(expect.objectContaining({ includeInactive: true, take: 20 }));
  });

  it("impide al contador crear o editar productos", async () => {
    const token = tokenFor("ACCOUNTANT");
    const createResponse = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: "P-1", description: "Martillo", familyId, measurementTypeId });
    const updateResponse = await request(app)
      .patch(`/api/v1/products/${productId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ description: "Martillo 16 oz" });

    expect(createResponse.status).toBe(403);
    expect(updateResponse.status).toBe(403);
    expect(serviceMock.create).not.toHaveBeenCalled();
    expect(serviceMock.update).not.toHaveBeenCalled();
  });

  it("permite a OWNER crear un producto", async () => {
    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${tokenFor("OWNER")}`)
      .send({ code: "P-1", description: "Martillo", familyId, measurementTypeId, salePrice: 9.5 });

    expect(response.status).toBe(201);
    expect(serviceMock.create).toHaveBeenCalledWith(expect.objectContaining({ code: "P-1", salePrice: 9.5 }));
  });

  it("descarta currentStock en la edición para que el stock solo cambie por movimientos", async () => {
    const response = await request(app)
      .patch(`/api/v1/products/${productId}`)
      .set("Authorization", `Bearer ${tokenFor("ADMIN")}`)
      .send({ description: "Martillo 16 oz", currentStock: 999 });

    expect(response.status).toBe(200);
    expect(serviceMock.update).toHaveBeenCalledWith(productId, { description: "Martillo 16 oz" });
  });
});
