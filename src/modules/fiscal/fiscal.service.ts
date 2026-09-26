import { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { prisma } from "../../lib/prisma.js";
import { BadRequestError, NotFoundError } from "../../shared/errors.js";

export const IVA_REPORT_TYPES = ["VENTAS_CF", "VENTAS_CCF", "COMPRAS"] as const;
export type IvaReportType = (typeof IVA_REPORT_TYPES)[number];

function toNum(d: Prisma.Decimal | number | string | null | undefined): number {
  if (d == null) return 0;
  if (typeof d === "object") return parseFloat(d.toString());
  return Number(d);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function monthRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  return { start, end };
}

export type IvaLine = {
  date: string;
  documentNumber: string;
  documentType: string;
  partnerName: string;
  partnerTaxId: string | null;
  totalExenta: number;
  totalGravada: number;
  totalIva: number;
  total: number;
  sourceId: string;
};

export type IvaBookSnapshot = {
  reportType: IvaReportType;
  year: number;
  month: number;
  totalExenta: number;
  totalGravada: number;
  totalIva: number;
  lineCount: number;
  lines: IvaLine[];
};

async function buildVentasBook(
  year: number,
  month: number,
  reportType: "VENTAS_CF" | "VENTAS_CCF",
): Promise<IvaBookSnapshot> {
  const dteType = reportType === "VENTAS_CF" ? "01" : "03";
  const { start, end } = monthRange(year, month);

  const rows = await prisma.dteIssued.findMany({
    where: {
      dteType,
      issuedAt: { gte: start, lt: end },
      mhStatus: { not: "RECHAZADO" },
    },
    include: {
      order: {
        include: {
          customer: { select: { name: true, nit: true, nrc: true } },
        },
      },
    },
    orderBy: { issuedAt: "asc" },
  });

  const lines: IvaLine[] = rows.map((r) => {
    const customer = r.order?.customer;
    return {
      date: r.issuedAt.toISOString().slice(0, 10),
      documentNumber: r.controlNumber,
      documentType: r.dteType,
      partnerName: customer?.name ?? (reportType === "VENTAS_CF" ? "Consumidor final" : "Cliente"),
      partnerTaxId: customer?.nit ?? customer?.nrc ?? null,
      totalExenta: toNum(r.totalExenta),
      totalGravada: toNum(r.totalGravada),
      totalIva: toNum(r.totalIva),
      total: toNum(r.totalPagar),
      sourceId: r.id,
    };
  });

  return {
    reportType,
    year,
    month,
    totalExenta: round2(lines.reduce((a, l) => a + l.totalExenta, 0)),
    totalGravada: round2(lines.reduce((a, l) => a + l.totalGravada, 0)),
    totalIva: round2(lines.reduce((a, l) => a + l.totalIva, 0)),
    lineCount: lines.length,
    lines,
  };
}

async function buildComprasBook(year: number, month: number): Promise<IvaBookSnapshot> {
  const { start, end } = monthRange(year, month);

  const rows = await prisma.purchaseOrder.findMany({
    where: {
      status: "RECIBIDA",
      receivedAt: { gte: start, lt: end },
    },
    include: {
      supplier: { select: { name: true, nit: true, nrc: true } },
    },
    orderBy: { receivedAt: "asc" },
  });

  const lines: IvaLine[] = rows.map((r) => {
    const subtotal = toNum(r.subtotal);
    const tax = toNum(r.taxAmount);
    const total = toNum(r.total);
    return {
      date: (r.receivedAt ?? r.createdAt).toISOString().slice(0, 10),
      documentNumber: r.supplierDocNumber ?? r.id.slice(0, 8),
      documentType: r.supplierDocType ?? "OTRO",
      partnerName: r.supplier.name,
      partnerTaxId: r.supplier.nit ?? r.supplier.nrc ?? null,
      totalExenta: 0,
      totalGravada: subtotal,
      totalIva: tax,
      total,
      sourceId: r.id,
    };
  });

  return {
    reportType: "COMPRAS",
    year,
    month,
    totalExenta: 0,
    totalGravada: round2(lines.reduce((a, l) => a + l.totalGravada, 0)),
    totalIva: round2(lines.reduce((a, l) => a + l.totalIva, 0)),
    lineCount: lines.length,
    lines,
  };
}

export async function buildIvaBook(
  year: number,
  month: number,
  reportType: IvaReportType,
): Promise<IvaBookSnapshot> {
  if (reportType === "COMPRAS") return buildComprasBook(year, month);
  return buildVentasBook(year, month, reportType);
}

function mapReport(row: {
  id: string;
  year: number;
  month: number;
  reportType: string;
  status: string;
  totalExenta: Prisma.Decimal;
  totalGravada: Prisma.Decimal;
  totalIva: Prisma.Decimal;
  generatedBy: string | null;
  generatedAt: Date | null;
  fileUrl: string | null;
  notes: string | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    year: row.year,
    month: row.month,
    reportType: row.reportType as IvaReportType,
    status: row.status as "BORRADOR" | "CERRADO",
    totalExenta: toNum(row.totalExenta),
    totalGravada: toNum(row.totalGravada),
    totalIva: toNum(row.totalIva),
    generatedBy: row.generatedBy,
    generatedAt: row.generatedAt?.toISOString() ?? null,
    fileUrl: row.fileUrl,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

export const fiscalService = {
  async listReports(params: { year?: number; month?: number } = {}) {
    const where: Prisma.IvaReportWhereInput = {};
    if (params.year !== undefined) where.year = params.year;
    if (params.month !== undefined) where.month = params.month;

    const rows = await prisma.ivaReport.findMany({
      where,
      orderBy: [{ year: "desc" }, { month: "desc" }, { reportType: "asc" }],
    });
    return rows.map(mapReport);
  },

  async getPeriod(year: number, month: number) {
    const reports = await this.listReports({ year, month });
    const previews = await Promise.all(
      IVA_REPORT_TYPES.map(async (type) => {
        const snap = await buildIvaBook(year, month, type);
        const saved = reports.find((r) => r.reportType === type) ?? null;
        return {
          reportType: type,
          live: {
            totalExenta: snap.totalExenta,
            totalGravada: snap.totalGravada,
            totalIva: snap.totalIva,
            lineCount: snap.lineCount,
          },
          saved,
          balanced:
            !saved ||
            (round2(saved.totalExenta) === snap.totalExenta &&
              round2(saved.totalGravada) === snap.totalGravada &&
              round2(saved.totalIva) === snap.totalIva),
        };
      }),
    );
    return { year, month, reports, previews };
  },

  async getReportDetail(id: string) {
    const report = await prisma.ivaReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundError("Libro IVA no encontrado");
    const snap = await buildIvaBook(
      report.year,
      report.month,
      report.reportType as IvaReportType,
    );
    return {
      ...mapReport(report),
      lines: snap.lines,
      liveTotals: {
        totalExenta: snap.totalExenta,
        totalGravada: snap.totalGravada,
        totalIva: snap.totalIva,
        lineCount: snap.lineCount,
      },
      balanced:
        round2(toNum(report.totalExenta)) === snap.totalExenta &&
        round2(toNum(report.totalGravada)) === snap.totalGravada &&
        round2(toNum(report.totalIva)) === snap.totalIva,
    };
  },

  async generate(
    input: { year: number; month: number; reportType: IvaReportType; notes?: string },
    userId?: string,
  ) {
    if (input.month < 1 || input.month > 12) {
      throw new BadRequestError("Mes inválido");
    }
    const existing = await prisma.ivaReport.findUnique({
      where: {
        year_month_reportType: {
          year: input.year,
          month: input.month,
          reportType: input.reportType,
        },
      },
    });
    if (existing?.status === "CERRADO") {
      throw new BadRequestError("El libro ya está cerrado y no se puede regenerar");
    }

    const snap = await buildIvaBook(input.year, input.month, input.reportType);
    const data = {
      year: input.year,
      month: input.month,
      reportType: input.reportType,
      status: "BORRADOR",
      totalExenta: snap.totalExenta,
      totalGravada: snap.totalGravada,
      totalIva: snap.totalIva,
      generatedBy: userId ?? null,
      generatedAt: new Date(),
      notes: input.notes ?? null,
    };

    const row = existing
      ? await prisma.ivaReport.update({ where: { id: existing.id }, data })
      : await prisma.ivaReport.create({ data });

    return {
      ...mapReport(row),
      lineCount: snap.lineCount,
    };
  },

  async close(id: string) {
    const report = await prisma.ivaReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundError("Libro IVA no encontrado");
    if (report.status === "CERRADO") return mapReport(report);

    const snap = await buildIvaBook(
      report.year,
      report.month,
      report.reportType as IvaReportType,
    );
    const balanced =
      round2(toNum(report.totalExenta)) === snap.totalExenta &&
      round2(toNum(report.totalGravada)) === snap.totalGravada &&
      round2(toNum(report.totalIva)) === snap.totalIva;

    if (!balanced) {
      throw new BadRequestError(
        "Cuadre incorrecto con DTE/OC actuales. Regenera el borrador antes de cerrar.",
      );
    }

    const row = await prisma.ivaReport.update({
      where: { id },
      data: {
        status: "CERRADO",
        totalExenta: snap.totalExenta,
        totalGravada: snap.totalGravada,
        totalIva: snap.totalIva,
      },
    });
    return mapReport(row);
  },

  async exportExcel(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const detail = await this.getReportDetail(id);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(detail.reportType);

    ws.columns = [
      { header: "Fecha", key: "date", width: 12 },
      { header: "Documento", key: "documentNumber", width: 28 },
      { header: "Tipo", key: "documentType", width: 10 },
      { header: "Tercero", key: "partnerName", width: 32 },
      { header: "NIT/NRC", key: "partnerTaxId", width: 16 },
      { header: "Exenta", key: "totalExenta", width: 12 },
      { header: "Gravada", key: "totalGravada", width: 12 },
      { header: "IVA", key: "totalIva", width: 12 },
      { header: "Total", key: "total", width: 12 },
    ];

    for (const line of detail.lines) {
      ws.addRow(line);
    }
    ws.addRow({});
    ws.addRow({
      partnerName: "TOTALES",
      totalExenta: detail.totalExenta,
      totalGravada: detail.totalGravada,
      totalIva: detail.totalIva,
      total: round2(detail.totalExenta + detail.totalGravada + detail.totalIva),
    });

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const filename = `iva_${detail.reportType}_${detail.year}_${String(detail.month).padStart(2, "0")}.xlsx`;
    return { buffer, filename };
  },

  async listDte(params: {
    year?: number;
    month?: number;
    dteType?: string;
    mhStatus?: string;
    take?: number;
    skip?: number;
  }) {
    const where: Prisma.DteIssuedWhereInput = {};
    if (params.dteType) where.dteType = params.dteType;
    if (params.mhStatus) where.mhStatus = params.mhStatus;
    if (params.year !== undefined && params.month !== undefined) {
      const { start, end } = monthRange(params.year, params.month);
      where.issuedAt = { gte: start, lt: end };
    } else if (params.year !== undefined) {
      const start = new Date(Date.UTC(params.year, 0, 1));
      const end = new Date(Date.UTC(params.year + 1, 0, 1));
      where.issuedAt = { gte: start, lt: end };
    }

    const take = Math.min(params.take ?? 50, 200);
    const skip = params.skip ?? 0;

    const [items, total] = await Promise.all([
      prisma.dteIssued.findMany({
        where,
        select: {
          id: true,
          orderId: true,
          dteType: true,
          controlNumber: true,
          generationCode: true,
          mhStatus: true,
          totalExenta: true,
          totalGravada: true,
          totalIva: true,
          totalPagar: true,
          issuedAt: true,
          processedAt: true,
          // Nunca exponer jsonPayload completo ni secretos
        },
        orderBy: { issuedAt: "desc" },
        take,
        skip,
      }),
      prisma.dteIssued.count({ where }),
    ]);

    return {
      items: items.map((i) => ({
        ...i,
        totalExenta: toNum(i.totalExenta),
        totalGravada: toNum(i.totalGravada),
        totalIva: toNum(i.totalIva),
        totalPagar: toNum(i.totalPagar),
        issuedAt: i.issuedAt.toISOString(),
        processedAt: i.processedAt?.toISOString() ?? null,
      })),
      total,
      take,
      skip,
    };
  },
};
