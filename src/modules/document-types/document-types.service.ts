/**
 * Servicio de tipos de documento requeridos para expedientes de empleados (RRHH).
 */

import { prisma } from "../../lib/prisma.js";
import { NotFoundError } from "../../shared/errors.js";

export const documentTypesService = {
  /** Lista tipos de documento activos. */
  async list() {
    return prisma.requiredDocumentType.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
  },

  /** Crea tipo de documento requerido. */
  async create(data: {
    name: string;
    description?: string | null;
    isMandatory?: boolean;
    appliesToContractType?: string | null;
    hasExpiry?: boolean;
  }) {
    return prisma.requiredDocumentType.create({
      data: {
        name: data.name,
        description: data.description ?? undefined,
        isMandatory: data.isMandatory ?? true,
        appliesToContractType: data.appliesToContractType ?? undefined,
        hasExpiry: data.hasExpiry ?? false,
      },
    });
  },

  /** Actualiza tipo de documento o su estado activo. */
  async update(
    id: string,
    data: Partial<{
      name: string;
      description: string | null;
      isMandatory: boolean;
      appliesToContractType: string | null;
      hasExpiry: boolean;
      isActive: boolean;
    }>,
  ) {
    const existing = await prisma.requiredDocumentType.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Tipo de documento no encontrado");
    return prisma.requiredDocumentType.update({ where: { id }, data });
  },
};
