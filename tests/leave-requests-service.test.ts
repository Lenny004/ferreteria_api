import { beforeEach, describe, expect, it, vi } from "vitest";

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

const prismaMock = {
  $transaction: vi.fn(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock)),
  leaveRequest: { findUnique: vi.fn(), update: vi.fn() },
  vacationBalance: { upsert: vi.fn() },
};

vi.mock("../src/lib/prisma.js", () => ({ prisma: prismaMock }));

const { approveLeaveRequest } = await import("../src/modules/leave-requests/leave-requests.service.js");

describe("aprobación de solicitudes de vacaciones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.leaveRequest.findUnique.mockResolvedValue(existingRequest);
    prismaMock.leaveRequest.update.mockResolvedValue({
      ...existingRequest,
      status: "APROBADA",
      reviewedBy: "web-user-1",
      reviewedAt: new Date("2026-05-01T00:00:00.000Z"),
      approvedBy: "web-user-1",
      approvedAt: new Date("2026-05-01T00:00:00.000Z"),
    });
    prismaMock.vacationBalance.upsert.mockResolvedValue({});
  });

  it("actualiza la solicitud y el saldo dentro de la misma transacción", async () => {
    await approveLeaveRequest(leaveRequestId, "web-user-1");

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.vacationBalance.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { employeeId_year: { employeeId, year: 2026 } },
      create: expect.objectContaining({ daysTaken: 3 }),
    }));
  });
});
