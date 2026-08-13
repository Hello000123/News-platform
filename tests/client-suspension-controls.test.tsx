// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ClientRecoveryDialog,
  ClientSuspensionDialog,
} from "@/components/employee/client-suspension-dialog";
import type { AccountListUserView } from "@/lib/shared/auth-contracts";

const mocks = vi.hoisted(() => ({
  suspendClientAccount: vi.fn(),
  recoverClientAccount: vi.fn(),
}));

vi.mock("@/lib/client/auth-api", () => ({
  AuthRequestError: class AuthRequestError extends Error {
    code = "TEST_ERROR";
    fieldErrors = undefined;
  },
  suspendClientAccount: mocks.suspendClientAccount,
  recoverClientAccount: mocks.recoverClientAccount,
}));

function client(
  overrides: Partial<AccountListUserView> = {},
): AccountListUserView {
  return {
    id: "client-1",
    email: "client@example.test",
    fullName: "Example Client",
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
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("client suspension and recovery dialogs", () => {
  it("requires a reason, previews the exact email message, then suspends", async () => {
    const user = userEvent.setup();
    const onSuspended = vi.fn();
    mocks.suspendClientAccount.mockResolvedValue({
      account: client(),
      audit: {},
      emailDelivery: { status: "preview" },
    });
    render(
      <ClientSuspensionDialog
        client={client()}
        onCancel={vi.fn()}
        onSuspended={onSuspended}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Review suspension" }));
    expect(
      await screen.findByText("Enter a suspension reason before continuing."),
    ).toBeTruthy();

    const reason = "Ownership review is in progress.\nContact the administrator.";
    await user.type(screen.getByLabelText("Suspension reason for the client"), reason);
    await user.click(screen.getByRole("button", { name: "Review suspension" }));

    expect(screen.getByRole("heading", { name: "Confirm account suspension" })).toBeTruthy();
    expect(screen.getByText("Message to client").parentElement?.textContent).toContain(
      reason,
    );
    expect(mocks.suspendClientAccount).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Final confirm suspension" }),
    );

    await waitFor(() => {
      expect(mocks.suspendClientAccount).toHaveBeenCalledWith("client-1", {
        reason,
      });
      expect(onSuspended).toHaveBeenCalledWith({
        emailDelivery: { status: "preview" },
      });
    });
  });

  it("recovers a manual suspension with one confirmation", async () => {
    const user = userEvent.setup();
    const onRecovered = vi.fn();
    mocks.recoverClientAccount.mockResolvedValue({ account: client(), audit: {} });
    render(
      <ClientRecoveryDialog
        client={client({
          manualSuspension: {
            startedAt: 1_800_000_000,
            reason: "Ownership review",
            suspendedBy: null,
          },
        })}
        onCancel={vi.fn()}
        onRecovered={onRecovered}
      />,
    );

    expect(screen.getByText(/clears the manual suspension/u)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Confirm recovery" }));

    await waitFor(() => {
      expect(mocks.recoverClientAccount).toHaveBeenCalledWith("client-1");
      expect(onRecovered).toHaveBeenCalledOnce();
    });
  });
});
