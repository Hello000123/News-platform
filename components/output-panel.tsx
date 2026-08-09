"use client";

import { useState, type FormEvent, type RefObject } from "react";

import {
  MAX_REWRITE_INSTRUCTION_CHARS,
  type RewriteLengthOption,
  type RewriteRefinement,
} from "@/lib/shared/contracts";
import { useRewriteI18n } from "@/lib/client/rewrite-i18n";

interface OutputPanelProps {
  output: string;
  busy: boolean;
  copied: boolean;
  outputRef: RefObject<HTMLTextAreaElement | null>;
  onCopy: () => void;
  onRewriteAgain: (refinement: RewriteRefinement) => void;
  onEditInput: () => void;
  onStartNew: () => void;
}

export function OutputPanel({
  output,
  busy,
  copied,
  outputRef,
  onCopy,
  onRewriteAgain,
  onEditInput,
  onStartNew,
}: OutputPanelProps) {
  const { t } = useRewriteI18n();
  const [showRefinement, setShowRefinement] = useState(false);
  const [lengthOption, setLengthOption] = useState<RewriteLengthOption | null>(null);
  const [instruction, setInstruction] = useState("");

  function toggleLengthOption(option: RewriteLengthOption) {
    setLengthOption((current) => (current === option ? null : option));
  }

  function closeRefinement() {
    setShowRefinement(false);
    setLengthOption(null);
    setInstruction("");
  }

  function submitRefinement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onRewriteAgain({ lengthOption, instruction: instruction.trim() });
  }

  return (
    <section className="card output-card" aria-labelledby="output-title">
      <div className="output-heading-row">
        <div>
          <div className="section-kicker">
            <span>03</span>
            {t("finalOutput")}
          </div>
          <h2 id="output-title">{t("outputTitle")}</h2>
          <p>{t("outputHelp")}</p>
        </div>
        <span className="output-badge badge-ai">{t("aiRewritten")}</span>
      </div>

      <label className="sr-only" htmlFor="final-output">
        {t("finalTextLabel")}
      </label>
      <textarea
        id="final-output"
        ref={outputRef}
        className="output-textarea"
        value={output}
        readOnly
        spellCheck={false}
      />

      <div className="output-actions">
        <button className="button button-primary" type="button" onClick={onCopy} disabled={busy}>
          {copied ? t("copied") : t("copyToClipboard")}
        </button>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => setShowRefinement(true)}
          disabled={busy || showRefinement}
          aria-expanded={showRefinement}
          aria-controls="rewrite-refinement-controls"
        >
          {t("rewriteAgainWithAi")}
        </button>
        <button className="button button-quiet" type="button" onClick={onEditInput} disabled={busy}>
          {t("editDraftMyself")}
        </button>
        <button className="button button-quiet" type="button" onClick={onStartNew} disabled={busy}>
          {t("startNewDraft")}
        </button>
      </div>
      {showRefinement ? (
        <form
          id="rewrite-refinement-controls"
          className="rewrite-refinement"
          onSubmit={submitRefinement}
        >
          <div className="refinement-heading">
            <div>
              <h3>{t("refineNextRewrite")}</h3>
              <p>{t("refinementHelp")}</p>
            </div>
          </div>

          <span className="input-label" id="rewrite-length-label">
            {t("lengthAndDetail")} <span className="optional-label">{t("optional")}</span>
          </span>
          <div
            className="length-option-group"
            role="group"
            aria-labelledby="rewrite-length-label"
          >
            <button
              className="length-option"
              type="button"
              aria-pressed={lengthOption === "concise"}
              onClick={() => toggleLengthOption("concise")}
              disabled={busy}
            >
              {t("concise")}
            </button>
            <button
              className="length-option"
              type="button"
              aria-pressed={lengthOption === "more_detailed"}
              onClick={() => toggleLengthOption("more_detailed")}
              disabled={busy}
            >
              {t("moreDetailed")}
            </button>
          </div>

          <label className="input-label" htmlFor="rewrite-instructions">
            {t("improvementInstructions")} <span className="optional-label">{t("optional")}</span>
          </label>
          <textarea
            id="rewrite-instructions"
            className="refinement-instructions"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder={t("improvementPlaceholder")}
            maxLength={MAX_REWRITE_INSTRUCTION_CHARS}
            disabled={busy}
          />

          <div className="refinement-actions">
            <button className="button button-primary" type="submit" disabled={busy}>
              {t("rewriteAgain")}
            </button>
            <button
              className="button button-quiet"
              type="button"
              onClick={closeRefinement}
              disabled={busy}
            >
              {t("cancel")}
            </button>
          </div>
        </form>
      ) : null}
      <p className="copy-status" role="status" aria-live="polite">
        {copied ? t("copiedStatus") : ""}
      </p>
    </section>
  );
}
