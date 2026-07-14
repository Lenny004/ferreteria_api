import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { NotFoundError } from "../../shared/errors.js";

const productInclude = {
  family: { select: { id: true, code: true, name: true } },
  subfamily: { select: { id: true, name: true } },
  measurementType: { select: { id: true, code: true, name: true, unitLabel: true } },
} as const;

export const productsService = {
  async list(params: { q?: string; take?: number; skip?: number }) {
    const where: Prisma.ProductWhereInput = { isActive: true };
    if (params.q) {
      where.OR = [
        { code: { contains: params.q, mode: "insensitive" } },
        { description: { contains: params.q, mode: "insensitive" } },
        { barcode: { contains: params.q } },
      ];
    }
    const take = Math.min(params.take ?? 50, 200);
    const skip = params.skip ?? 0;
    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: { code: "asc" },
        take,
        skip,
      }),
      prisma.product.count({ where }),
    ]);
    return { items, total, take, skip };
  },

  async getById(id: string) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });
    if (!product) throw new NotFoundError("Producto no encontrado");
    return product;
  },

  async create(data: {
    code: string;
    description: string;
    familyId: string;
    measurementTypeId: string;
    subfamilyId?: string | null;
    barcode?: string | null;
    salePrice?: number;
    costPrice?: number;
    currentStock?: number;
    minStock?: number;
    notes?: string | null;
  }) {
    return prisma.product.create({
      data: {
        code: data.code,
        description: data.description,
        familyId: data.familyId,
        measurementTypeId: data.measurementTypeId,
        subfamilyId: data.subfamilyId ?? undefined,
        barcode: data.barcode ?? undefined,
        salePrice: data.salePrice ?? 0,
        costPrice: data.costPrice ?? 0,
        currentStock: data.currentStock ?? 0,
        minStock: data.minStock ?? 0,
        notes: data.notes ?? undefined,
      },
      include: productInclude,
    });
  },

  async update(
    id: string,
    data: Partial<{
      code: string;
      description: string;
      familyId: string;
      measurementTypeId: string;
      subfamilyId: string | null;
      barcode: string | null;
      salePrice: number;
      costPrice: number;
      minStock: number;
      maxStock: number | null;
      reorderPoint: number | null;
      notes: string | null;
      isActive: boolean;
    }>,
  ) {
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Producto no encontrado");
    return prisma.product.update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
      include: productInclude,
    });
  },
};
