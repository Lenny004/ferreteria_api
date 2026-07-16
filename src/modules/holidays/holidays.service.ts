/**
 * Servicio de días feriados para planilla y asistencia.
 */

import { prisma } from "../../lib/prisma.js";
import { NotFoundError } from "../../shared/errors.js";

const holidaySelect = {
  id: true,
  name: true,
  date: true,
  year: true,
  isMandatory: true,
  isActive: true,
  createdAt: true,
} as const;

export const holidaysService = {
  /** Lista feriados activos de un año calendario. */
  async list(year: number) {
    return prisma.holiday.findMany({
      where: { year, isActive: true },
      select: holidaySelect,
      orderBy: { date: "asc" },
    });
  },

  /** Crea feriado para un año. */
  async create(data: {
    name: string;
    date: string;
    year: number;
    isMandatory?: boolean;
  }) {
    return prisma.holiday.create({
      data: {
        name: data.name,
        date: new Date(data.date),
        year: data.year,
        isMandatory: data.isMandatory ?? true,
      },
      select: holidaySelect,
    });
  },

  /** Actualiza feriado o lo desactiva. */
  async update(
    id: string,
    data: Partial<{
      name: string;
      date: string;
      year: number;
      isMandatory: boolean;
      isActive: boolean;
    }>,
  ) {
    const existing = await prisma.holiday.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Día feriado no encontrado");

    return prisma.holiday.update({
      where: { id },
      data: {
        ...data,
        date: data.date ? new Date(data.date) : undefined,
      },
      select: holidaySelect,
    });
  },
};
