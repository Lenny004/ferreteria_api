/**
 * Documentos de empleados (`hr.EmployeeDocuments`) vinculados al catálogo de tipos requeridos.
 */
import { prisma } from "../../lib/prisma.js";
import { NotFoundError } from "../../shared/errors.js";

/** Estados de cumplimiento de un documento. */
export const DOCUMENT_STATUSES = ["PENDIENTE", "ENTREGADO", "VENCIDO", "NO_APLICA"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

const documentSelect = {
  id: true,
  employeeId: true,
  docTypeId: true,
  fileUrl: true,
  fileName: true,
  status: true,
  issueDate: true,
  expiryDate: true,
  notes: true,
  isActive: true,
  uploadedAt: true,
  docType: {
    select: {
      id: true,
      name: true,
      description: true,
      isMandatory: true,
      hasExpiry: true,
      isActive: true,
    },
  },
} as const;

async function assertEmployeeExists(employeeId: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true },
  });
  if (!employee) throw new NotFoundError("Empleado no encontrado");
}

async function assertDocTypeExists(docTypeId: string) {
  const docType = await prisma.requiredDocumentType.findUnique({
    where: { id: docTypeId },
    select: { id: true },
  });
  if (!docType) throw new NotFoundError("Tipo de documento no encontrado");
}

export const employeeDocumentsService = {
  /** Lista documentos activos del empleado, más recientes primero. */
  async list(employeeId: string) {
    await assertEmployeeExists(employeeId);
    return prisma.employeeDocument.findMany({
      where: { employeeId, isActive: true },
      select: documentSelect,
      orderBy: { uploadedAt: "desc" },
    });
  },

  /** Crea un documento; estado `PENDIENTE` por defecto. */
  async create(
    employeeId: string,
    data: {
      docTypeId: string;
      status?: DocumentStatus;
      fileUrl?: string | null;
      fileName?: string | null;
      issueDate?: string | null;
      expiryDate?: string | null;
      notes?: string | null;
    },
  ) {
    await assertEmployeeExists(employeeId);
    await assertDocTypeExists(data.docTypeId);

    return prisma.employeeDocument.create({
      data: {
        employeeId,
        docTypeId: data.docTypeId,
        status: data.status ?? "PENDIENTE",
        fileUrl: data.fileUrl ?? undefined,
        fileName: data.fileName ?? undefined,
        issueDate: data.issueDate ? new Date(data.issueDate) : undefined,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : undefined,
        notes: data.notes ?? undefined,
      },
      select: documentSelect,
    });
  },

  /**
   * Actualización parcial de un documento.
   * Fechas nulas en el payload borran el valor almacenado.
   *
   * @throws {NotFoundError} Si el empleado o el documento no existen.
   */
  async update(
    employeeId: string,
    id: string,
    data: Partial<{
      docTypeId: string;
      status: DocumentStatus;
      fileUrl: string | null;
      fileName: string | null;
      issueDate: string | null;
      expiryDate: string | null;
      notes: string | null;
      isActive: boolean;
    }>,
  ) {
    await assertEmployeeExists(employeeId);

    const existing = await prisma.employeeDocument.findFirst({
      where: { id, employeeId },
    });
    if (!existing) throw new NotFoundError("Documento no encontrado");

    if (data.docTypeId) await assertDocTypeExists(data.docTypeId);

    return prisma.employeeDocument.update({
      where: { id },
      data: {
        ...data,
        issueDate: data.issueDate !== undefined ? (data.issueDate ? new Date(data.issueDate) : null) : undefined,
        expiryDate: data.expiryDate !== undefined ? (data.expiryDate ? new Date(data.expiryDate) : null) : undefined,
      },
      select: documentSelect,
    });
  },
};
