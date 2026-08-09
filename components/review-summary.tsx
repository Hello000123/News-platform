"use client";

import type { CSSProperties } from "react";

import { useRewriteI18n } from "@/lib/client/rewrite-i18n";
import type { ReviewResult } from "@/lib/shared/contracts";

interface ReviewSummaryProps {
  review: ReviewResult;
  passScore: number;
  message: string;
  busy: boolean;
  reviewIsStale: boolean;
  onRewrite: () => void;
  onEditDraft: () => void;
}

interface ScoreItem {
  label: string;
  score: number;
}

function rounded(score: number) {
  return Math.round(score);
}

function FeedbackList({
  title,
  items,
  variant,
  emptyLabel,
}: {
  title: string;
  items: string[];
  variant: "positive" | "warning" | "neutral";
  emptyLabel: string;
}) {
  return (
    <section className={"feedback-block feedback-" + variant}>
      <div className="feedback-heading">
        <span className="feedback-marker" aria-hidden="true" />
        <h3>{title}</h3>
      </div>
      {items.length > 0 ? (
        <ul>
          {items.map((item, index) => (
            <li key={title + "-" + index}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="empty-feedback">{emptyLabel}</p>
      )}
    </section>
  );
}

export function ReviewSummary({
  review,
  passScore,
  message,
  busy,
  reviewIsStale,
  onRewrite,
  onEditDraft,
}: ReviewSummaryProps) {
  const { locale, t } = useRewriteI18n();
  const passed = review.decision === "PASS";
  const scores: ScoreItem[] = [
    { label: t("scoreContent"), score: review.factualCompletenessScore },
    { label: t("scoreStructure"), score: review.structureScore },
    { label: t("scoreClarity"), score: review.clarityScore },
    { label: t("scoreGrammar"), score: review.languageQualityScore },
    { label: t("scoreProfessional"), score: review.professionalismScore },
    { label: t("scoreAttribution"), score: review.attributionScore },
  ];
  const scoreReasons = [
    `${t("reasonContent")}: ${review.scoreReasons.factualCompleteness}`,
    `${t("reasonStructure")}: ${review.scoreReasons.structure}`,
    `${t("reasonClarity")}: ${review.scoreReasons.clarity}`,
    `${t("reasonGrammar")}: ${review.scoreReasons.languageQuality}`,
    `${t("reasonProfessional")}: ${review.scoreReasons.professionalism}`,
    `${t("reasonAttribution")}: ${review.scoreReasons.attribution}`,
  ];
  const findings = review.findings.map(
    ({ category, severity, issue, evidence, recommendation }) =>
      t("findingLine", { category, severity, issue, evidence, recommendation }),
  );
  const readinessLabel = {
    PUBLICATION_READY: t("publicationReady"),
    STRONG_LIMITED_EDITING: t("strongLimited"),
    SUBSTANTIAL_REWRITE: t("substantialRewrite"),
    WEAK: t("weakDraft"),
    SEVERELY_DEFICIENT: t("severelyDeficient"),
  }[review.readinessBand];
  const scoreStyle = { "--score": rounded(review.overallScore) + "%" } as CSSProperties;

  return (
    <section className="card review-card" aria-labelledby="review-title">
      <div className="section-kicker">
        <span>02</span>
        {t("reviewResult")}
      </div>

      {reviewIsStale ? (
        <div className="stale-review-note" id="stale-review-note" role="status">
          <span aria-hidden="true">!</span>
          <div>
            <strong>{t("staleReviewTitle")}</strong>
            <p>{t("staleReviewBody")}</p>
          </div>
        </div>
      ) : null}

      <div className={"decision-banner " + (passed ? "decision-pass" : "decision-rewrite")}>
        <div
          className="score-ring"
          style={scoreStyle}
          aria-label={t("scoreOutOf100", { score: rounded(review.overallScore) })}
        >
          <div className="score-ring-inner">
            <strong>{rounded(review.overallScore)}</strong>
            <span>/ 100</span>
          </div>
        </div>
        <div className="decision-copy">
          <div className="decision-label">
            <span className="status-dot" aria-hidden="true" />
            {passed ? t("passedReview") : t("belowThreshold")}
          </div>
          <h2 id="review-title">
            {passed ? t("reviewComplete") : t("changesRecommended")}
          </h2>
          <p>{locale === "en" ? message : t(passed ? "reviewMeetsMessage" : "reviewBelowMessage")}</p>
          <p className="readiness-note">{t("readiness")}: {readinessLabel}</p>
          <p className="threshold-note">{t("passThreshold")}: {passScore}/100</p>
          {review.appliedScoreCap !== null ? (
            <p className="threshold-note">
              {t("consistencyCap")}: {review.appliedScoreCap}/100 — {review.scoreCapReasons.join(" ")}
            </p>
          ) : null}
        </div>
        <div className="decision-actions">
          <button
            className="button button-primary"
            type="button"
            onClick={onRewrite}
            disabled={busy || reviewIsStale}
            aria-describedby={reviewIsStale ? "stale-review-note" : undefined}
          >
            {t("rewriteWithAi")}
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={onEditDraft}
            disabled={busy}
          >
            {t("editDraftMyself")}
          </button>
        </div>
      </div>

      <div className="score-grid" aria-label={t("categoryScores")}>
        {scores.map((item) => (
          <div className="score-tile" key={item.label}>
            <div className="score-tile-top">
              <span>{item.label}</span>
              <strong>{rounded(item.score)}</strong>
            </div>
            <div className="score-track" aria-hidden="true">
              <span style={{ width: rounded(item.score) + "%" }} />
            </div>
          </div>
        ))}
      </div>

      <div className="feedback-grid">
        <FeedbackList title={t("scoreRationale")} items={scoreReasons} variant="neutral" emptyLabel={t("noneIdentified")} />
        <FeedbackList title={t("strengths")} items={review.strengths} variant="positive" emptyLabel={t("noneIdentified")} />
        <FeedbackList title={t("findings")} items={findings} variant="warning" emptyLabel={t("noneIdentified")} />
        <FeedbackList
          title={t("missingInformation")}
          items={review.missingInformation}
          variant="warning"
          emptyLabel={t("noneIdentified")}
        />
        <FeedbackList
          title={t("recommendedImprovements")}
          items={review.recommendations}
          variant="neutral"
          emptyLabel={t("noneIdentified")}
        />
      </div>
    </section>
  );
}
