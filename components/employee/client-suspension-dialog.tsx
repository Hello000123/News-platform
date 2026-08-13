"use client";

import { useEffect, useState } from "react";

import {
  AuthRequestError,
  recoverClientAccount,
  suspendClientAccount,
} from "@/lib/client/auth-api";
import {
  CLIENT_SUSPENSION_REASON_MAX_LENGTH,
  clientSuspensionInputSchema,
  type AccountListUserView,
  type EmailDeliveryView,
} from "@/lib/shared/auth-contracts";

export function ClientSuspensionDialog({
  client,
  onCancel,
  onSuspended,
}: {
  client: AccountListUserView;
  onCancel: () => void;
  onSuspended: (result: { emailDelivery: EmailDeliveryView }) => void;
}) {
  const [stage, setStage] = useState<"reason" | "confirmation">("reason");
  const [reason, setReason] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, submitting]);

  function continueToConfirmation() {
    const parsed = clientSuspensionInputSchema.safeParse({ reason });
    if (!parsed.success) {
      setErrorMessage(
        parsed.error.issues[0]?.message ||
          "Enter a suspension reason before continuing.",
      );
      return;
    }
    setReason(parsed.data.reason);
    setErrorMessage("");
    setStage("confirmation");
  }

  async function confirmSuspension() {
    if (submitting) return;
    setSubmitting(true);
    setErrorMessage("");
    try {
      const result = await suspendClientAccount(client.id, { reason });
      onSuspended({ emailDelivery: result.emailDelivery });
    } catch (error) {
      setErrorMessage(
        error instanceof AuthRequestError
          ? error.message
          : "The client account could not be suspended. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="admin-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onCancel();
      }}
    >
      <section
        className="admin-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="suspend-account-heading"
        aria-describedby="suspend-account-description"
      >
        {stage === "reason" ? (
          <>
            <div>
              <div className="section-kicker">Client access</div>
              <h2 id="suspend-account-heading">Suspend client account?</h2>
              <p id="suspend-account-description">
                Suspending <strong>{client.fullName}</strong> ({client.email})
                will revoke every active session while keeping the account and
                all client data on the server.
              </p>
            </div>
            <div className="auth-field">
              <div className="auth-field-support">
                <label htmlFor="client-suspension-reason">
                  Suspension reason for the client
                </label>
                <span className="auth-character-count" aria-live="polite">
                  {reason.length.toLocaleString()} /{" "}
                  {CLIENT_SUSPENSION_REASON_MAX_LENGTH.toLocaleString()}
                </span>
              </div>
              <textarea
                id="client-suspension-reason"
                value={reason}
                maxLength={CLIENT_SUSPENSION_REASON_MAX_LENGTH}
                disabled={submitting}
                autoFocus
                aria-invalid={Boolean(errorMessage)}
                aria-describedby="client-suspension-help client-suspension-error"
                onChange={(event) => {
                  setReason(event.target.value);
                  setErrorMessage("");
                }}
              />
              <p id="client-suspension-help" className="auth-field-help">
                This exact reason will be included in the email sent to the client.
              </p>
              {errorMessage ? (
                <p
                  id="client-suspension-error"
                  className="auth-field-error"
                  role="alert"
                >
                  {errorMessage}
                </p>
              ) : null}
            </div>
            <div className="admin-dialog-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={onCancel}
              >
                Cancel
              </button>
              <button
                className="button button-warning"
                type="button"
                onClick={continueToConfirmation}
              >
                Review suspension
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <div className="section-kicker">Final confirmation</div>
              <h2 id="suspend-account-heading">Confirm account suspension</h2>
              <p id="suspend-account-description">
                Confirm the email message below before suspending{" "}
                <strong>{client.fullName}</strong>.
              </p>
            </div>
            <div className="admin-removal-message-preview">
              <strong>Message to client</strong>
              <p>{reason}</p>
            </div>
            {errorMessage ? (
              <div className="auth-alert auth-alert-error" role="alert">
                {errorMessage}
              </div>
            ) : null}
            <div className="admin-dialog-actions">
              <button
                className="button button-secondary"
                type="button"
                disabled={submitting}
                onClick={() => {
                  setErrorMessage("");
                  setStage("reason");
                }}
              >
                Back
              </button>
              <button
                className="button button-warning"
                type="button"
                disabled={submitting}
                onClick={() => void confirmSuspension()}
              >
                {submitting ? "Suspending account…" : "Final confirm suspension"}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export function ClientRecoveryDialog({
  client,
  onCancel,
  onRecovered,
}: {
  client: AccountListUserView;
  onCancel: () => void;
  onRecovered: () => void;
}) {
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const suspensionType =
    client.manualSuspension && client.aiSuspension
      ? "manual and automatic suspensions"
      : client.manualSuspension
        ? "manual suspension"
        : "automatic AI usage suspension";

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, submitting]);

  async function confirmRecovery() {
    if (submitting) return;
    setSubmitting(true);
    setErrorMessage("");
    try {
      await recoverClientAccount(client.id);
      onRecovered();
    } catch (error) {
      setErrorMessage(
        error instanceof AuthRequestError
          ? error.message
          : "The client account could not be recovered. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="admin-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onCancel();
      }}
    >
      <section
        className="admin-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recover-account-heading"
        aria-describedby="recover-account-description"
      >
        <div>
          <div className="section-kicker">Client access</div>
          <h2 id="recover-account-heading">Recover client account?</h2>
          <p id="recover-account-description">
            This single confirmation clears the {suspensionType} for{" "}
            <strong>{client.fullName}</strong>. The client can sign in again
            with the existing password.
          </p>
        </div>
        {errorMessage ? (
          <div className="auth-alert auth-alert-error" role="alert">
            {errorMessage}
          </div>
        ) : null}
        <div className="admin-dialog-actions">
          <button
            className="button button-secondary"
            type="button"
            disabled={submitting}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="button button-primary"
            type="button"
            disabled={submitting}
            onClick={() => void confirmRecovery()}
          >
            {submitting ? "Recovering account…" : "Confirm recovery"}
          </button>
        </div>
      </section>
    </div>
  );
}
