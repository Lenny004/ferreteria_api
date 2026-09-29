import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

describe("compatibilidad de ExcelJS con uuid 11", () => {
  it("escribe y lee formato condicional x14", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Compatibilidad");
    worksheet.getColumn(1).values = ["Ventas", 10, 20, 30];
    worksheet.addConditionalFormatting({
      ref: "A2:A4",
      rules: [
        {
          type: "dataBar",
          gradient: false,
          cfvo: [{ type: "min" }, { type: "max" }],
          color: { argb: "FF638EC6" },
        },
      ],
    });

    const buffer = await workbook.xlsx.writeBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);

    const loadedWorkbook = new ExcelJS.Workbook();
    await loadedWorkbook.xlsx.load(buffer);
    expect(loadedWorkbook.getWorksheet("Compatibilidad")).toBeDefined();
  });

  it("escribe celdas y fórmulas con la importación usada por los servicios", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Planilla");
    worksheet.addRow(["Empleado", "Salario", "Total"]);
    worksheet.addRow(["Ana", 100, { formula: "B2*2" }]);
    worksheet.getCell("C3").value = { formula: "SUM(B2:B2)" };

    const buffer = await workbook.xlsx.writeBuffer();
    const loadedWorkbook = new ExcelJS.Workbook();
    await loadedWorkbook.xlsx.load(buffer);
    const loadedWorksheet = loadedWorkbook.getWorksheet("Planilla");

    expect(loadedWorksheet?.getCell("A2").value).toBe("Ana");
    expect(loadedWorksheet?.getCell("C2").value).toMatchObject({ formula: "B2*2" });
    expect(loadedWorksheet?.getCell("C3").value).toMatchObject({ formula: "SUM(B2:B2)" });
  });
});
