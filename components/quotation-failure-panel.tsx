import type { QuotationIssue } from "@/lib/shared/contracts";
import { useRewriteI18n } from "@/lib/client/rewrite-i18n";

interface QuotationFailurePanelProps {
  issues: QuotationIssue[];
  candidateText?: string;
  attempts?: number;
  busy: boolean;
  onRetry: () => void;
}

export function QuotationFailurePanel({
  issues,
  candidateText,
  attempts,
  busy,
  onRetry,
}: QuotationFailurePanelProps) {
  const { locale, t } = useRewriteI18n();
  const problemLabels: Record<QuotationIssue["kind"], string> = {
    modified: t("quotationModified"),
    omitted: t("quotationOmitted"),
    split: t("quotationSplit"),
    merged: t("quotationMerged"),
    punctuation_changed: t("quotationPunctuation"),
  };
  const differenceLabels: Record<QuotationIssue["kind"], string> = {
    modified: t("quotationDifferenceModified"),
    omitted: t("quotationDifferenceOmitted"),
    split: t("quotationDifferenceSplit"),
    merged: t("quotationDifferenceMerged"),
    punctuation_changed: t("quotationDifferencePunctuation"),
  };
  const actionLabels: Record<QuotationIssue["kind"], string> = {
    modified: t("quotationActionModified"),
    omitted: t("quotationActionOmitted"),
    split: t("quotationActionSplit"),
    merged: t("quotationActionMerged"),
    punctuation_changed: t("quotationActionPunctuation"),
  };

  return (
    <section className="card quotation-failure-card" aria-labelledby="quotation-failure-title">
      <div className="section-kicker">
        <span>!</span>
        {t("quotationCheck")}
      </div>
      <h2 id="quotation-failure-title">{t("quotationCorrectionTitle")}</h2>
      <p>{t("quotationCorrectionBody")}{attempts ? ` ${t("quotationAttempts", { count: attempts })}` : ""}</p>

      <div className="quotation-issue-list">
        {issues.map((issue, index) => (
          <article className="quotation-issue" key={`${issue.sourceParagraph}-${index}`}>
            <h3>
              {t("paragraphProblem", {
                paragraph: issue.sourceParagraph,
                problem: problemLabels[issue.kind],
              })}
            </h3>
            <dl>
              <div>
                <dt>{t("original")}</dt>
                <dd>{issue.original}</dd>
              </div>
              <div>
                <dt>{t("rewrite")}</dt>
                <dd>{issue.rewrite ?? t("noQuotation")}</dd>
              </div>
              <div>
                <dt>{t("problem")}</dt>
                <dd>{locale === "en" ? issue.differenceSummary : differenceLabels[issue.kind]}</dd>
              </div>
              <div>
                <dt>{t("action")}</dt>
                <dd>{locale === "en" ? issue.action : actionLabels[issue.kind]}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      {candidateText ? (
        <div className="candidate-draft">
          <label htmlFor="quotation-candidate">{t("candidateLabel")}</label>
          <textarea id="quotation-candidate" value={candidateText} readOnly spellCheck={false} />
        </div>
      ) : null}

      <button className="button button-primary" type="button" onClick={onRetry} disabled={busy}>
        {t("retryRewrite")}
      </button>
    </section>
  );
}
