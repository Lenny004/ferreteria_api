import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { NotFoundError } from "../../shared/errors.js";

export const customersService = {
  async list(params: { q?: string; take?: number; skip?: number }) {
    const where: Prisma.CustomerWhereInput = { isActive: true };
    if (params.q) {
      where.OR = [
        { name: { contains: params.q, mode: "insensitive" } },
        { nit: { contains: params.q } },
        { nrc: { contains: params.q } },
        { dui: { contains: params.q } },
      ];
    }
    const take = Math.min(params.take ?? 50, 200);
    const skip = params.skip ?? 0;
    const [items, total] = await Promise.all([
      prisma.customer.findMany({ where, orderBy: { name: "asc" }, take, skip }),
      prisma.customer.count({ where }),
    ]);
    return { items, total, take, skip };
  },

  async getById(id: string) {
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundError("Cliente no encontrado");
    return customer;
  },

  async create(data: {
    name: string;
    customerType?: string;
    dui?: string | null;
    nit?: string | null;
    nrc?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    municipality?: string | null;
    department?: string | null;
  }) {
    return prisma.customer.create({
      data: {
        name: data.name,
        customerType: data.customerType ?? "CF",
        dui: data.dui ?? undefined,
        nit: data.nit ?? undefined,
        nrc: data.nrc ?? undefined,
        phone: data.phone ?? undefined,
        email: data.email ?? undefined,
        address: data.address ?? undefined,
        municipality: data.municipality ?? undefined,
        department: data.department ?? undefined,
      },
    });
  },

  async update(
    id: string,
    data: Partial<{
      name: string;
      customerType: string;
      dui: string | null;
      nit: string | null;
      nrc: string | null;
      phone: string | null;
      email: string | null;
      address: string | null;
      municipality: string | null;
      department: string | null;
      isActive: boolean;
    }>,
  ) {
    const existing = await prisma.customer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Cliente no encontrado");
    return prisma.customer.update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
    });
  },
};
