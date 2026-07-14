import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { BadRequestError, NotFoundError } from "../../shared/errors.js";

const employeePublicSelect = {
  id: true,
  firstName: true,
  lastName: true,
  dui: true,
  nit: true,
  nup: true,
  isssNumber: true,
  positionId: true,
  departmentId: true,
  hireDate: true,
  baseSalary: true,
  contractType: true,
  salaryType: true,
  phone: true,
  email: true,
  canSell: true,
  canCashier: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  position: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
} as const;

export const employeesService = {
  async list(params: { q?: string; isActive?: boolean; take?: number; skip?: number }) {
    const where: Prisma.EmployeeWhereInput = {};
    if (params.isActive !== undefined) where.isActive = params.isActive;
    if (params.q) {
      where.OR = [
        { firstName: { contains: params.q, mode: "insensitive" } },
        { lastName: { contains: params.q, mode: "insensitive" } },
        { dui: { contains: params.q } },
        { email: { contains: params.q, mode: "insensitive" } },
      ];
    }

    const take = Math.min(params.take ?? 50, 200);
    const skip = params.skip ?? 0;

    const [items, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        select: employeePublicSelect,
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        take,
        skip,
      }),
      prisma.employee.count({ where }),
    ]);

    return { items, total, take, skip };
  },

  async getById(id: string) {
    const employee = await prisma.employee.findUnique({
      where: { id },
      select: employeePublicSelect,
    });
    if (!employee) throw new NotFoundError("Empleado no encontrado");
    return employee;
  },

  async create(data: {
    firstName: string;
    lastName: string;
    hireDate: string;
    baseSalary: number;
    dui?: string | null;
    nit?: string | null;
    positionId?: string | null;
    departmentId?: string | null;
    contractType?: string;
    salaryType?: string;
    phone?: string | null;
    email?: string | null;
    canSell?: boolean;
    canCashier?: boolean;
    pin?: string | null;
  }) {
    const pinHash = data.pin ? await bcrypt.hash(data.pin, 12) : undefined;

    const created = await prisma.employee.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        hireDate: new Date(data.hireDate),
        baseSalary: data.baseSalary,
        dui: data.dui ?? undefined,
        nit: data.nit ?? undefined,
        positionId: data.positionId ?? undefined,
        departmentId: data.departmentId ?? undefined,
        contractType: data.contractType ?? "PLAZO_FIJO",
        salaryType: data.salaryType ?? "MENSUAL",
        phone: data.phone ?? undefined,
        email: data.email ?? undefined,
        canSell: data.canSell ?? false,
        canCashier: data.canCashier ?? false,
        pinHash,
        pinUpdatedAt: pinHash ? new Date() : undefined,
      },
      select: employeePublicSelect,
    });

    return created;
  },

  async update(
    id: string,
    data: Partial<{
      firstName: string;
      lastName: string;
      hireDate: string;
      baseSalary: number;
      dui: string | null;
      nit: string | null;
      positionId: string | null;
      departmentId: string | null;
      contractType: string;
      salaryType: string;
      phone: string | null;
      email: string | null;
      canSell: boolean;
      canCashier: boolean;
      isActive: boolean;
      pin: string | null;
    }>,
  ) {
    const existing = await prisma.employee.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Empleado no encontrado");

    let pinHash: string | undefined;
    let pinUpdatedAt: Date | undefined;
    if (data.pin !== undefined) {
      if (data.pin === null || data.pin === "") {
        throw new BadRequestError("El PIN no puede quedar vacío; omita el campo para no cambiarlo");
      }
      pinHash = await bcrypt.hash(data.pin, 12);
      pinUpdatedAt = new Date();
    }

    const { pin: _pin, hireDate, ...rest } = data;

    return prisma.employee.update({
      where: { id },
      data: {
        ...rest,
        hireDate: hireDate ? new Date(hireDate) : undefined,
        pinHash,
        pinUpdatedAt,
        updatedAt: new Date(),
      },
      select: employeePublicSelect,
    });
  },
};
