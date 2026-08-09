import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/server/errors";

const mocks = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  getDatabase: vi.fn(),
  getClientOverview: vi.fn(),
}));

vi.mock("@/lib/server/auth/guards", () => ({
  requireApiSession: mocks.requireApiSession,
}));
vi.mock("@/lib/server/auth/database", () => ({
  getDatabase: mocks.getDatabase,
}));
vi.mock("@/lib/server/client-overview", () => ({
  getClientOverview: mocks.getClientOverview,
}));

import { GET } from "@/app/api/employee/client-overview/route";

describe("employee client overview route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiSession.mockResolvedValue({
      user: { id: "employee-1", role: "employee" },
    });
    mocks.getDatabase.mockReturnValue({ database: true });
    mocks.getClientOverview.mockResolvedValue({
      generatedAt: 1,
      companyTypeDistribution: {
        totalClients: 0,
        classifiedClients: 0,
        unclassifiedClients: 0,
        items: [],
      },
    });
  });

  it("requires an employee and returns backend-aggregated data", async () => {
    const request = new Request(
      "https://pressready.example/api/employee/client-overview",
    );
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(mocks.requireApiSession).toHaveBeenCalledWith(request, ["employee"]);
    expect(mocks.getClientOverview).toHaveBeenCalledWith({ database: true });
  });

  it("does not aggregate when authorization fails", async () => {
    mocks.requireApiSession.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "You do not have permission.", 403),
    );
    const response = await GET(
      new Request("https://pressready.example/api/employee/client-overview"),
    );
    expect(response.status).toBe(403);
    expect(mocks.getClientOverview).not.toHaveBeenCalled();
  });
});
