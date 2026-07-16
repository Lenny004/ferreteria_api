/**
 * CRUD de clientes (`sales.Customers`) para facturación y punto de venta.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { NotFoundError } from "../../shared/errors.js";

export const customersService = {
  /** Lista clientes activos con paginación; `take` máximo 200. */
  async list(params: {
    q?: string;
    customerType?: string;
    hasNit?: boolean;
    hasNrc?: boolean;
    take?: number;
    skip?: number;
  }) {
    const where: Prisma.CustomerWhereInput = { isActive: true };
    if (params.customerType) where.customerType = params.customerType;
    if (params.hasNit) where.nit = { not: null };
    if (params.hasNrc) where.nrc = { not: null };
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

  /**
   * Obtiene un cliente por id.
   *
   * @throws {NotFoundError} Si no existe.
   */
  async getById(id: string) {
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundError("Cliente no encontrado");
    return customer;
  },

  /** Crea un cliente; `customerType` por defecto `CF`. */
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

  /**
   * Actualización parcial de un cliente.
   *
   * @throws {NotFoundError} Si no existe.
   */
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
