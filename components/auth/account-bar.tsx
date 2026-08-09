"use client";

import Link from "next/link";

import { LogoutButton } from "@/components/auth/logout-button";
import { useRewriteI18n } from "@/lib/client/rewrite-i18n";
import type { AuthenticatedUser } from "@/lib/shared/auth-contracts";

export function AccountBar({ user }: { user: AuthenticatedUser }) {
  const { t } = useRewriteI18n();

  return (
    <header className="account-bar">
      <Link className="account-brand" href="/review">
        PressReady
      </Link>
      <nav aria-label={t("accountNavigation")}>
        <Link className="account-link" href="/">
          {t("newsSite")}
        </Link>
        <Link className="account-link" href="/pipeline">
          {t("newsPipeline")}
        </Link>
        {user.role === "employee" ? (
          <Link className="account-link" href="/employee">
            {t("adminPanel")}
          </Link>
        ) : null}
        <div className="account-identity">
          <strong>{user.fullName}</strong>
          <span>{user.email}</span>
        </div>
        <LogoutButton />
      </nav>
    </header>
  );
}
