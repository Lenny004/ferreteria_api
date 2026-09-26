/**
 * Exportación de artefactos de planilla (MVP): Excel de detalle, boletas en PDF y
 * Planilla Única AFP/ISSS. Los montos se leen ya calculados de `PayrollDetail`;
 * aquí solo se formatean para archivo/impresión, no se recotiza la ley.
 */
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { NotFoundError } from "../../shared/errors.js";
import { toNum } from "./payroll.mapper.js";
import { round2 } from "./payroll.utils.js";

// ─── Datos de la empresa (env con defaults) ───────────────────────────────────

function companyInfo() {
  return {
    name: process.env.COMPANY_NAME?.trim() || "Ferretería",
    nit: process.env.COMPANY_NIT?.trim() || "—",
    address: process.env.COMPANY_ADDRESS?.trim() || "—",
  };
}

// ─── Formateo ──────────────────────────────────────────────────────────────────

const MONEY_FORMAT = '"$"#,##0.00';

function fmtMoney(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function fmtDate(date: Date | null | undefined): string {
  if (!date) return "—";
  return date.toLocaleDateString("es-SV", { year: "numeric", month: "short", day: "numeric" });
}

const PERIOD_TYPE_LABELS: Record<string, string> = {
  MENSUAL: "Mensual",
  QUINCENAL: "Quincenal",
  SEMANAL: "Semanal",
};

function fmtPeriodType(periodType: string | null | undefined): string {
  if (!periodType) return "—";
  return PERIOD_TYPE_LABELS[periodType] ?? periodType;
}

function fmtPeriodRange(period: { startDate: Date; endDate: Date; periodType: string }): string {
  return `${fmtDate(period.startDate)} — ${fmtDate(period.endDate)} · ${fmtPeriodType(period.periodType)}`;
}

// ─── Carga de datos ────────────────────────────────────────────────────────────

const exportDetailInclude = {
  employee: { select: { firstName: true, lastName: true, dui: true } },
  bankAccount: {
    select: {
      accountNumber: true,
      accountType: true,
      bank: { select: { name: true } },
    },
  },
} satisfies Prisma.PayrollDetailInclude;

type ExportDetailRow = Prisma.PayrollDetailGetPayload<{ include: typeof exportDetailInclude }>;

/**
 * Carga la corrida (con período) y sus líneas de detalle con los datos mínimos
 * necesarios para los tres reportes de exportación.
 *
 * @throws NotFoundError si la corrida no existe.
 */
async function loadRunWithDetails(runId: string): Promise<{
  run: Prisma.PayrollRunGetPayload<{ include: { period: true } }>;
  details: ExportDetailRow[];
}> {
  const run = await prisma.payrollRun.findUnique({
    where: { id: runId },
    include: { period: true },
  });
  if (!run) throw new NotFoundError("Planilla no encontrada.");

  const details = await prisma.payrollDetail.findMany({
    where: { payrollRunId: runId },
    include: exportDetailInclude,
    orderBy: { employee: { firstName: "asc" } },
  });

  return { run, details };
}

function employeeFullName(d: ExportDetailRow): string {
  return d.employee ? `${d.employee.firstName} ${d.employee.lastName}` : "—";
}

// ─── 1. Excel de detalle de planilla ──────────────────────────────────────────

/**
 * Genera un Excel con una hoja de detalle por empleado (salario ordinario, extras,
 * bruto, deducciones de ley, neto y costo patronal) más una fila de totales.
 *
 * @param runId - UUID de la corrida.
 * @returns Buffer del archivo .xlsx.
 * @throws NotFoundError si la corrida no existe.
 */
export async function generatePayrollExcel(runId: string): Promise<Buffer> {
  const { run, details } = await loadRunWithDetails(runId);
  const company = companyInfo();

  const wb = new ExcelJS.Workbook();
  wb.creator = company.name;
  wb.created = new Date();

  const ws = wb.addWorksheet("Planilla", { views: [{ state: "frozen", ySplit: 6 }] });

  const COLOR_HEADER_BG = "FF1A3A5C";
  const COLOR_WHITE = "FFFFFFFF";
  const COLOR_TOTAL_BG = "FFE2E8F0";
  const COLOR_ROW_ALT = "FFF0F4F8";

  const lastCol = "M";

  ws.mergeCells(`A1:${lastCol}1`);
  ws.getCell("A1").value = company.name;
  ws.getCell("A1").font = { bold: true, size: 14, color: { argb: COLOR_HEADER_BG } };
  ws.getCell("A1").alignment = { horizontal: "center" };
  ws.getRow(1).height = 22;

  ws.mergeCells(`A2:${lastCol}2`);
  ws.getCell("A2").value = `PLANILLA DE SALARIOS — ${run.name.toUpperCase()}`;
  ws.getCell("A2").font = { bold: true, size: 12, color: { argb: "FF2D4A6B" } };
  ws.getCell("A2").alignment = { horizontal: "center" };

  ws.mergeCells(`A3:${lastCol}3`);
  ws.getCell("A3").value = `Período: ${fmtPeriodRange(run.period)}`;
  ws.getCell("A3").font = { size: 10, color: { argb: "FF4A5568" } };
  ws.getCell("A3").alignment = { horizontal: "center" };

  ws.mergeCells(`A4:${lastCol}4`);
  ws.getCell("A4").value = `Estado: ${run.status}  ·  Fecha de generación: ${fmtDate(new Date())}`;
  ws.getCell("A4").font = { size: 9, color: { argb: "FF718096" } };
  ws.getCell("A4").alignment = { horizontal: "center" };

  ws.columns = [
    { key: "num", width: 5 },
    { key: "name", width: 28 },
    { key: "dui", width: 13 },
    { key: "position", width: 20 },
    { key: "ordinary", width: 14 },
    { key: "extras", width: 12 },
    { key: "gross", width: 13 },
    { key: "afp", width: 12 },
    { key: "isss", width: 12 },
    { key: "isr", width: 10 },
    { key: "deductions", width: 13 },
    { key: "net", width: 14 },
    { key: "employerCost", width: 15 },
  ];

  const headerRow = ws.getRow(6);
  headerRow.values = [
    "N°", "Empleado", "DUI", "Puesto",
    "Sal. Ordinario", "Extras", "TOTAL BRUTO",
    "AFP (7.25%)", "ISSS (3%)", "ISR",
    "TOTAL DED.", "NETO A PAGAR", "Costo Patronal",
  ];
  headerRow.font = { bold: true, size: 9, color: { argb: COLOR_WHITE } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_HEADER_BG } };
  headerRow.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  headerRow.height = 30;

  const dataStart = 7;
  details.forEach((d, idx) => {
    const ordinary = toNum(d.ordinarySalary);
    const gross = toNum(d.totalGross);
    const extras = round2(gross - ordinary);

    const row = ws.addRow([
      idx + 1,
      employeeFullName(d),
      d.employee?.dui ?? "—",
      d.positionName ?? "—",
      ordinary,
      extras,
      gross,
      toNum(d.afpEmployeeAmount),
      toNum(d.isssEmployeeAmount),
      toNum(d.isrAmount),
      toNum(d.totalDeductions),
      toNum(d.netPay),
      toNum(d.totalEmployerCost),
    ]);

    for (let col = 5; col <= 13; col++) {
      row.getCell(col).numFmt = MONEY_FORMAT;
    }
    row.getCell(7).font = { bold: true };
    row.getCell(12).font = { bold: true, color: { argb: "FF1A4A7B" } };

    if (idx % 2 === 1) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        if (!cell.font?.bold) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ROW_ALT } };
        }
      });
    }
    row.height = 16;
  });

  const dataEnd = dataStart - 1 + details.length;
  const totalsRow = ws.addRow([]);
  totalsRow.getCell(2).value = `TOTALES (${details.length} empleados)`;
  totalsRow.getCell(2).font = { bold: true, size: 10 };
  for (const col of [5, 6, 7, 8, 9, 10, 11, 12, 13]) {
    const colLetter = ws.getColumn(col).letter;
    const cell = totalsRow.getCell(col);
    cell.value = { formula: `SUM(${colLetter}${dataStart}:${colLetter}${dataEnd})` };
    cell.numFmt = MONEY_FORMAT;
    cell.font = { bold: true, size: 10 };
  }
  totalsRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_TOTAL_BG } };
  totalsRow.height = 20;

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ─── 2. PDF de boletas por empleado ───────────────────────────────────────────

/**
 * Genera un PDF multi-página con una boleta de pago por cada empleado de la corrida.
 *
 * @param runId - UUID de la corrida.
 * @returns Buffer del PDF.
 * @throws NotFoundError si la corrida no existe o no tiene detalles.
 */
export async function generateAllReceiptsPdf(runId: string): Promise<Buffer> {
  const { run, details } = await loadRunWithDetails(runId);
  if (details.length === 0) {
    throw new NotFoundError("No hay líneas de planilla para generar boletas.");
  }
  const company = companyInfo();

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: "LETTER", margin: 50 });

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const leftMargin = doc.page.margins.left;

    const printLine = (label: string, value: string, bold = false) => {
      const y = doc.y;
      doc.font("Helvetica-Bold").fontSize(9.5).text(label, leftMargin, y, { width: 160 });
      doc
        .font(bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(9.5)
        .text(value, leftMargin + 160, y, { width: pageWidth - 160 });
      doc.moveDown(0.15);
    };

    const printAmount = (label: string, amount: number, bold = false) => {
      const y = doc.y;
      const font = bold ? "Helvetica-Bold" : "Helvetica";
      doc.font(font).fontSize(10).text(label, leftMargin, y, { width: pageWidth * 0.65 });
      doc
        .font(font)
        .fontSize(10)
        .text(fmtMoney(amount), leftMargin + pageWidth * 0.65, y, {
          width: pageWidth * 0.35,
          align: "right",
        });
      doc.moveDown(0.25);
    };

    const drawRule = () => {
      const y = doc.y;
      doc.moveTo(leftMargin, y).lineTo(leftMargin + pageWidth, y).strokeColor("#6b7280").lineWidth(0.8).stroke();
      doc.strokeColor("black").lineWidth(1);
      doc.moveDown(0.4);
    };

    details.forEach((d, idx) => {
      if (idx > 0) doc.addPage();

      doc.font("Helvetica-Bold").fontSize(13).fillColor("#1A3A5C").text(company.name, { align: "center" });
      doc
        .font("Helvetica")
        .fontSize(8.5)
        .fillColor("#4A5568")
        .text(`NIT: ${company.nit}  ·  ${company.address}`, { align: "center" });
      doc.moveDown(0.6);
      doc.fillColor("black").font("Helvetica-Bold").fontSize(11).text("COMPROBANTE DE PAGO DE PLANILLA", { align: "center" });
      doc.font("Helvetica").fontSize(9).fillColor("#4A5568").text(fmtPeriodRange(run.period), { align: "center" });
      doc.fillColor("black");
      doc.moveDown(0.8);
      drawRule();

      printLine("Empleado:", employeeFullName(d), true);
      printLine("DUI:", d.employee?.dui ?? "—");
      printLine("Puesto:", d.positionName ?? "—");
      printLine("Tipo de contrato:", d.contractType ?? "—");
      printLine("NUP:", d.nup ?? "—");
      printLine("N° ISSS:", d.isssNumber ?? "—");
      doc.moveDown(0.4);
      drawRule();

      doc.font("Helvetica-Bold").fontSize(10.5).text("DEVENGOS", leftMargin, doc.y);
      doc.moveDown(0.3);
      printAmount("Salario ordinario", toNum(d.ordinarySalary));
      printAmount("Horas extra", toNum(d.overtimeAmount));
      printAmount("Bonificaciones", toNum(d.bonuses));
      printAmount("Viáticos", toNum(d.viaticos));
      printAmount("Vacaciones", toNum(d.vacationPay) + toNum(d.vacationSurcharge));
      printAmount("Aguinaldo", toNum(d.aguinaldo));
      printAmount("Otros ingresos", toNum(d.otherEarnings));
      drawRule();
      printAmount("TOTAL BRUTO", toNum(d.totalGross), true);
      doc.moveDown(0.5);

      doc.font("Helvetica-Bold").fontSize(10.5).text("DEDUCCIONES", leftMargin, doc.y);
      doc.moveDown(0.3);
      printAmount(`AFP (${(toNum(d.afpEmployeeRate) * 100).toFixed(2)}%)`, toNum(d.afpEmployeeAmount));
      printAmount(`ISSS (${(toNum(d.isssEmployeeRate) * 100).toFixed(2)}%)`, toNum(d.isssEmployeeAmount));
      printAmount("ISR", toNum(d.isrAmount));
      printAmount("Préstamos", toNum(d.loanDeduction));
      printAmount("Otras deducciones", toNum(d.otherDeductions));
      drawRule();
      printAmount("TOTAL DEDUCCIONES", toNum(d.totalDeductions), true);
      doc.moveDown(0.6);

      doc.rect(leftMargin, doc.y, pageWidth, 30).fillAndStroke("#EDF2F7", "#1A3A5C");
      doc
        .fillColor("#1A3A5C")
        .font("Helvetica-Bold")
        .fontSize(13)
        .text("NETO A PAGAR", leftMargin + 10, doc.y + 8, { continued: false });
      doc
        .fillColor("#1A3A5C")
        .font("Helvetica-Bold")
        .fontSize(13)
        .text(fmtMoney(toNum(d.netPay)), leftMargin, doc.y - 21, { width: pageWidth - 10, align: "right" });
      doc.fillColor("black");
      doc.moveDown(2.2);

      const paymentChannelLabel: Record<string, string> = {
        DEPOSITO_BANCARIO: "Depósito bancario",
        EFECTIVO: "Efectivo",
        CHEQUE: "Cheque",
      };
      printLine("Canal de pago:", paymentChannelLabel[d.paymentChannel ?? ""] ?? d.paymentChannel ?? "—");
      if (d.bankAccount) {
        printLine("Banco / cuenta:", `${d.bankAccount.bank.name} — ${d.bankAccount.accountNumber}`);
      }
      doc.moveDown(1.5);

      const sigWidth = 180;
      const sigY = doc.y;
      doc.text("____________________________", leftMargin, sigY, { width: sigWidth, align: "center" });
      doc.text("Firma del empleado", leftMargin, sigY + 14, { width: sigWidth, align: "center" });
      doc.text(
        "____________________________",
        leftMargin + pageWidth - sigWidth,
        sigY,
        { width: sigWidth, align: "center" },
      );
      doc.text("Autorizado por", leftMargin + pageWidth - sigWidth, sigY + 14, { width: sigWidth, align: "center" });
    });

    doc.end();
  });
}

// ─── 3. Excel de Planilla Única AFP/ISSS ──────────────────────────────────────

/**
 * Genera el Excel de la Planilla Única de Cotizaciones (AFP/ISSS): NUP, N° ISSS,
 * nombre, salario cotizable y aportes de empleado/patrono. Los aportes se toman
 * ya liquidados de `PayrollDetail`, no se recalculan.
 *
 * @param runId - UUID de la corrida.
 * @returns Buffer del archivo .xlsx en orientación horizontal.
 * @throws NotFoundError si la corrida no existe.
 */
export async function generatePlanillaUnicaExcel(runId: string): Promise<Buffer> {
  const { run, details } = await loadRunWithDetails(runId);
  const company = companyInfo();

  const wb = new ExcelJS.Workbook();
  wb.creator = company.name;
  wb.created = new Date();

  const ws = wb.addWorksheet("Planilla Única", {
    views: [{ state: "frozen", ySplit: 6 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });

  const lastCol = "N";
  const C_TITLE = "FF003366";
  const C_HEAD_BG = "FF1A3A5C";
  const C_HEAD_FG = "FFFFFFFF";
  const C_TOTAL_BG = "FFE2E8F0";
  const C_ALT = "FFF5F5F5";

  ws.mergeCells(`A1:${lastCol}1`);
  ws.getCell("A1").value = "PLANILLA ÚNICA DE COTIZACIONES PREVISIONALES Y DE SEGURIDAD";
  ws.getCell("A1").font = { bold: true, size: 13, color: { argb: C_TITLE } };
  ws.getCell("A1").alignment = { horizontal: "center" };
  ws.getRow(1).height = 22;

  ws.mergeCells(`A2:${lastCol}2`);
  ws.getCell("A2").value = `${company.name}  ·  NIT/DUI: ${company.nit}`;
  ws.getCell("A2").font = { bold: true, size: 10, color: { argb: "FF2D4A6B" } };
  ws.getCell("A2").alignment = { horizontal: "center" };

  ws.mergeCells(`A3:${lastCol}3`);
  ws.getCell("A3").value = `Período: ${fmtPeriodRange(run.period)}  ·  Corrida: ${run.name}`;
  ws.getCell("A3").font = { size: 9, color: { argb: "FF4A5568" } };
  ws.getCell("A3").alignment = { horizontal: "center" };
  ws.getRow(3).height = 16;

  ws.columns = [
    { key: "num", width: 5 },
    { key: "nup", width: 14 },
    { key: "isss", width: 14 },
    { key: "nombre", width: 28 },
    { key: "afpInst", width: 14 },
    { key: "salarioCotizable", width: 16 },
    { key: "afpEmp", width: 13 },
    { key: "afpPat", width: 13 },
    { key: "insaforp", width: 12 },
    { key: "totalAfp", width: 13 },
    { key: "isssEmp", width: 13 },
    { key: "isssPat", width: 13 },
    { key: "totalIsss", width: 13 },
  ];

  const headerRow = ws.getRow(6);
  headerRow.values = [
    "N°", "NUP", "N° ISSS", "Nombre", "AFP",
    "Salario Cotizable",
    "AFP Empleado", "AFP Patronal", "INSAFORP", "Total AFP",
    "ISSS Empleado", "ISSS Patronal", "Total ISSS",
  ];
  headerRow.font = { bold: true, size: 9, color: { argb: C_HEAD_FG } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C_HEAD_BG } };
  headerRow.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  headerRow.height = 30;

  const dataStart = 7;
  details.forEach((d, idx) => {
    const contributionBase = round2(
      toNum(d.ordinarySalary) +
        toNum(d.bonuses) +
        toNum(d.overtimeAmount) +
        toNum(d.viaticos) +
        toNum(d.otherEarnings) +
        toNum(d.vacationPay),
    );
    const afpEmp = toNum(d.afpEmployeeAmount);
    const afpPat = toNum(d.afpEmployerAmount);
    const insaforp = toNum(d.insaforpAmount);
    const isssEmp = toNum(d.isssEmployeeAmount);
    const isssPat = toNum(d.isssEmployerAmount);

    const row = ws.addRow([
      idx + 1,
      d.nup ?? "—",
      d.isssNumber ?? "—",
      employeeFullName(d),
      d.afpInstitution ?? "—",
      contributionBase,
      afpEmp,
      afpPat,
      insaforp,
      round2(afpEmp + afpPat + insaforp),
      isssEmp,
      isssPat,
      round2(isssEmp + isssPat),
    ]);

    for (const col of [6, 7, 8, 9, 10, 11, 12, 13]) {
      row.getCell(col).numFmt = MONEY_FORMAT;
    }
    if (idx % 2 === 1) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C_ALT } };
      });
    }
    row.height = 16;
  });

  const dataEnd = dataStart - 1 + details.length;
  const totalsRow = ws.addRow([]);
  totalsRow.getCell(4).value = `TOTALES (${details.length} empleados)`;
  totalsRow.getCell(4).font = { bold: true, size: 10 };
  for (const col of [6, 7, 8, 9, 10, 11, 12, 13]) {
    const colLetter = ws.getColumn(col).letter;
    const cell = totalsRow.getCell(col);
    cell.value = { formula: `SUM(${colLetter}${dataStart}:${colLetter}${dataEnd})` };
    cell.numFmt = MONEY_FORMAT;
    cell.font = { bold: true, size: 10 };
  }
  totalsRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C_TOTAL_BG } };
  totalsRow.height = 20;

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
