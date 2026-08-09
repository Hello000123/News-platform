"use client";

import { AccountBar } from "@/components/auth/account-bar";
import { PressReleaseWorkspace } from "@/components/press-release-workspace";
import {
  RewriteI18nProvider,
  useRewriteI18n,
} from "@/lib/client/rewrite-i18n";
import type { AuthenticatedUser } from "@/lib/shared/auth-contracts";
import type { SelectableModelId } from "@/lib/shared/models";

export function ReviewWorkspacePage({
  user,
  passScore,
  initialModel,
}: {
  user: AuthenticatedUser;
  passScore: number;
  initialModel: SelectableModelId;
}) {
  return (
    <RewriteI18nProvider>
      <LocalizedReviewWorkspacePage
        user={user}
        passScore={passScore}
        initialModel={initialModel}
      />
    </RewriteI18nProvider>
  );
}

function LocalizedReviewWorkspacePage({
  user,
  passScore,
  initialModel,
}: {
  user: AuthenticatedUser;
  passScore: number;
  initialModel: SelectableModelId;
}) {
  const { locale, t, toggleLocale } = useRewriteI18n();

  return (
    <div className="editorial-admin" lang={locale}>
      <AccountBar user={user} />
      <main>
        <div id="main-content" className="page-shell">
          <div className="review-language-row">
            <button
              className="review-language-switch"
              type="button"
              onClick={toggleLocale}
              aria-label={t("languageSwitchAria")}
            >
              <span aria-hidden="true">文/A</span>
              {t("languageSwitchText")}
            </button>
          </div>
          <section className="hero" aria-labelledby="page-title">
            <div className="eyebrow">{t("heroEyebrow")}</div>
            <h1 id="page-title">
              {t("heroTitlePrefix")} <span>{t("heroTitleHighlight")}</span>
            </h1>
            <p className="hero-copy">{t("heroCopy")}</p>

            <ol className="workflow-strip" aria-label={t("workflowLabel")}>
              <li>
                <span>1</span>
                <div>
                  <strong>{t("workflowAddTitle")}</strong>
                  <small>{t("workflowAddSubtitle")}</small>
                </div>
              </li>
              <li className="workflow-line" aria-hidden="true" />
              <li>
                <span>2</span>
                <div>
                  <strong>{t("workflowReviewTitle")}</strong>
                  <small>{t("workflowReviewSubtitle")}</small>
                </div>
              </li>
              <li className="workflow-line" aria-hidden="true" />
              <li>
                <span>3</span>
                <div>
                  <strong>{t("workflowChooseTitle")}</strong>
                  <small>{t("workflowChooseSubtitle")}</small>
                </div>
              </li>
            </ol>
          </section>

          <PressReleaseWorkspace initialPassScore={passScore} initialModel={initialModel} />

          <footer>
            <p>{t("footerAccuracy")}</p>
            <p>{t("footerSession")}</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
