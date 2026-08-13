// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountRequestForm } from "@/components/auth/account-request-form";
import { LoginForm } from "@/components/auth/login-form";
import { PasswordSetupForm } from "@/components/auth/password-setup-form";
import { ApprovalDashboard } from "@/components/employee/approval-dashboard";
import { EmployeeRequestDetails } from "@/components/employee/request-details";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  listEmployeeAccountRequests: vi.fn(),
  listEmployeeAccounts: vi.fn(),
  getEmployeeAgentUsageThresholds: vi.fn(),
  updateEmployeeAgentUsageThresholds: vi.fn(),
  listEmployeeClientSummaryTargets: vi.fn(),
  generateEmployeeClientSummary: vi.fn(),
  getEmployeeClientOverview: vi.fn(),
  removeClientAccount: vi.fn(),
  suspendClientAccount: vi.fn(),
  recoverClientAccount: vi.fn(),
  submitAccountRequest: vi.fn(),
  decideAccountRequest: vi.fn(),
  resendSetupEmail: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("@/lib/client/auth-api", () => ({
  AuthRequestError: class AuthRequestError extends Error {
    code = "TEST_ERROR";
    fieldErrors = undefined;
  },
  login: vi.fn(),
  setupPassword: vi.fn(),
  submitAccountRequest: mocks.submitAccountRequest,
  listEmployeeAccountRequests: mocks.listEmployeeAccountRequests,
  listEmployeeAccounts: mocks.listEmployeeAccounts,
  getEmployeeAgentUsageThresholds: mocks.getEmployeeAgentUsageThresholds,
  updateEmployeeAgentUsageThresholds: mocks.updateEmployeeAgentUsageThresholds,
  listEmployeeClientSummaryTargets: mocks.listEmployeeClientSummaryTargets,
  generateEmployeeClientSummary: mocks.generateEmployeeClientSummary,
  getEmployeeClientOverview: mocks.getEmployeeClientOverview,
  removeClientAccount: mocks.removeClientAccount,
  suspendClientAccount: mocks.suspendClientAccount,
  recoverClientAccount: mocks.recoverClientAccount,
  decideAccountRequest: mocks.decideAccountRequest,
  resendSetupEmail: mocks.resendSetupEmail,
}));

const thresholdRules = [
  { period: "last_15_minutes", label: "Last 15 minutes" },
  { period: "last_1_hour", label: "Last 1 hour" },
  { period: "last_6_hours", label: "Last 6 hours" },
  { period: "last_12_hours", label: "Last 12 hours" },
  { period: "last_24_hours", label: "Last 24 hours" },
].map((rule) => ({
  ...rule,
  enabled: false,
  threshold: 100,
  suspensionHours: 6,
  updatedAt: 1_800_000_000,
  updatedBy: null,
}));

beforeEach(() => {
  mocks.getEmployeeClientOverview.mockResolvedValue({
    overview: {
      generatedAt: 1_800_000_000,
      companyTypeDistribution: {
        totalClients: 1,
        classifiedClients: 0,
        unclassifiedClients: 1,
        items: [
          {
            companyType: "Unknown / Unclassified",
            clientCount: 1,
            percentage: 100,
            isUnclassified: true,
          },
        ],
      },
    },
  });
  mocks.listEmployeeClientSummaryTargets.mockResolvedValue({ clients: [] });
  mocks.generateEmployeeClientSummary.mockResolvedValue({ summary: {} });
  mocks.getEmployeeAgentUsageThresholds.mockResolvedValue({
    rules: thresholdRules.map((rule) => ({ ...rule })),
  });
  mocks.updateEmployeeAgentUsageThresholds.mockImplementation(
    async ({
      rules,
    }: {
      rules: Array<{
        period: string;
        enabled: boolean;
        threshold: number;
        suspensionHours: number;
      }>;
    }) => ({
      rules: thresholdRules.map((rule) => ({
        ...rule,
        ...rules.find(({ period }) => period === rule.period),
      })),
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("password visibility controls", () => {
  it("keeps the login password hidden by default and preserves it while toggling", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    const password = screen.getByLabelText("Password") as HTMLInputElement;

    expect(password.type).toBe("password");
    await user.type(password, "Keep-This-Password-42!");
    const toggle = screen.getByRole("button", { name: "Show password" });
    toggle.focus();
    await user.keyboard("{Enter}");

    expect(password.type).toBe("text");
    expect(password.value).toBe("Keep-This-Password-42!");
    expect(
      screen.getByRole("button", { name: "Hide password" }).getAttribute("aria-pressed"),
    ).toBe("true");

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password.type).toBe("password");
    expect(password.value).toBe("Keep-This-Password-42!");
  });

  it("provides independent controls for new and confirm password fields", async () => {
    const user = userEvent.setup();
    render(
      <PasswordSetupForm
        email="applicant@example.test"
        token="a-valid-looking-setup-token-that-is-long-enough"
        derivation={{
          algorithm: "scrypt",
          salt: "AAAAAAAAAAAAAAAAAAAAAA",
          cost: 32_768,
          blockSize: 8,
          parallelization: 3,
          keyLength: 32,
        }}
      />,
    );
    const newPassword = screen.getByLabelText("New password") as HTMLInputElement;
    const confirmation = screen.getByLabelText("Confirm password") as HTMLInputElement;
    await user.type(newPassword, "New-Password-For-Test-42!");
    await user.type(confirmation, "New-Password-For-Test-42!");

    const toggles = screen.getAllByRole("button", { name: "Show password" });
    await user.click(toggles[0]);
    expect(newPassword.type).toBe("text");
    expect(confirmation.type).toBe("password");
    expect(newPassword.value).toBe("New-Password-For-Test-42!");
    expect(confirmation.value).toBe("New-Password-For-Test-42!");
  });
});

describe("account request and employee summary UI", () => {
  it("marks organisation fields optional and counts the administrator message", async () => {
    const user = userEvent.setup();
    render(<AccountRequestForm />);

    expect((screen.getByLabelText(/Full name/u) as HTMLInputElement).required).toBe(true);
    expect(
      (screen.getByLabelText("Company or organisation name") as HTMLInputElement).required,
    ).toBe(false);
    expect((screen.getByLabelText("Department") as HTMLInputElement).required).toBe(false);
    expect((screen.getByLabelText("Job title") as HTMLInputElement).required).toBe(false);

    const message = screen.getByLabelText("Message to administrator");
    await user.type(message, "Review context");
    expect(screen.getByText("14 / 1,000")).toBeTruthy();
    expect(message).toHaveProperty("maxLength", 1_000);
    expect(screen.queryByText(/verification code/iu)).toBeNull();
    expect(screen.queryByRole("button", { name: /resend verification/iu })).toBeNull();
  });

  it("validates, displays, and removes optional supporting documents", async () => {
    const user = userEvent.setup();
    render(<AccountRequestForm />);
    const input = document.querySelector("#account-attachment") as HTMLInputElement;

    fireEvent.change(input, {
      target: {
        files: [
          new File(["not supported"], "notes.txt", { type: "text/plain" }),
        ],
      },
    });
    expect(await screen.findByText(/Unsupported file format/u)).toBeTruthy();
    expect(screen.queryByText("notes.txt")).toBeNull();

    const documentFile = new File(["document"], "application.pdf", {
      type: "application/pdf",
    });
    const secondDocument = new File(["second"], "company.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(input, {
      target: { files: [documentFile, secondDocument] },
    });
    expect(input.multiple).toBe(true);
    expect(screen.getByText("application.pdf")).toBeTruthy();
    expect(screen.getByText("company.pdf")).toBeTruthy();
    expect(screen.getByText(/2 files selected/u)).toBeTruthy();
    expect(screen.getAllByText("Ready to upload")).toHaveLength(2);
    await user.click(
      screen.getByRole("button", { name: "Remove application.pdf" }),
    );
    expect(screen.queryByText("application.pdf")).toBeNull();
    expect(screen.getByText(/1 file selected/u)).toBeTruthy();
  });

  it("rejects an addition above the combined limit and accepts it after removal", async () => {
    const user = userEvent.setup();
    render(<AccountRequestForm />);
    const input = document.querySelector("#account-attachment") as HTMLInputElement;
    const sixMegabytes = new File(
      [new Uint8Array(6 * 1024 * 1024)],
      "six.pdf",
      { type: "application/pdf" },
    );
    const fiveMegabytes = new File(
      [new Uint8Array(5 * 1024 * 1024)],
      "five.pdf",
      { type: "application/pdf" },
    );

    fireEvent.change(input, { target: { files: [sixMegabytes] } });
    fireEvent.change(input, { target: { files: [fiveMegabytes] } });
    expect(await screen.findByText(/combined size.*cannot exceed.*10 MB/iu)).toBeTruthy();
    expect(screen.queryByText("five.pdf")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Remove six.pdf" }));
    fireEvent.change(input, { target: { files: [fiveMegabytes] } });
    expect(screen.getByText("five.pdf")).toBeTruthy();
    expect(screen.getByText(/Combined size 5 MB \/ 10 MB/u)).toBeTruthy();
  });

  it("renders separate employee and client role totals", async () => {
    mocks.listEmployeeAccountRequests.mockResolvedValue({
      requests: [],
      summary: { employeeAccounts: 4, clientAccounts: 7 },
    });
    render(<ApprovalDashboard />);

    expect(await screen.findByText("Employee accounts")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("Client accounts")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
  });

  it("shows separate account tabs and requires two-step confirmation to remove a client", async () => {
    const user = userEvent.setup();
    mocks.listEmployeeAccountRequests.mockResolvedValue({
      requests: [],
      summary: { employeeAccounts: 1, clientAccounts: 1 },
    });
    mocks.listEmployeeAccounts.mockResolvedValue({
      accounts: [
        {
          id: "client-1",
          email: "client@example.test",
          fullName: "Client Person",
          role: "client",
          status: "active",
          createdAt: 1,
          reviewRequestCount: 12,
          rewriteRequestCount: 34,
          periodRequestCount: 46,
          periodReviewRequestCount: 12,
          periodRewriteRequestCount: 34,
        },
      ],
      summary: { employeeAccounts: 1, clientAccounts: 1 },
      usagePeriod: {
        period: "lifetime",
        label: "Lifetime",
        startAt: null,
        endAt: 1_800_000_000,
        timeZone: "Asia/Hong_Kong",
        trackingStartedAt: 1_700_000_000,
        isComplete: true,
      },
    });
    mocks.removeClientAccount.mockResolvedValue({
      removedAccount: {
        id: "client-1",
        email: "client@example.test",
        fullName: "Client Person",
        role: "client",
        status: "active",
        createdAt: 1,
      },
      audit: {},
      emailDelivery: { status: "preview" },
    });

    render(<ApprovalDashboard />);
    expect(await screen.findByRole("tab", { name: "Account Approval" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Client Accounts" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Employee Accounts" })).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Client Accounts" }));
    expect(await screen.findByText("Client Person")).toBeTruthy();
    expect(screen.getByText("client@example.test")).toBeTruthy();
    expect(screen.getByLabelText("AI usage period")).toHaveProperty("value", "lifetime");
    expect(screen.getByText("Selected period: Lifetime")).toBeTruthy();
    expect(screen.getByText("46")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("34")).toBeTruthy();
    expect(mocks.listEmployeeAccounts).toHaveBeenCalledWith("client", "lifetime");
    await user.click(screen.getByRole("button", { name: "Remove account" }));

    expect(screen.getByRole("dialog").textContent).toContain(
      "This will revoke the client's access",
    );
    await user.click(screen.getByRole("button", { name: "Review removal" }));
    expect(
      screen.getByText("Enter a removal message before continuing."),
    ).toBeTruthy();
    expect(mocks.removeClientAccount).not.toHaveBeenCalled();

    await user.type(
      screen.getByLabelText("Removal reason or message"),
      "Access is no longer required.",
    );
    await user.click(screen.getByRole("button", { name: "Review removal" }));
    expect(
      screen.getByRole("heading", { name: "Confirm account removal" }),
    ).toBeTruthy();
    expect(mocks.removeClientAccount).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Final confirm removal" }),
    );
    expect(mocks.removeClientAccount).toHaveBeenCalledWith("client-1", {
      message: "Access is no longer required.",
    });
    expect(
      await screen.findByText(/Email preview mode recorded the notification/iu),
    ).toBeTruthy();
  });

  it("shows Client Overview as an independent top-level admin tab", async () => {
    render(<ApprovalDashboard initialTab="client-overview" />);

    const overviewTab = screen.getByRole("tab", { name: "Client Overview" });
    expect(overviewTab.getAttribute("aria-selected")).toBe("true");
    expect(
      await screen.findByRole("heading", { name: "Distribution by company type" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("table", {
        name: "Accessible client distribution by company type",
      }),
    ).toBeTruthy();
    expect(mocks.getEmployeeClientOverview).toHaveBeenCalledTimes(1);
  });

  it("reloads backend-aggregated client usage for the selected period", async () => {
    const user = userEvent.setup();
    mocks.listEmployeeAccountRequests.mockResolvedValue({
      requests: [],
      summary: { employeeAccounts: 1, clientAccounts: 1 },
    });
    mocks.listEmployeeAccounts.mockImplementation(
      async (_role: "client" | "employee", period: string) => ({
        accounts: [
          {
            id: "client-period",
            email: "period@example.test",
            fullName: "Period Client",
            role: "client",
            status: "active",
            createdAt: 1,
            reviewRequestCount: 30,
            rewriteRequestCount: 16,
            periodRequestCount: period === "last_15_minutes" ? 5 : 46,
            periodReviewRequestCount: period === "last_15_minutes" ? 3 : 30,
            periodRewriteRequestCount: period === "last_15_minutes" ? 2 : 16,
          },
        ],
        summary: { employeeAccounts: 1, clientAccounts: 1 },
        usagePeriod: {
          period,
          label: period === "last_15_minutes" ? "Last 15 minutes" : "Lifetime",
          startAt: period === "last_15_minutes" ? 1_799_999_100 : null,
          endAt: 1_800_000_000,
          timeZone: "Asia/Hong_Kong",
          trackingStartedAt: 1_799_999_700,
          isComplete: period === "lifetime",
        },
      }),
    );

    render(<ApprovalDashboard />);
    await user.click(await screen.findByRole("tab", { name: "Client Accounts" }));
    expect(await screen.findByText("Period Client")).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("AI usage period"), "last_15_minutes");

    expect(await screen.findByText("Selected period: Last 15 minutes")).toBeTruthy();
    expect(screen.getByText(/Partial period data:/u).textContent).toContain(
      "Earlier requests in this period cannot be reconstructed",
    );
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("Lifetime total")).toBeTruthy();
    expect(screen.getByText("46")).toBeTruthy();
    await waitFor(() => {
      expect(mocks.listEmployeeAccounts).toHaveBeenCalledWith(
        "client",
        "last_15_minutes",
      );
    });
  });

  it("edits independent suspension thresholds and shows an active client expiry", async () => {
    const user = userEvent.setup();
    mocks.listEmployeeAccountRequests.mockResolvedValue({
      requests: [],
      summary: { employeeAccounts: 1, clientAccounts: 1 },
    });
    mocks.listEmployeeAccounts.mockResolvedValue({
      accounts: [
        {
          id: "client-suspended",
          email: "suspended@example.test",
          fullName: "Suspended Client",
          role: "client",
          status: "active",
          createdAt: 1,
          reviewRequestCount: 3,
          rewriteRequestCount: 1,
          periodRequestCount: 4,
          periodReviewRequestCount: 3,
          periodRewriteRequestCount: 1,
          aiSuspension: {
            id: "suspension-1",
            startedAt: 1_800_000_000,
            expiresAt: 1_800_021_600,
            triggeredPeriod: "last_15_minutes",
            periodLabel: "Last 15 minutes",
            configuredThreshold: 3,
            observedRequestCount: 4,
          },
          manualSuspension: null,
        },
      ],
      summary: { employeeAccounts: 1, clientAccounts: 1 },
      usagePeriod: {
        period: "lifetime",
        label: "Lifetime",
        startAt: null,
        endAt: 1_800_000_000,
        timeZone: "Asia/Hong_Kong",
        trackingStartedAt: 1_700_000_000,
        isComplete: true,
      },
    });

    render(<ApprovalDashboard />);
    await user.click(await screen.findByRole("tab", { name: "Client Accounts" }));

    expect(
      await screen.findByRole("heading", { name: "Automatic AI usage suspension" }),
    ).toBeTruthy();
    expect(screen.getAllByRole("spinbutton")).toHaveLength(10);
    expect(screen.getByText("Account automatically suspended")).toBeTruthy();
    expect(screen.getByText(/Automatically recovers/u).textContent).toMatch(
      /HKT|GMT\+8/u,
    );
    expect(screen.getByText(/4 AI requests in Last 15 minutes/u)).toBeTruthy();
    const recoverButton = screen.getByRole("button", { name: "Recover account" });
    const removeButton = screen.getByRole("button", { name: "Remove account" });
    expect(recoverButton.parentElement?.firstElementChild).toBe(recoverButton);
    expect(recoverButton.parentElement).toBe(removeButton.parentElement);

    await user.click(screen.getAllByRole("checkbox")[0]);
    const firstThreshold = document.querySelector(
      "#agent-threshold-last_15_minutes",
    ) as HTMLInputElement;
    await user.clear(firstThreshold);
    await user.type(firstThreshold, "3");
    const firstSuspensionTime = document.querySelector(
      "#agent-suspension-hours-last_15_minutes",
    ) as HTMLInputElement;
    await user.clear(firstSuspensionTime);
    await user.type(firstSuspensionTime, "1.25");
    await user.click(screen.getByRole("button", { name: "Save thresholds" }));

    expect(mocks.updateEmployeeAgentUsageThresholds).toHaveBeenCalledWith({
      rules: expect.arrayContaining([
        {
          period: "last_15_minutes",
          enabled: true,
          threshold: 3,
          suspensionHours: 1.25,
        },
      ]),
    });
    expect(
      await screen.findByText("Automatic AI usage suspension thresholds were saved."),
    ).toBeTruthy();
  });

  it("links client names to details and reports partial batch-summary completion", async () => {
    const user = userEvent.setup();
    mocks.listEmployeeAccounts.mockResolvedValue({
      accounts: [
        {
          id: "client-one",
          email: "one@example.test",
          fullName: "Client One",
          role: "client",
          status: "active",
          createdAt: 1,
          reviewRequestCount: 0,
          rewriteRequestCount: 0,
          periodRequestCount: 0,
          periodReviewRequestCount: 0,
          periodRewriteRequestCount: 0,
          aiSuspension: null,
          manualSuspension: null,
        },
        {
          id: "client-two",
          email: "two@example.test",
          fullName: "Client Two",
          role: "client",
          status: "active",
          createdAt: 1,
          reviewRequestCount: 0,
          rewriteRequestCount: 0,
          periodRequestCount: 0,
          periodReviewRequestCount: 0,
          periodRewriteRequestCount: 0,
          aiSuspension: null,
          manualSuspension: null,
        },
      ],
      summary: { employeeAccounts: 1, clientAccounts: 2 },
      usagePeriod: {
        period: "lifetime",
        label: "Lifetime",
        startAt: null,
        endAt: 1_800_000_000,
        timeZone: "Asia/Hong_Kong",
        trackingStartedAt: 1_700_000_000,
        isComplete: true,
      },
    });
    mocks.listEmployeeClientSummaryTargets.mockResolvedValue({
      clients: [
        { id: "client-one", fullName: "Client One", hasSummary: false },
        { id: "client-two", fullName: "Client Two", hasSummary: true },
      ],
    });
    mocks.generateEmployeeClientSummary
      .mockResolvedValueOnce({ summary: {} })
      .mockRejectedValueOnce(new Error("Provider timeout"));

    render(<ApprovalDashboard initialTab="clients" />);

    const clientLink = await screen.findByRole("link", { name: "Client One" });
    expect(clientLink.getAttribute("href")).toBe("/employee/clients/client-one");
    await user.click(
      screen.getByRole("button", { name: "Generate All Client Summaries" }),
    );

    expect(
      await screen.findByText("1 of 2 summaries completed; 1 failed."),
    ).toBeTruthy();
    expect(screen.getByText(/Client Two:/u)).toBeTruthy();
    expect(mocks.generateEmployeeClientSummary.mock.calls.map(([id]) => id)).toEqual([
      "client-one",
      "client-two",
    ]);
  });

  it("cancels client removal without calling the API", async () => {
    const user = userEvent.setup();
    mocks.listEmployeeAccountRequests.mockResolvedValue({
      requests: [],
      summary: { employeeAccounts: 1, clientAccounts: 1 },
    });
    mocks.listEmployeeAccounts.mockResolvedValue({
      accounts: [
        {
          id: "client-cancel",
          email: "cancel@example.test",
          fullName: "Cancel Client",
          role: "client",
          status: "active",
          createdAt: 1,
          reviewRequestCount: 0,
          rewriteRequestCount: 0,
          periodRequestCount: 0,
          periodReviewRequestCount: 0,
          periodRewriteRequestCount: 0,
        },
      ],
      summary: { employeeAccounts: 1, clientAccounts: 1 },
      usagePeriod: {
        period: "lifetime",
        label: "Lifetime",
        startAt: null,
        endAt: 1_800_000_000,
        timeZone: "Asia/Hong_Kong",
        trackingStartedAt: 1_700_000_000,
        isComplete: true,
      },
    });
    render(<ApprovalDashboard />);
    await user.click(await screen.findByRole("tab", { name: "Client Accounts" }));
    await user.click(await screen.findByRole("button", { name: "Remove account" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.removeClientAccount).not.toHaveBeenCalled();
  });

  it("shows employee names and emails without an employee-removal action", async () => {
    const user = userEvent.setup();
    mocks.listEmployeeAccountRequests.mockResolvedValue({
      requests: [],
      summary: { employeeAccounts: 1, clientAccounts: 0 },
    });
    mocks.listEmployeeAccounts.mockResolvedValue({
      accounts: [
        {
          id: "employee-1",
          email: "employee@example.test",
          fullName: "Employee Person",
          role: "employee",
          status: "active",
          createdAt: 1,
        },
      ],
      summary: { employeeAccounts: 1, clientAccounts: 0 },
    });

    render(<ApprovalDashboard />);
    await user.click(
      await screen.findByRole("tab", { name: "Employee Accounts" }),
    );
    expect(await screen.findByText("Employee Person")).toBeTruthy();
    expect(screen.getByText("employee@example.test")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Remove account" }),
    ).toBeNull();
  });

  it("renders employee timestamps in a fixed Hong Kong time zone", () => {
    render(
      <EmployeeRequestDetails
        initialRequest={{
          id: "request-time-zone",
          fullName: "Time Zone Applicant",
          email: "timezone@example.test",
          phone: "+852 2345 6789",
          company: null,
          department: null,
          jobTitle: null,
          adminMessage: null,
          attachments: [],
          attachment: null,
          status: "pending",
          createdAt: Date.UTC(2026, 0, 1, 0, 0) / 1_000,
          updatedAt: Date.UTC(2026, 0, 1, 0, 0) / 1_000,
          decidedAt: null,
          rejectionReason: null,
          decidedBy: null,
        }}
      />,
    );

    expect(screen.getAllByText("1 Jan 2026, 8:00 am")).toHaveLength(2);
  });
});
