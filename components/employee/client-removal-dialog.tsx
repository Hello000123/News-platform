"use client";

import { useEffect, useState } from "react";

import {
  AuthRequestError,
  removeClientAccount,
} from "@/lib/client/auth-api";
import {
  CLIENT_REMOVAL_MESSAGE_MAX_LENGTH,
  clientRemovalInputSchema,
  type AccountListUserView,
  type EmailDeliveryView,
} from "@/lib/shared/auth-contracts";

export function ClientRemovalDialog({
  client,
  onCancel,
  onRemoved,
}: {
  client: AccountListUserView;
  onCancel: () => void;
  onRemoved: (result: {
    emailDelivery: EmailDeliveryView;
  }) => void;
}) {
  const [stage, setStage] = useState<"message" | "confirmation">("message");
  const [message, setMessage] = useState("");
  const [confirmationName, setConfirmationName] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const confirmationMatches =
    confirmationName.normalize("NFC") === client.fullName.normalize("NFC");

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, submitting]);

  function continueToConfirmation() {
    const parsed = clientRemovalInputSchema.safeParse({
      message,
      confirmationName: client.fullName,
    });
    if (!parsed.success) {
      setErrorMessage(
        parsed.error.issues[0]?.message ||
          "Enter a removal message before continuing.",
      );
      return;
    }
    setMessage(parsed.data.message);
    setErrorMessage("");
    setStage("confirmation");
  }

  async function confirmRemoval() {
    if (submitting) return;
    if (!confirmationMatches) {
      setErrorMessage("Type the client name exactly as shown to confirm removal.");
      return;
    }
    setSubmitting(true);
    setErrorMessage("");
    try {
      const result = await removeClientAccount(client.id, {
        message,
        confirmationName,
      });
      onRemoved({ emailDelivery: result.emailDelivery });
    } catch (error) {
      setErrorMessage(
        error instanceof AuthRequestError
          ? error.message
          : "The client account could not be removed. Please try again.",
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
        aria-labelledby="remove-account-heading"
        aria-describedby="remove-account-description"
      >
        {stage === "message" ? (
          <>
            <div>
              <div className="section-kicker">Client access</div>
              <h2 id="remove-account-heading">Remove client account?</h2>
              <p id="remove-account-description">
                You are removing <strong>{client.fullName}</strong>{" "}
                (<span>{client.email}</span>). This permanently deletes the
                account, sessions, usage, documents, and other client-owned data
                from the server. This cannot be undone.
              </p>
            </div>
            <div className="auth-field">
              <div className="auth-field-support">
                <label htmlFor="client-removal-message">
                  Removal reason or message
                </label>
                <span className="auth-character-count" aria-live="polite">
                  {message.length.toLocaleString()} /{" "}
                  {CLIENT_REMOVAL_MESSAGE_MAX_LENGTH.toLocaleString()}
                </span>
              </div>
              <textarea
                id="client-removal-message"
                value={message}
                maxLength={CLIENT_REMOVAL_MESSAGE_MAX_LENGTH}
                disabled={submitting}
                autoFocus
                aria-invalid={Boolean(errorMessage)}
                aria-describedby="client-removal-help client-removal-error"
                onChange={(event) => {
                  setMessage(event.target.value);
                  setErrorMessage("");
                }}
              />
              <p id="client-removal-help" className="auth-field-help">
                This message will be included in the email sent to the client.
              </p>
              {errorMessage ? (
                <p
                  id="client-removal-error"
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
                className="button button-danger"
                type="button"
                onClick={continueToConfirmation}
              >
                Review removal
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <div className="section-kicker">Final confirmation</div>
              <h2 id="remove-account-heading">Confirm account removal</h2>
              <p id="remove-account-description">
                Confirm that <strong>{client.fullName}</strong> ({client.email})
                and all related data should be permanently deleted.
              </p>
            </div>
            <div className="admin-removal-message-preview">
              <strong>Message to client</strong>
              <p>{message}</p>
            </div>
            <div className="admin-name-confirmation">
              <p>
                Type{" "}
                <span className="admin-confirmation-name">
                  <strong>{client.fullName}</strong>
                  <button
                    className="admin-copy-name-button"
                    type="button"
                    disabled={submitting}
                    aria-label="Copy client name"
                    onClick={() => {
                      setCopyStatus("");
                      if (!navigator.clipboard) {
                        setCopyStatus(
                          "Copy was unavailable. Select and copy the name manually.",
                        );
                        return;
                      }
                      void navigator.clipboard
                        .writeText(client.fullName)
                        .then(() => setCopyStatus("Client name copied."))
                        .catch(() =>
                          setCopyStatus(
                            "Copy was unavailable. Select and copy the name manually.",
                          ),
                        );
                    }}
                  >
                    Copy
                  </button>
                </span>{" "}
                to confirm permanent deletion.
              </p>
              <label htmlFor="client-removal-name-confirmation">
                Client name confirmation
              </label>
              <input
                id="client-removal-name-confirmation"
                type="text"
                value={confirmationName}
                autoComplete="off"
                spellCheck={false}
                disabled={submitting}
                aria-invalid={Boolean(confirmationName) && !confirmationMatches}
                onChange={(event) => {
                  setConfirmationName(event.target.value);
                  setErrorMessage("");
                }}
              />
              {copyStatus ? (
                <span className="auth-field-help" role="status">
                  {copyStatus}
                </span>
              ) : null}
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
                  setStage("message");
                }}
              >
                Back
              </button>
              <button
                className="button button-danger"
                type="button"
                disabled={submitting || !confirmationMatches}
                onClick={confirmRemoval}
              >
                {submitting ? "Removing account…" : "Final confirm removal"}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
