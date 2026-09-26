import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { NotFoundError } from "../../shared/errors.js";

export const suppliersService = {
  async list(params: { q?: string; take?: number; skip?: number; activeOnly?: boolean }) {
    const where: Prisma.SupplierWhereInput = {};
    if (params.activeOnly !== false) where.isActive = true;
    if (params.q) {
      where.OR = [
        { name: { contains: params.q, mode: "insensitive" } },
        { tradeName: { contains: params.q, mode: "insensitive" } },
        { nit: { contains: params.q } },
        { nrc: { contains: params.q } },
        { contactName: { contains: params.q, mode: "insensitive" } },
      ];
    }
    const take = Math.min(params.take ?? 50, 200);
    const skip = params.skip ?? 0;
    const [items, total] = await Promise.all([
      prisma.supplier.findMany({ where, orderBy: { name: "asc" }, take, skip }),
      prisma.supplier.count({ where }),
    ]);
    return { items, total, take, skip };
  },

  async getById(id: string) {
    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundError("Proveedor no encontrado");
    return supplier;
  },

  async create(data: {
    name: string;
    tradeName?: string | null;
    nit?: string | null;
    nrc?: string | null;
    contactName?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    municipality?: string | null;
    department?: string | null;
    country?: string;
    creditDays?: number;
    notes?: string | null;
  }) {
    return prisma.supplier.create({
      data: {
        name: data.name,
        tradeName: data.tradeName ?? undefined,
        nit: data.nit ?? undefined,
        nrc: data.nrc ?? undefined,
        contactName: data.contactName ?? undefined,
        phone: data.phone ?? undefined,
        email: data.email ?? undefined,
        address: data.address ?? undefined,
        municipality: data.municipality ?? undefined,
        department: data.department ?? undefined,
        country: data.country ?? "SV",
        creditDays: data.creditDays ?? 0,
        notes: data.notes ?? undefined,
      },
    });
  },

  async update(
    id: string,
    data: Partial<{
      name: string;
      tradeName: string | null;
      nit: string | null;
      nrc: string | null;
      contactName: string | null;
      phone: string | null;
      email: string | null;
      address: string | null;
      municipality: string | null;
      department: string | null;
      country: string;
      creditDays: number;
      notes: string | null;
      isActive: boolean;
    }>,
  ) {
    const existing = await prisma.supplier.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Proveedor no encontrado");
    return prisma.supplier.update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
    });
  },
};
