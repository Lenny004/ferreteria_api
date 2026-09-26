import { prisma } from "../../lib/prisma.js";
import { NotFoundError } from "../../shared/errors.js";

export const ACCOUNT_TYPES = ["CUENTA_CORRIENTE", "CUENTA_DE_AHORRO", "CUENTA_SALARIO"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

const bankAccountSelect = {
  id: true,
  employeeId: true,
  bankId: true,
  accountType: true,
  accountNumber: true,
  isPrimary: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  bank: { select: { id: true, name: true, code: true, swift: true, isActive: true } },
} as const;

async function assertEmployeeExists(employeeId: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true },
  });
  if (!employee) throw new NotFoundError("Empleado no encontrado");
}

async function assertBankExists(bankId: string) {
  const bank = await prisma.bank.findUnique({ where: { id: bankId }, select: { id: true } });
  if (!bank) throw new NotFoundError("Banco no encontrado");
}

export const employeeBankAccountsService = {
  async list(employeeId: string) {
    await assertEmployeeExists(employeeId);
    return prisma.employeeBankAccount.findMany({
      where: { employeeId, isActive: true },
      select: bankAccountSelect,
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });
  },

  async create(
    employeeId: string,
    data: {
      bankId: string;
      accountType: AccountType;
      accountNumber: string;
      isPrimary?: boolean;
    },
  ) {
    await assertEmployeeExists(employeeId);
    await assertBankExists(data.bankId);

    const isPrimary = data.isPrimary ?? false;

    return prisma.$transaction(async (tx) => {
      if (isPrimary) {
        await tx.employeeBankAccount.updateMany({
          where: { employeeId, isPrimary: true },
          data: { isPrimary: false, updatedAt: new Date() },
        });
      }

      return tx.employeeBankAccount.create({
        data: {
          employeeId,
          bankId: data.bankId,
          accountType: data.accountType,
          accountNumber: data.accountNumber,
          isPrimary,
        },
        select: bankAccountSelect,
      });
    });
  },

  async update(
    employeeId: string,
    id: string,
    data: Partial<{
      bankId: string;
      accountType: AccountType;
      accountNumber: string;
      isPrimary: boolean;
      isActive: boolean;
    }>,
  ) {
    await assertEmployeeExists(employeeId);

    const existing = await prisma.employeeBankAccount.findFirst({
      where: { id, employeeId },
    });
    if (!existing) throw new NotFoundError("Cuenta bancaria no encontrada");

    if (data.bankId) await assertBankExists(data.bankId);

    return prisma.$transaction(async (tx) => {
      if (data.isPrimary === true) {
        await tx.employeeBankAccount.updateMany({
          where: { employeeId, isPrimary: true, id: { not: id } },
          data: { isPrimary: false, updatedAt: new Date() },
        });
      }

      return tx.employeeBankAccount.update({
        where: { id },
        data: { ...data, updatedAt: new Date() },
        select: bankAccountSelect,
      });
    });
  },
};
