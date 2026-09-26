import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { jsonSuccess } from "../../shared/api-response.js";
import {
  ACCOUNT_TYPES,
  employeeBankAccountsService,
} from "./employee-bank-accounts.service.js";

const employeeIdParamSchema = z.object({
  employeeId: z.string().uuid(),
});

const idParamSchema = z.object({
  employeeId: z.string().uuid(),
  id: z.string().uuid(),
});

const createSchema = z.object({
  bankId: z.string().uuid(),
  accountType: z.enum(ACCOUNT_TYPES),
  accountNumber: z.string().min(1).max(40),
  isPrimary: z.boolean().optional(),
});

const updateSchema = createSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { employeeId } = employeeIdParamSchema.parse(req.params);
    const items = await employeeBankAccountsService.list(employeeId);
    jsonSuccess(res, items);
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const { employeeId } = employeeIdParamSchema.parse(req.params);
    const body = createSchema.parse(req.body);
    const account = await employeeBankAccountsService.create(employeeId, body);
    jsonSuccess(res, account, 201);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const { employeeId, id } = idParamSchema.parse(req.params);
    const body = updateSchema.parse(req.body);
    const account = await employeeBankAccountsService.update(employeeId, id, body);
    jsonSuccess(res, account);
  } catch (err) {
    next(err);
  }
}
