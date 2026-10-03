/**
 * Servicio de conteos físicos: alcance, captura, aplicación, cancelación y exportación.
 * Las operaciones que cambian stock se ejecutan en transacciones Prisma.
 */
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../shared/errors.js";
import { syncStockAlert } from "./inventory.service.js";
import {
  buildCountReason,
  buildInventoryCountSummary,
  calculateStockAfter,
  calculateVariance,
  normalizeCountedQuantity,
  toInventoryDecimal,
  type DecimalValue,
  type InventoryCountSummary,
} from "./inventory-counts.logic.js";

const countLineProductSelect = {
  id: true,
  code: true,
  description: true,
  currentStock: true,
  minStock: true,
  costPrice: true,
  measurementType: { select: { unitLabel: true, decimals: true } },
} as const;

const countDetailInclude = {
  lines: {
    include: { product: { select: countLineProductSelect } },
    orderBy: { product: { code: "asc" } },
  },
} as const;

/**
 * Permite hasta 60 s porque un conteo de una familia puede insertar o actualizar
 * miles de líneas y movimientos en una sola transacción administrativa.
 */
const INVENTORY_COUNT_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 60_000 };

type CountDetail = Prisma.InventoryCountGetPayload<{ include: typeof countDetailInclude }>;
type CountLineDetail = CountDetail["lines"][number];

/** Parámetros para crear un conteo y tomar la foto inicial del stock. */
export interface CreateInventoryCountInput {
  name: string;
  familyId?: string;
  subfamilyId?: string;
  productIds?: string[];
  includeInactive?: boolean;
  notes?: string | null;
  webUserId: string;
}

/** Parámetros de una captura de cantidad por producto. */
export interface CaptureInventoryCountItem {
  productId: string;
  countedQuantity: DecimalValue;
  notes?: string | null;
}

/** Entrada de aplicación de un conteo. */
export interface ApplyInventoryCountInput {
  confirm: boolean;
  webUserId: string;
}

/** Filtros de listado de conteos. */
export interface ListInventoryCountsParams {
  status?: string;
  take?: number;
  skip?: number;
}

/** Filtros de líneas de un conteo. */
export interface ListInventoryCountLinesParams {
  q?: string;
  filter?: "all" | "pending" | "counted" | "variance";
  take?: number;
  skip?: number;
}

function summaryFromLines(lines: CountLineDetail[]): InventoryCountSummary {
  return buildInventoryCountSummary(
    lines.map((line) => ({
      countedQuantity: line.countedQuantity,
      systemStockAtCount: line.systemStockAtCount,
      varianceQuantity: line.varianceQuantity,
      costPrice: line.unitCostAtApply ?? line.product.costPrice,
    })),
  );
}

function countLineOutput(line: CountLineDetail) {
  const variance =
    line.countedQuantity !== null && line.systemStockAtCount !== null
      ? calculateVariance(line.countedQuantity, line.systemStockAtCount)
      : null;
  const cost = line.unitCostAtApply ?? line.product.costPrice;
  return {
    ...line,
    varianceQuantity: line.varianceQuantity ?? variance,
    varianceValue: variance === null ? null : variance.mul(cost).toDecimalPlaces(2),
    product: {
      id: line.product.id,
      code: line.product.code,
      description: line.product.description,
      unit: line.product.measurementType.unitLabel,
      decimals: line.product.measurementType.decimals,
      currentStock: line.product.currentStock,
      costPrice: line.product.costPrice,
    },
  };
}

function assertBatchSize(items: CaptureInventoryCountItem[]): void {
  if (items.length < 1 || items.length > 500) {
    throw new BadRequestError("El lote debe contener entre 1 y 500 líneas");
  }
  const productIds = items.map((item) => item.productId);
  if (new Set(productIds).size !== productIds.length) {
    throw new BadRequestError("No se puede repetir un producto en el mismo lote");
  }
}

/** Los parámetros llegan como `text`; se castean a `uuid` para comparar con la PK (evita 42883). */
async function lockCount(tx: Prisma.TransactionClient, countId: string): Promise<void> {
  await tx.$queryRaw(
    Prisma.sql`SELECT "id", "Status" FROM public."InventoryCounts" WHERE "id" = ${countId}::uuid FOR UPDATE`,
  );
}

async function lockProducts(tx: Prisma.TransactionClient, productIds: string[]): Promise<void> {
  if (!productIds.length) return;
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM public."Products" WHERE "id" = ANY(${productIds}::uuid[]) ORDER BY "id" FOR UPDATE`,
  );
}

function countNotOpen(status: string): never {
  throw new ConflictError(`El conteo no está ABIERTO; estado actual: ${status}`);
}

/** Capa de persistencia y reglas de negocio de conteos físicos. */
export const inventoryCountsService = {
  /**
   * Crea un conteo y sus líneas dentro de una transacción.
   * @throws {BadRequestError} Si no hay alcance o excede 5,000 productos.
   * @throws {ConflictError} Si el alcance está vacío o contiene un producto ocupado.
   */
  async create(input: CreateInventoryCountInput) {
    const productIds = [...new Set(input.productIds ?? [])];
    if (!input.familyId && !input.subfamilyId && !productIds.length) {
      throw new BadRequestError("Debe indicar familyId, subfamilyId o productIds");
    }

    const count = await prisma.$transaction(async (tx) => {
      // $executeRaw: pg_advisory_xact_lock devuelve `void`, que $queryRaw no puede deserializar (P2010).
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('inventory_counts:create'))`);
      const where: Prisma.ProductWhereInput = {
        ...(input.familyId ? { familyId: input.familyId } : {}),
        ...(input.subfamilyId ? { subfamilyId: input.subfamilyId } : {}),
        ...(productIds.length ? { id: { in: productIds } } : {}),
        ...(input.includeInactive ? {} : { isActive: true }),
      };
      const products = await tx.product.findMany({
        where,
        select: { id: true, currentStock: true },
        orderBy: { code: "asc" },
      });
      if (!products.length) throw new ConflictError("El alcance del conteo está vacío");
      if (products.length > 5000) {
        throw new BadRequestError("Un conteo no puede superar 5,000 líneas");
      }

      const occupied = await tx.inventoryCountLine.findMany({
        where: { productId: { in: products.map((product) => product.id) }, count: { status: "ABIERTO" } },
        select: {
          product: { select: { code: true, description: true } },
        },
      });
      if (occupied.length) {
        const descriptions = occupied.map((row) => `${row.product.code} (${row.product.description})`);
        throw new ConflictError(`Productos en otro conteo abierto: ${descriptions.join(", ")}`);
      }

      const created = await tx.inventoryCount.create({
        data: {
          name: input.name.trim(),
          familyId: input.familyId,
          subfamilyId: input.subfamilyId,
          notes: input.notes ?? undefined,
          createdByWebUserId: input.webUserId,
        },
      });
      await tx.inventoryCountLine.createMany({
        data: products.map((product) => ({
          countId: created.id,
          productId: product.id,
          systemStockAtStart: toInventoryDecimal(product.currentStock),
        })),
      });
      return created;
    }, INVENTORY_COUNT_TRANSACTION_OPTIONS);

    return this.getById(count.id);
  },

  /** Lista conteos paginados, incluyendo el resumen de cada uno. */
  async list(params: ListInventoryCountsParams = {}) {
    const take = Math.min(params.take ?? 50, 200);
    const skip = params.skip ?? 0;
    const where: Prisma.InventoryCountWhereInput = params.status ? { status: params.status } : {};
    const [rows, total] = await Promise.all([
      prisma.inventoryCount.findMany({
        where,
        include: { lines: { include: { product: { select: { costPrice: true } } } } },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.inventoryCount.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({ ...row, summary: summaryFromLines(row.lines as CountLineDetail[]) })),
      total,
      take,
      skip,
    };
  },

  /** Obtiene un conteo con sus líneas y resumen calculado. */
  async getById(countId: string) {
    const count = await prisma.inventoryCount.findUnique({ where: { id: countId }, include: countDetailInclude });
    if (!count) throw new NotFoundError("Conteo no encontrado");
    return { ...count, summary: summaryFromLines(count.lines) };
  },

  /** Lista líneas con búsqueda, filtro de avance y paginación. */
  async listLines(countId: string, params: ListInventoryCountLinesParams = {}) {
    const exists = await prisma.inventoryCount.findUnique({ where: { id: countId }, select: { id: true } });
    if (!exists) throw new NotFoundError("Conteo no encontrado");
    const rows = await prisma.inventoryCountLine.findMany({
      where: {
        countId,
        ...(params.q
          ? {
              product: {
                OR: [
                  { code: { contains: params.q, mode: "insensitive" } },
                  { description: { contains: params.q, mode: "insensitive" } },
                ],
              },
            }
          : {}),
      },
      include: { product: { select: countLineProductSelect } },
      orderBy: { product: { code: "asc" } },
    });
    const output = rows.map(countLineOutput).filter((line) => {
      if (!params.filter || params.filter === "all") return true;
      if (params.filter === "pending") return line.countedQuantity === null;
      if (params.filter === "counted") return line.countedQuantity !== null;
      return line.varianceQuantity !== null && !toInventoryDecimal(line.varianceQuantity).isZero();
    });
    const take = Math.min(params.take ?? 100, 200);
    const skip = params.skip ?? 0;
    return { items: output.slice(skip, skip + take), total: output.length, take, skip };
  },

  /**
   * Captura o sobrescribe cantidades en lote y toma el stock vigente de cada producto.
   * Se valida todo antes de escribir para que el lote sea atómico.
   */
  async captureLines(countId: string, webUserId: string, items: CaptureInventoryCountItem[]) {
    assertBatchSize(items);
    return prisma.$transaction(async (tx) => {
      await lockCount(tx, countId);
      const count = await tx.inventoryCount.findUnique({ where: { id: countId }, select: { id: true, status: true } });
      if (!count) throw new NotFoundError("Conteo no encontrado");
      if (count.status !== "ABIERTO") countNotOpen(count.status);

      const lines = await tx.inventoryCountLine.findMany({
        where: { countId, productId: { in: items.map((item) => item.productId) } },
        include: { product: { select: countLineProductSelect } },
      });
      const linesByProduct = new Map(lines.map((line) => [line.productId, line]));
      const missing = items.find((item) => !linesByProduct.has(item.productId));
      if (missing) throw new NotFoundError(`El producto ${missing.productId} no pertenece al conteo`);

      const now = new Date();
      const updated = [];
      for (const item of items) {
        const line = linesByProduct.get(item.productId);
        if (!line) throw new NotFoundError(`El producto ${item.productId} no pertenece al conteo`);
        const quantity = normalizeCountedQuantity(item.countedQuantity, line.product.measurementType.decimals);
        updated.push(await tx.inventoryCountLine.update({
          where: { id: line.id },
          data: {
            countedQuantity: quantity,
            systemStockAtCount: line.product.currentStock,
            countedAt: now,
            countedByWebUserId: webUserId,
            ...(item.notes !== undefined ? { notes: item.notes } : {}),
            updatedAt: now,
          },
        }));
      }
      return { updated: updated.length, items: updated };
    }, INVENTORY_COUNT_TRANSACTION_OPTIONS);
  },

  /**
   * Aplica un conteo bloqueando primero el conteo y los productos afectados.
   * Ningún dato de stock se escribe si alguna diferencia produciría stock negativo.
   */
  async apply(countId: string, input: ApplyInventoryCountInput) {
    if (input.confirm !== true) throw new BadRequestError("Debe confirmar la aplicación del conteo");
    return prisma.$transaction(async (tx) => {
      await lockCount(tx, countId);
      const count = await tx.inventoryCount.findUnique({ where: { id: countId }, include: countDetailInclude });
      if (!count) throw new NotFoundError("Conteo no encontrado");
      if (count.status !== "ABIERTO") countNotOpen(count.status);

      const countedLines = count.lines.filter(
        (line) => line.countedQuantity !== null && line.systemStockAtCount !== null,
      );
      const variances = countedLines.map((line) => ({
        line,
        variance: calculateVariance(line.countedQuantity!, line.systemStockAtCount!),
      }));
      const affectedIds = variances.filter(({ variance }) => !variance.isZero()).map(({ line }) => line.productId);
      await lockProducts(tx, affectedIds);

      const products = affectedIds.length
        ? await tx.product.findMany({ where: { id: { in: affectedIds } }, select: countLineProductSelect })
        : [];
      const productById = new Map(products.map((product) => [product.id, product]));
      const negativeProducts: string[] = [];
      for (const { line, variance } of variances) {
        if (variance.isZero()) continue;
        const product = productById.get(line.productId);
        if (!product) throw new NotFoundError(`Producto ${line.productId} no encontrado`);
        if (calculateStockAfter(product.currentStock, variance).isNegative) {
          negativeProducts.push(`${product.code} (${product.description})`);
        }
      }
      if (negativeProducts.length) {
        throw new ConflictError(`El ajuste dejaría stock negativo; recontar: ${negativeProducts.join(", ")}`);
      }

      const webUser = await tx.webUser.findUnique({ where: { id: input.webUserId }, select: { employeeId: true } });
      const reason = buildCountReason(count.folio, count.name);
      let movementsCreated = 0;
      const appliedLines: Array<{
        id: string;
        varianceQuantity: Prisma.Decimal | null;
        unitCostAtApply: Prisma.Decimal | null;
        adjustmentMovementId: string | null;
      }> = [];
      for (const { line, variance } of variances) {
        const product = variance.isZero() ? line.product : productById.get(line.productId);
        if (!product) throw new NotFoundError(`Producto ${line.productId} no encontrado`);
        const unitCost = toInventoryDecimal(product.costPrice);
        let movementId: string | undefined;
        if (!variance.isZero()) {
          const stock = calculateStockAfter(product.currentStock, variance);
          const movement = await tx.inventoryMovement.create({
            data: {
              productId: product.id,
              movementType: variance.isPositive() ? "AJUSTE_ENTRADA" : "AJUSTE_SALIDA",
              /** La caja WPF persiste la magnitud positiva; el tipo expresa la dirección. */
              quantity: variance.abs(),
              unitCost,
              totalCost: variance.abs().mul(unitCost).toDecimalPlaces(4),
              stockBefore: product.currentStock,
              stockAfter: stock.stockAfter,
              reason,
              employeeId: webUser?.employeeId ?? undefined,
            },
          });
          movementId = movement.id;
          movementsCreated += 1;
          await tx.product.update({
            where: { id: product.id },
            data: { currentStock: stock.stockAfter, updatedAt: new Date() },
          });
          await syncStockAlert(tx, product.id, stock.stockAfter, toInventoryDecimal(product.minStock));
        }
        appliedLines.push(await tx.inventoryCountLine.update({
          where: { id: line.id },
          data: {
            varianceQuantity: variance,
            unitCostAtApply: unitCost,
            adjustmentMovementId: movementId,
            updatedAt: new Date(),
          },
        }));
      }

      const applied = await tx.inventoryCount.update({
        where: { id: count.id },
        data: {
          status: "APLICADO",
          appliedAt: new Date(),
          appliedByWebUserId: input.webUserId,
          updatedAt: new Date(),
        },
      });
      const allLines = count.lines.map((line) => {
        const appliedLine = appliedLines.find((updated) => updated.id === line.id);
        return appliedLine ? { ...line, ...appliedLine } : line;
      });
      return {
        ...applied,
        movementsCreated,
        summary: summaryFromLines(allLines),
      };
    }, INVENTORY_COUNT_TRANSACTION_OPTIONS);
  },

  /** Cancela un conteo abierto y conserva opcionalmente el motivo en sus notas. */
  async cancel(countId: string, webUserId: string, reason?: string | null) {
    return prisma.$transaction(async (tx) => {
      await lockCount(tx, countId);
      const count = await tx.inventoryCount.findUnique({ where: { id: countId } });
      if (!count) throw new NotFoundError("Conteo no encontrado");
      if (count.status !== "ABIERTO") countNotOpen(count.status);
      const nextNotes = reason?.trim()
        ? count.notes
          ? `${count.notes}\nMotivo de cancelación: ${reason.trim()}`
          : `Motivo de cancelación: ${reason.trim()}`
        : count.notes;
      return tx.inventoryCount.update({
        where: { id: countId },
        data: {
          status: "CANCELADO",
          notes: nextNotes,
          cancelledAt: new Date(),
          cancelledByWebUserId: webUserId,
          updatedAt: new Date(),
        },
      });
    });
  },

  /** Exporta las líneas y totales del conteo en formato XLSX. */
  async exportXlsx(countId: string): Promise<{ buffer: Buffer; folio: number }> {
    const detail = await this.getById(countId);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Conteo");
    worksheet.columns = [
      { header: "Código", key: "code", width: 16 },
      { header: "Descripción", key: "description", width: 36 },
      { header: "Unidad", key: "unit", width: 12 },
      { header: "Stock inicial", key: "stockStart", width: 16 },
      { header: "Contado", key: "counted", width: 14 },
      { header: "Stock al contar", key: "stockAtCount", width: 18 },
      { header: "Diferencia", key: "variance", width: 14 },
      { header: "Costo", key: "cost", width: 14 },
      { header: "Valor", key: "value", width: 14 },
    ];
    worksheet.getRow(1).font = { bold: true };
    for (const line of detail.lines) {
      const output = countLineOutput(line);
      worksheet.addRow({
        code: line.product.code,
        description: line.product.description,
        unit: line.product.measurementType.unitLabel,
        stockStart: line.systemStockAtStart.toNumber(),
        counted: line.countedQuantity?.toNumber() ?? null,
        stockAtCount: line.systemStockAtCount?.toNumber() ?? null,
        variance: output.varianceQuantity?.toNumber() ?? null,
        cost: (line.unitCostAtApply ?? line.product.costPrice).toNumber(),
        value: output.varianceValue?.toNumber() ?? null,
      });
    }
    worksheet.addRow({});
    worksheet.addRow({
      description: "TOTALES",
      variance: detail.summary.netQty.toNumber(),
      value: detail.summary.netValue.toNumber(),
    }).font = { bold: true };
    return { buffer: Buffer.from(await workbook.xlsx.writeBuffer()), folio: detail.folio };
  },
};
