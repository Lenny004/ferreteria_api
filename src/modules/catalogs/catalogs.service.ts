import { prisma } from "../../lib/prisma.js";

export const catalogsService = {
  async listDepartments() {
    return prisma.department.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: {
        positions: {
          where: { isActive: true },
          select: { id: true, name: true, isActive: true },
          orderBy: { name: "asc" },
        },
      },
    });
  },

  async listPositions(departmentId?: string) {
    return prisma.position.findMany({
      where: {
        isActive: true,
        ...(departmentId ? { departmentId } : {}),
      },
      orderBy: { name: "asc" },
      include: { department: { select: { id: true, name: true } } },
    });
  },
};
