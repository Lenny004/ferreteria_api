import { prisma } from "../../lib/prisma.js";
import { NotFoundError } from "../../shared/errors.js";

export const documentTypesService = {
  async list() {
    return prisma.requiredDocumentType.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
  },

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
