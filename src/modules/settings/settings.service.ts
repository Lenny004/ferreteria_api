/**
 * Servicio de configuración clave-valor (pública y administración).
 * Claves legales (`TermsOfService`, etc.) se marcan públicas por defecto al crear.
 */

import { prisma } from "../../lib/prisma.js";
import { NotFoundError } from "../../shared/errors.js";

const LEGAL_KEYS = ["TermsOfService", "PrivacyPolicy", "BusinessName", "ContactEmail"] as const;

export const settingsService = {
  /** Lista ajustes marcados como públicos (tienda y legal). */
  async listPublic() {
    return prisma.setting.findMany({
      where: { isPublic: true },
      select: { key: true, value: true, description: true, updatedAt: true },
      orderBy: { key: "asc" },
    });
  },

  /** Obtiene un ajuste público por clave. */
  async getPublicByKey(key: string) {
    const setting = await prisma.setting.findFirst({
      where: { key, isPublic: true },
      select: { key: true, value: true, description: true, updatedAt: true },
    });
    if (!setting) throw new NotFoundError("Contenido no encontrado");
    return setting;
  },

  /** Lista todos los ajustes para administración (con búsqueda opcional). */
  async listAdmin(params?: { q?: string }) {
    return prisma.setting.findMany({
      where: params?.q
        ? {
            OR: [
              { key: { contains: params.q, mode: "insensitive" } },
              { description: { contains: params.q, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: { key: "asc" },
    });
  },

  /** Crea o actualiza un ajuste por clave. */
  async upsert(
    key: string,
    data: { value: string; description?: string | null; isPublic?: boolean },
  ) {
    return prisma.setting.upsert({
      where: { key },
      create: {
        key,
        value: data.value,
        description: data.description ?? null,
        isPublic: data.isPublic ?? LEGAL_KEYS.includes(key as (typeof LEGAL_KEYS)[number]),
      },
      update: {
        value: data.value,
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.isPublic !== undefined ? { isPublic: data.isPublic } : {}),
        updatedAt: new Date(),
      },
    });
  },
};
