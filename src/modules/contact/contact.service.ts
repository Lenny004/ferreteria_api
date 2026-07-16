/**
 * Servicio de mensajes del formulario Contáctanos y su gestión admin.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { NotFoundError } from "../../shared/errors.js";

export const contactService = {
  /** Crea mensaje público con estado inicial `NEW`. */
  async create(data: {
    name: string;
    email: string;
    phone?: string | null;
    subject: string;
    message: string;
  }) {
    return prisma.contactMessage.create({
      data: {
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        phone: data.phone?.trim() || null,
        subject: data.subject.trim(),
        message: data.message.trim(),
        status: "NEW",
      },
    });
  },

  /** Lista mensajes para admin con filtros de estado y búsqueda. */
  async list(params: { status?: string; q?: string; take?: number; skip?: number }) {
    const where: Prisma.ContactMessageWhereInput = {};
    if (params.status) where.status = params.status;
    if (params.q) {
      where.OR = [
        { name: { contains: params.q, mode: "insensitive" } },
        { email: { contains: params.q, mode: "insensitive" } },
        { subject: { contains: params.q, mode: "insensitive" } },
        { message: { contains: params.q, mode: "insensitive" } },
      ];
    }
    const take = Math.min(params.take ?? 50, 200);
    const skip = params.skip ?? 0;
    const [items, total] = await Promise.all([
      prisma.contactMessage.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.contactMessage.count({ where }),
    ]);
    return { items, total, take, skip };
  },

  /** Obtiene un mensaje por ID. */
  async getById(id: string) {
    const item = await prisma.contactMessage.findUnique({ where: { id } });
    if (!item) throw new NotFoundError("Mensaje de contacto no encontrado");
    return item;
  },

  /** Actualiza estado o notas internas del mensaje. */
  async update(
    id: string,
    data: Partial<{ status: string; adminNotes: string | null }>,
  ) {
    await this.getById(id);
    return prisma.contactMessage.update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
    });
  },
};
