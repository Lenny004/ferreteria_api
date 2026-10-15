import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError } from "../src/shared/errors.js";

const leaveRequestId = "650e8400-e29b-41d4-a716-446655440000";
const employeeId = "750e8400-e29b-41d4-a716-446655440000";
const leaveTypeId = "850e8400-e29b-41d4-a716-446655440000";

const existingRequest = {
  id: leaveRequestId,
  employeeId,
  leaveTypeId,
  startDate: new Date("2026-06-01T00:00:00.000Z"),
  endDate: new Date("2026-06-03T00:00:00.000Z"),
  daysRequested: 3,
  halfDay: false,
  halfDayPeriod: null,
  reason: null,
  documentUrl: null,
  status: "PENDIENTE",
  requestedAt: new Date("2026-05-01T00:00:00.000Z"),
  reviewedBy: null,
  reviewedAt: null,
  reviewNotes: null,
  approvedBy: null,
  approvedAt: null,
  createdAt: new Date("2026-05-01T00:00:00.000Z"),
  leaveType: { name: "Vacaciones", category: "VACACIONES", isPaid: true },
  employee: { firstName: "Ana", lastName: "Pérez" },
};

let requestState = { ...existingRequest };
let balanceDaysTaken = 0;

const prismaMock = {
  $transaction: vi.fn(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock)),
  leaveRequest: { findUnique: vi.fn(), updateMany: vi.fn() },
  vacationBalance: { upsert: vi.fn() },
};

vi.mock("../src/lib/prisma.js", () => ({ prisma: prismaMock }));

const { approveLeaveRequest, rejectLeaveRequest } = await import("../src/modules/leave-requests/leave-requests.service.js");

describe("aprobación de solicitudes de vacaciones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestState = { ...existingRequest };
    balanceDaysTaken = 0;
    prismaMock.leaveRequest.findUnique.mockImplementation(async () => requestState);
    prismaMock.leaveRequest.updateMany.mockImplementation(async ({
      where,
      data,
    }: {
      where: { id: string; status: string };
      data: Record<string, unknown>;
    }) => {
      if (requestState.id !== where.id || requestState.status !== where.status) return { count: 0 };
      Object.assign(requestState, data);
      return { count: 1 };
    });
    prismaMock.vacationBalance.upsert.mockImplementation(async ({ create, update }) => {
      balanceDaysTaken += create?.daysTaken ?? update?.daysTaken?.increment ?? 0;
      return {};
    });
  });

  it("actualiza la solicitud y el saldo dentro de la misma transacción", async () => {
    await approveLeaveRequest(leaveRequestId, "web-user-1");

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.leaveRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: leaveRequestId, status: "PENDIENTE" },
    }));
    expect(prismaMock.vacationBalance.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { employeeId_year: { employeeId, year: 2026 } },
      create: expect.objectContaining({ daysTaken: 3 }),
    }));
  });

  it("rechaza la segunda aprobación concurrente y aumenta el saldo una sola vez", async () => {
    const results = await Promise.allSettled([
      approveLeaveRequest(leaveRequestId, "web-user-1"),
      approveLeaveRequest(leaveRequestId, "web-user-2"),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: expect.any(ConflictError),
    });
    expect((rejected as PromiseRejectedResult).reason.statusCode).toBe(409);
    expect(prismaMock.vacationBalance.upsert).toHaveBeenCalledTimes(1);
    expect(balanceDaysTaken).toBe(3);
  });

  it("serializa aprobar y rechazar: gana la aprobación y el rechazo falla con 409", async () => {
    const results = await Promise.allSettled([
      approveLeaveRequest(leaveRequestId, "web-user-1"),
      rejectLeaveRequest(leaveRequestId, "web-user-2", "Documentación incompleta"),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: expect.any(ConflictError),
    });
    expect((rejected as PromiseRejectedResult).reason.statusCode).toBe(409);
    expect(requestState.status).toBe("APROBADA");
    expect(prismaMock.vacationBalance.upsert).toHaveBeenCalledTimes(1);
    expect(balanceDaysTaken).toBe(3);
  });

  it("serializa rechazar y aprobar: gana el rechazo con 409 y no incrementa el saldo", async () => {
    const results = await Promise.allSettled([
      rejectLeaveRequest(leaveRequestId, "web-user-1", "Documentación incompleta"),
      approveLeaveRequest(leaveRequestId, "web-user-2"),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: expect.any(ConflictError),
    });
    expect((rejected as PromiseRejectedResult).reason.statusCode).toBe(409);
    expect(requestState.status).toBe("RECHAZADA");
    expect(requestState.reviewedBy).toBe("web-user-1");
    expect(requestState.reviewNotes).toBe("Documentación incompleta");
    expect(prismaMock.vacationBalance.upsert).not.toHaveBeenCalled();
    expect(balanceDaysTaken).toBe(0);
  });

  it("rechaza el doble rechazo con 409", async () => {
    await rejectLeaveRequest(leaveRequestId, "web-user-1", "Documentación incompleta");

    await expect(rejectLeaveRequest(leaveRequestId, "web-user-2", "Otro motivo"))
      .rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining("ya no está pendiente") });
    expect(requestState.status).toBe("RECHAZADA");
    expect(requestState.reviewedBy).toBe("web-user-1");
    expect(requestState.reviewNotes).toBe("Documentación incompleta");
  });
});
