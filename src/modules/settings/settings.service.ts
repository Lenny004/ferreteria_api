/**
 * Servicio de configuración clave-valor (pública y administración).
 * Claves legales (`TermsOfService`, etc.) se marcan públicas por defecto al crear.
 */

import { prisma } from "../../lib/prisma.js";
import { Prisma } from "@prisma/client";
import { BadRequestError, NotFoundError } from "../../shared/errors.js";
import { IVA_RATE_EL_SALVADOR } from "../../shared/tax.js";

const LEGAL_KEYS = ["TermsOfService", "PrivacyPolicy", "BusinessName", "ContactEmail"] as const;
const IVA_PERCENTAGE = IVA_RATE_EL_SALVADOR.mul(100);
const READ_ONLY_IVA_MESSAGE = "IvaPercentage es de solo lectura: el IVA (13 %) se define en código junto con el POS (a verificar con contador)";

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

  /**
   * Crea o actualiza un ajuste por clave; `IvaPercentage` permanece vinculado al IVA del código.
   *
   * @param key - Clave del ajuste.
   * @param data - Valor y metadatos validados del ajuste.
   * @returns Ajuste creado o actualizado.
   * @throws {BadRequestError} Si se intenta cambiar `IvaPercentage` a un valor distinto de 13.
   */
  async upsert(
    key: string,
    data: { value: string; description?: string | null; isPublic?: boolean },
  ) {
    if (key === "IvaPercentage") {
      let requestedValue: Prisma.Decimal;
      try {
        requestedValue = new Prisma.Decimal(data.value);
      } catch {
        throw new BadRequestError(READ_ONLY_IVA_MESSAGE);
      }
      if (!requestedValue.eq(IVA_PERCENTAGE)) {
        throw new BadRequestError(READ_ONLY_IVA_MESSAGE);
      }
    }
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
