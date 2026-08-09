"use client";

import { useState } from "react";

import { AuthRequestError, logout } from "@/lib/client/auth-api";
import { useRewriteI18n } from "@/lib/client/rewrite-i18n";
import { clearRewriteSession } from "@/lib/client/rewrite-session";

export function LogoutButton() {
  const { t } = useRewriteI18n();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleLogout() {
    if (submitting) return;
    setSubmitting(true);
    setErrorMessage("");
    try {
      const result = await logout();
      clearRewriteSession();
      window.location.replace(result.redirectTo);
    } catch (error) {
      if (error instanceof AuthRequestError && error.status === 401) {
        clearRewriteSession();
        window.location.replace("/login");
        return;
      }
      setErrorMessage(t("logoutFailed"));
      setSubmitting(false);
    }
  }

  return (
    <div className="logout-control">
      <button
        className="button button-quiet account-logout"
        type="button"
        disabled={submitting}
        onClick={handleLogout}
      >
        {submitting ? t("loggingOut") : t("logout")}
      </button>
      {errorMessage ? <span role="alert">{errorMessage}</span> : null}
    </div>
  );
}
