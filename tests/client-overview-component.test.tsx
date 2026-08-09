// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ClientOverview } from "@/components/employee/client-overview";

const mocks = vi.hoisted(() => ({
  getEmployeeClientOverview: vi.fn(),
}));

vi.mock("@/lib/client/auth-api", () => ({
  AuthRequestError: class AuthRequestError extends Error {},
  getEmployeeClientOverview: mocks.getEmployeeClientOverview,
}));

const populatedOverview = {
  generatedAt: 1_800_000_000,
  companyTypeDistribution: {
    totalClients: 4,
    classifiedClients: 3,
    unclassifiedClients: 1,
    items: [
      {
        companyType: "Technology",
        clientCount: 3,
        percentage: 75,
        isUnclassified: false,
      },
      {
        companyType: "Unknown / Unclassified",
        clientCount: 1,
        percentage: 25,
        isUnclassified: true,
      },
    ],
  },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("client overview widget", () => {
  it("renders a clear chart and accessible table from aggregated data", async () => {
    mocks.getEmployeeClientOverview.mockResolvedValue({ overview: populatedOverview });
    render(<ClientOverview />);

    expect(
      await screen.findByRole("heading", { name: "Distribution by company type" }),
    ).toBeTruthy();
    expect(screen.getByText("Client percentage by structured company type")).toBeTruthy();
    const table = screen.getByRole("table", {
      name: "Accessible client distribution by company type",
    });
    expect(table).toBeTruthy();
    expect(screen.getAllByText("Technology").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/75\.0%/u).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("100.0%")).toBeTruthy();
  });

  it("shows the empty state when the complete client denominator is zero", async () => {
    mocks.getEmployeeClientOverview.mockResolvedValue({
      overview: {
        generatedAt: 1_800_000_000,
        companyTypeDistribution: {
          totalClients: 0,
          classifiedClients: 0,
          unclassifiedClients: 0,
          items: [],
        },
      },
    });
    render(<ClientOverview />);
    expect(await screen.findByText("No client accounts")).toBeTruthy();
  });

  it("shows a recoverable error state and retries", async () => {
    const user = userEvent.setup();
    mocks.getEmployeeClientOverview
      .mockRejectedValueOnce(new Error("Database unavailable"))
      .mockResolvedValueOnce({ overview: populatedOverview });
    render(<ClientOverview />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Retry overview" }));
    expect(
      await screen.findByRole("heading", { name: "Distribution by company type" }),
    ).toBeTruthy();
    expect(mocks.getEmployeeClientOverview).toHaveBeenCalledTimes(2);
  });
});
