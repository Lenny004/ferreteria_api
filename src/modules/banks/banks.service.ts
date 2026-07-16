/**
 * Catálogo de bancos (`hr.Banks`) usado en cuentas de empleados y pagos.
 */
import { prisma } from "../../lib/prisma.js";
import { NotFoundError } from "../../shared/errors.js";

export const banksService = {
  /** Lista bancos ordenados por nombre; `activeOnly` true por defecto. */
  async list(params?: { activeOnly?: boolean }) {
    const activeOnly = params?.activeOnly ?? true;
    return prisma.bank.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { name: "asc" },
    });
  },

  /** Crea un banco en el catálogo. */
  async create(data: { name: string; code?: string | null; swift?: string | null }) {
    return prisma.bank.create({
      data: {
        name: data.name,
        code: data.code ?? undefined,
        swift: data.swift ?? undefined,
      },
    });
  },

  /**
   * Actualización parcial de un banco.
   *
   * @throws {NotFoundError} Si no existe.
   */
  async update(
    id: string,
    data: Partial<{ name: string; code: string | null; swift: string | null; isActive: boolean }>,
  ) {
    const existing = await prisma.bank.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Banco no encontrado");
    return prisma.bank.update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
    });
  },
};
