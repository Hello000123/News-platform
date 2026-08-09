import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/server/errors";

const mocks = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  getDatabase: vi.fn(),
  getEmployeeClientDetail: vi.fn(),
  generateClientCompanySummary: vi.fn(),
  listClientSummaryTargets: vi.fn(),
}));

vi.mock("@/lib/server/auth/guards", () => ({
  requireApiSession: mocks.requireApiSession,
}));
vi.mock("@/lib/server/auth/database", () => ({
  getDatabase: mocks.getDatabase,
}));
vi.mock("@/lib/server/client-summaries", () => ({
  getEmployeeClientDetail: mocks.getEmployeeClientDetail,
  generateClientCompanySummary: mocks.generateClientCompanySummary,
  listClientSummaryTargets: mocks.listClientSummaryTargets,
}));

import { GET as getClientDetail } from "@/app/api/employee/clients/[id]/route";
import { POST as generateSummary } from "@/app/api/employee/clients/[id]/summary/route";
import { GET as listSummaryTargets } from "@/app/api/employee/client-summaries/targets/route";

const session = {
  user: {
    id: "employee-1",
    email: "employee@example.test",
    fullName: "Employee One",
    role: "employee" as const,
  },
};

describe("employee client summary routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiSession.mockResolvedValue(session);
    mocks.getDatabase.mockReturnValue({ database: true });
    mocks.getEmployeeClientDetail.mockResolvedValue({ client: { id: "client-1" } });
    mocks.generateClientCompanySummary.mockResolvedValue({ companyType: "Technology" });
    mocks.listClientSummaryTargets.mockResolvedValue([
      { id: "client-1", fullName: "Client One", hasSummary: false },
    ]);
  });

  it("requires an employee and delegates detail pagination to the backend", async () => {
    const request = new Request(
      "https://pressready.example/api/employee/clients/client-1?page=2&pageSize=25",
    );
    const response = await getClientDetail(request, {
      params: Promise.resolve({ id: "client-1" }),
    });
    expect(response.status).toBe(200);
    expect(mocks.requireApiSession).toHaveBeenCalledWith(request, ["employee"]);
    expect(mocks.getEmployeeClientDetail).toHaveBeenCalledWith(
      { database: true },
      "client-1",
      { page: 2, pageSize: 25 },
    );
  });

  it("requires CSRF and passes only the authenticated employee to summary generation", async () => {
    const request = new Request(
      "https://pressready.example/api/employee/clients/client-1/summary",
      { method: "POST" },
    );
    const response = await generateSummary(request, {
      params: Promise.resolve({ id: "client-1" }),
    });
    expect(response.status).toBe(200);
    expect(mocks.requireApiSession).toHaveBeenCalledWith(
      request,
      ["employee"],
      { csrf: true },
    );
    expect(mocks.generateClientCompanySummary).toHaveBeenCalledWith(
      { database: true },
      "client-1",
      session.user,
    );
  });

  it("does not reach client data when employee authorization fails", async () => {
    mocks.requireApiSession.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "You do not have permission.", 403),
    );
    const request = new Request(
      "https://pressready.example/api/employee/clients/client-1",
    );
    const response = await getClientDetail(request, {
      params: Promise.resolve({ id: "client-1" }),
    });
    expect(response.status).toBe(403);
    expect(mocks.getEmployeeClientDetail).not.toHaveBeenCalled();
  });

  it("rejects invalid pagination and protects the batch target list", async () => {
    const invalidRequest = new Request(
      "https://pressready.example/api/employee/clients/client-1?page=client-2",
    );
    const invalidResponse = await getClientDetail(invalidRequest, {
      params: Promise.resolve({ id: "client-1" }),
    });
    expect(invalidResponse.status).toBe(400);
    expect(mocks.getEmployeeClientDetail).not.toHaveBeenCalled();

    const targetRequest = new Request(
      "https://pressready.example/api/employee/client-summaries/targets",
    );
    const targetResponse = await listSummaryTargets(targetRequest);
    expect(targetResponse.status).toBe(200);
    expect(mocks.requireApiSession).toHaveBeenLastCalledWith(targetRequest, ["employee"]);
    expect(mocks.listClientSummaryTargets).toHaveBeenCalledWith({ database: true });
  });
});
