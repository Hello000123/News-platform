"use client";

import { useEffect, useRef, useState } from "react";

import { OutputPanel } from "@/components/output-panel";
import { QuotationFailurePanel } from "@/components/quotation-failure-panel";
import { ReviewSummary } from "@/components/review-summary";
import {
  ApiRequestError,
  requestDirectRewrite,
  requestReview,
  requestRewrite,
} from "@/lib/client/api";
import { AuthRequestError } from "@/lib/client/auth-api";
import { requestFileExtraction } from "@/lib/client/file-api";
import {
  type RewriteLocale,
  type RewriteTranslator,
  useRewriteI18n,
} from "@/lib/client/rewrite-i18n";
import {
  clearRewriteSession,
  loadRewriteSession,
  saveRewriteSession,
  type CompletedRewriteTurn,
} from "@/lib/client/rewrite-session";
import {
  MAX_DRAFT_CHARS,
  MAX_REWRITE_HISTORY_ENTRIES,
  type EditorialInput,
  type QuotationIssue,
  type ReviewResult,
  type RewriteRefinement,
  type SourceSnapshot,
} from "@/lib/shared/contracts";
import {
  addUploadsWithinLimit,
  FILE_UPLOAD_ACCEPT,
  totalUploadBytes,
  validateUploadMetadata,
} from "@/lib/shared/file-upload";
import {
  DEFAULT_SELECTABLE_MODEL,
  SELECTABLE_MODELS,
  selectableModelById,
  type SelectableModelId,
} from "@/lib/shared/models";

type ProcessingState = "idle" | "reviewing" | "rewriting";

type DraftAttachmentState = {
  id: string;
  file: File;
  name: string;
  type: string;
  size: number;
  status: "selected" | "processing" | "awaiting-choice" | "added" | "error";
  error?: string;
  truncated?: boolean;
  content?: string;
};

type RewriteState =
  | { status: "idle" }
  | { status: "loading"; attemptId: number }
  | {
      status: "success";
      attemptId: number;
      text: string;
      validation: { status: "passed" | "passed_after_retry"; attempts: 1 | 2 | 3 };
    }
  | {
      status: "quotation-failed";
      attemptId: number;
      issues: QuotationIssue[];
      candidateText?: string;
      attempts?: number;
    };

interface VisibleError {
  message: string;
  retryable: boolean;
  context: "review" | "rewrite" | "copy";
  diagnostics?: ApiRequestError["details"];
}

interface PressReleaseWorkspaceProps {
  initialPassScore: number;
  initialModel?: SelectableModelId;
}

const EMPTY_REWRITE_REFINEMENT: RewriteRefinement = {
  lengthOption: null,
  instruction: "",
};

function countWords(text: string) {
  const normalized = text.trim();
  return normalized ? normalized.split(/\s+/u).length : 0;
}

function formattedUploadSize(bytes: number, locale: RewriteLocale) {
  const numberLocale = locale === "zh-HK" ? "zh-HK" : "en-US";
  if (bytes < 1024) return `${bytes.toLocaleString(numberLocale)} B`;
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toLocaleString(numberLocale, {
      maximumFractionDigits: 2,
    })} MB`;
  }
  return `${(bytes / 1024).toLocaleString(numberLocale, {
    maximumFractionDigits: 1,
  })} KB`;
}

function messageForError(
  error: unknown,
  locale: RewriteLocale,
  t: RewriteTranslator,
) {
  if (error instanceof ApiRequestError) {
    if (locale === "zh-HK") {
      if (error.code === "VALIDATION_ERROR") return t("validationError");
      if (error.code === "INVALID_SOURCE_URL") return t("invalidSourceUrl");
      if (error.code === "NON_PUBLIC_SOURCE") return t("nonPublicSource");
      if (["SOURCE_DNS_FAILED", "SOURCE_FETCH_FAILED", "SOURCE_REDIRECT_LIMIT"].includes(error.code)) {
        return t("sourceFetchFailed");
      }
      if (error.code === "SOURCE_FETCH_TIMEOUT") return t("sourceFetchTimeout");
      if (error.code === "SOURCE_TOO_LARGE") return t("sourceTooLarge");
      if (error.code === "UNSUPPORTED_SOURCE_TYPE") return t("unsupportedSourceType");
      if (error.code === "EMPTY_SOURCE_CONTENT") return t("emptySource");
      if (error.code === "AUTH_REQUIRED") return t("sessionExpired");
      if (error.code === "FORBIDDEN") return t("forbidden");
      if (error.code.includes("TIMEOUT")) return t("providerTimeout");
      if (
        error.code.startsWith("XAI_") ||
        error.code.startsWith("DEEPSEEK_") ||
        ["NETWORK_ERROR", "MALFORMED_AI_RESPONSE", "EMPTY_AI_RESPONSE"].includes(error.code)
      ) {
        return t("providerFailed");
      }
      if (error.code.includes("REWRITE") || error.code === "INVALID_SERVER_RESPONSE") {
        return t("rewriteValidationFailed");
      }
      return t("requestFailedGeneric");
    }
    const details = error.code === "VALIDATION_ERROR"
      ? error.details?.messages?.join(" ")
      : "";
    return details || error.message;
  }
  return t("genericProcessingError");
}

function formatElapsed(seconds: number, t: RewriteTranslator) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes
    ? t("elapsedMinutes", {
        minutes,
        seconds: String(remainder).padStart(2, "0"),
      })
    : t("elapsedSeconds", { seconds });
}

function stageLabel(
  stage: NonNullable<ApiRequestError["details"]>["stage"],
  t: RewriteTranslator,
) {
  return stage === "review_request" ? t("reviewAgentRequest") : t("rewriteAgentRequest");
}

function localizeUploadSelectionError(error: string, t: RewriteTranslator) {
  const separator = error.indexOf(": ");
  const prefix = separator >= 0 ? error.slice(0, separator + 2) : "";
  const detail = separator >= 0 ? error.slice(separator + 2) : error;
  if (detail.includes("combined size")) return prefix + t("uploadCombinedLimit");
  if (detail.startsWith("Select no more than")) return prefix + t("uploadFileCount");
  if (detail.includes("larger than")) return prefix + t("uploadSingleTooLarge");
  if (detail.includes("is empty")) return prefix + t("uploadEmpty");
  if (detail.startsWith("Unsupported file format")) return prefix + t("uploadUnsupported");
  if (detail.includes("does not match its extension")) return prefix + t("uploadTypeMismatch");
  return prefix + t("uploadInvalid");
}

function uploadRequestMessage(error: AuthRequestError, locale: RewriteLocale, t: RewriteTranslator) {
  if (locale === "en") return error.message;
  if (["FILE_TOO_LARGE", "UPLOAD_TOTAL_TOO_LARGE"].includes(error.code)) {
    return t("uploadCombinedLimit");
  }
  if (error.code === "FILE_EMPTY") return t("uploadEmpty");
  if (error.code === "FILE_TYPE_MISMATCH") return t("uploadTypeMismatch");
  if (error.code === "FILE_PASSWORD_PROTECTED") return t("uploadPasswordProtected");
  if (error.code === "FILE_PROCESSING_TIMEOUT") return t("uploadTimeout");
  if (["FILE_UNSAFE", "FILE_CORRUPTED", "FILE_TOO_COMPLEX", "FILE_UNREADABLE"].includes(error.code)) {
    return t("uploadUnsafe");
  }
  if (error.code === "AUTH_REQUIRED") return t("sessionExpired");
  if (error.code === "FORBIDDEN") return t("forbidden");
  return t("uploadInvalid");
}

function inputSignature(input: EditorialInput) {
  return JSON.stringify({
    draft: input.draft,
    sourceUrl: input.sourceUrl,
    model: input.model ?? DEFAULT_SELECTABLE_MODEL,
  });
}

export function PressReleaseWorkspace({
  initialPassScore,
  initialModel = DEFAULT_SELECTABLE_MODEL,
}: PressReleaseWorkspaceProps) {
  const { locale, t } = useRewriteI18n();
  const [draft, setDraft] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [selectedModel, setSelectedModel] = useState<SelectableModelId>(initialModel);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [reviewedInputSignature, setReviewedInputSignature] = useState("");
  const [reviewedSource, setReviewedSource] = useState<SourceSnapshot | null>(null);
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [rewriteState, setRewriteState] = useState<RewriteState>({ status: "idle" });
  const [rewriteHistory, setRewriteHistory] = useState<CompletedRewriteTurn[]>([]);
  const [message, setMessage] = useState("");
  const [passScore, setPassScore] = useState(initialPassScore);
  const [processing, setProcessing] = useState<ProcessingState>("idle");
  const [inputError, setInputError] = useState("");
  const [requestError, setRequestError] = useState<VisibleError | null>(null);
  const [copied, setCopied] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [draftAttachments, setDraftAttachments] =
    useState<DraftAttachmentState[]>([]);
  const [draftAttachmentError, setDraftAttachmentError] = useState("");
  const [pendingExtractedText, setPendingExtractedText] = useState("");
  const [uploadDragActive, setUploadDragActive] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef(draft);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const inFlightRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const activeRequestRef = useRef(0);
  const lastRefinementRef = useRef<RewriteRefinement>(EMPTY_REWRITE_REFINEMENT);
  const uploadSequenceRef = useRef(0);
  const attachmentSequenceRef = useRef(0);
  const busy = processing !== "idle";
  const words = countWords(draft);
  const selectedModelDetails = selectableModelById(selectedModel);
  const draftFileUploading = draftAttachments.some(
    (attachment) => attachment.status === "processing",
  );
  const draftFilesToExtract = draftAttachments.filter(
    (attachment) => attachment.status === "selected" || attachment.status === "error",
  );
  const draftAttachmentTotal = totalUploadBytes(
    draftAttachments.map((attachment) => attachment.file),
  );

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (processing === "idle") return;

    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000));
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [processing]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const stored = loadRewriteSession();
      if (stored) {
        const restoredInput = {
          draft: stored.draft,
          sourceUrl: stored.sourceUrl,
          model: stored.model,
        };
        const restoredSignature = inputSignature(restoredInput);
        const legacySignature = JSON.stringify({
          draft: stored.draft,
          sourceUrl: stored.sourceUrl,
        });
        if (
          restoredSignature === stored.reviewedInputSignature ||
          legacySignature === stored.reviewedInputSignature
        ) {
          setDraft(stored.draft);
          setSourceUrl(stored.sourceUrl);
          setSelectedModel(stored.model);
          setReviewedInputSignature(restoredSignature);
          setReviewedSource(stored.reviewedSource);
          setReview(stored.review);
          setRewriteHistory(stored.history);
          setMessage(stored.message);
          setPassScore(stored.passScore);

          const currentTurn = stored.history.at(-1);
          if (currentTurn) {
            setRewriteState({
              status: "success",
              attemptId: 0,
              text: currentTurn.rewrittenText,
              validation: { status: "passed", attempts: 1 },
            });
          }
        } else {
          clearRewriteSession();
        }
      }
      setSessionHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      !sessionHydrated ||
      !reviewedSource ||
      !reviewedInputSignature ||
      inputSignature({ draft, sourceUrl, model: selectedModel }) !== reviewedInputSignature
    ) {
      return;
    }

    saveRewriteSession({
      version: 1,
      draft,
      sourceUrl,
      model: selectedModel,
      reviewedInputSignature,
      reviewedSource,
      review,
      message,
      passScore,
      history: rewriteHistory,
    });
  }, [
    draft,
    message,
    passScore,
    review,
    reviewedInputSignature,
    reviewedSource,
    rewriteHistory,
    selectedModel,
    sessionHydrated,
    sourceUrl,
  ]);

  function currentInput(): EditorialInput {
    return {
      draft,
      sourceUrl,
      model: selectedModel,
    };
  }

  const reviewIsStale = Boolean(
    review && inputSignature(currentInput()) !== reviewedInputSignature,
  );
  const finalText = rewriteState.status === "success" ? rewriteState.text : "";

  function clearResults() {
    setReviewedInputSignature("");
    setReviewedSource(null);
    setReview(null);
    setRewriteState({ status: "idle" });
    setRewriteHistory([]);
    setMessage("");
    setPassScore(initialPassScore);
    setCopied(false);
    setRequestError(null);
    lastRefinementRef.current = EMPTY_REWRITE_REFINEMENT;
    clearRewriteSession();
  }

  function focusInput() {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.scrollIntoView({ block: "center" });
    });
  }

  function showRequestError(error: VisibleError) {
    setRequestError(error);
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  function markSourceChanged() {
    setRequestError(null);
    setInputError("");
    setRewriteState({ status: "idle" });
    setRewriteHistory([]);
    setCopied(false);
    lastRefinementRef.current = EMPTY_REWRITE_REFINEMENT;
    clearRewriteSession();
  }

  function handleModelChange(model: SelectableModelId) {
    if (inFlightRef.current || model === selectedModel) return;
    setSelectedModel(model);
    markSourceChanged();
  }

  function removeDraftAttachment(attachmentId: string) {
    if (draftFileUploading) return;
    const nextAttachments = draftAttachments.filter(
      (attachment) => attachment.id !== attachmentId,
    );
    setDraftAttachments(nextAttachments);
    setDraftAttachmentError("");
    const remainingPending = nextAttachments
      .filter((attachment) => attachment.status === "awaiting-choice")
      .map((attachment) => attachment.content ?? "")
      .filter(Boolean)
      .join("\n\n")
      .slice(0, MAX_DRAFT_CHARS);
    setPendingExtractedText(remainingPending);
    setUploadDragActive(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function addDraftFiles(files: readonly File[]) {
    if (busy || draftFileUploading || pendingExtractedText) return;
    const result = addUploadsWithinLimit(
      draftAttachments.map((attachment) => attachment.file),
      files,
    );
    const additions = result.accepted.map((file): DraftAttachmentState => {
      const validation = validateUploadMetadata(file);
      return {
        id: `draft-file-${++attachmentSequenceRef.current}`,
        file,
        name: file.name,
        type: "error" in validation ? file.type || t("unknownType") : validation.formatLabel,
        size: file.size,
        status: "selected",
      };
    });
    setDraftAttachments((current) => [...current, ...additions]);
    setDraftAttachmentError(
      result.errors.map((error) => localizeUploadSelectionError(error, t)).join(" "),
    );
    setInputError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function processDraftFiles() {
    if (busy || draftFileUploading || !draftFilesToExtract.length) return;
    const requestId = ++uploadSequenceRef.current;
    const submittedIds = new Set(
      draftFilesToExtract.map((attachment) => attachment.id),
    );
    setDraftAttachments((current) =>
      current.map((attachment) =>
        submittedIds.has(attachment.id)
          ? { ...attachment, status: "processing", error: undefined }
          : attachment,
      ),
    );
    setDraftAttachmentError("");
    setInputError("");
    try {
      const result = await requestFileExtraction(
        draftFilesToExtract.map((attachment) => attachment.file),
      );
      if (uploadSequenceRef.current !== requestId) return;
      const currentDraft = draftRef.current;
      const resultById = new Map(
        draftFilesToExtract.map((attachment, index) => [
          attachment.id,
          result.files[index],
        ]),
      );
      setDraftAttachments((current) =>
        current.map((attachment) => {
          const extracted = resultById.get(attachment.id);
          if (!extracted) return attachment;
          return {
            ...attachment,
            name: extracted.name,
            type: extracted.type,
            size: extracted.size,
            status: currentDraft.trim() ? "awaiting-choice" : "added",
            truncated: extracted.truncated || result.truncated,
            content: extracted.content,
            error: undefined,
          };
        }),
      );
      if (currentDraft.trim()) {
        setPendingExtractedText(result.content);
      } else {
        draftRef.current = result.content;
        setDraft(result.content);
        markSourceChanged();
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    } catch (error) {
      if (uploadSequenceRef.current !== requestId) return;
      const message =
        error instanceof AuthRequestError
          ? uploadRequestMessage(error, locale, t)
          : t("filesProcessError");
      setDraftAttachmentError(message);
      setDraftAttachments((current) =>
        current.map((attachment) =>
          submittedIds.has(attachment.id)
            ? { ...attachment, status: "error", error: message }
            : attachment,
        ),
      );
    }
  }

  function applyExtractedContent(mode: "append" | "replace") {
    if (
      !pendingExtractedText ||
      !draftAttachments.some((attachment) => attachment.status === "awaiting-choice")
    ) return;
    const nextDraft =
      mode === "append"
        ? `${draft.trimEnd()}\n\n${pendingExtractedText}`
        : pendingExtractedText;
    if (nextDraft.length > MAX_DRAFT_CHARS) {
      setDraftAttachmentError(t("appendLimitError"));
      return;
    }
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    setPendingExtractedText("");
    setDraftAttachmentError("");
    setDraftAttachments((current) =>
      current.map((attachment) =>
        attachment.status === "awaiting-choice"
          ? { ...attachment, status: "added", error: undefined }
          : attachment,
      ),
    );
    markSourceChanged();
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function validateInput(input: EditorialInput) {
    if (!input.draft.trim() && !input.sourceUrl.trim()) {
      return t("inputRequired");
    }
    if (input.draft.length > MAX_DRAFT_CHARS) {
      return t("draftLimitError");
    }
    return "";
  }

  async function handleReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlightRef.current) return;

    const input = currentInput();
    const validationError = validateInput(input);
    if (validationError) {
      setInputError(validationError);
      inputRef.current?.focus();
      return;
    }

    const requestId = ++requestSequenceRef.current;
    activeRequestRef.current = requestId;
    inFlightRef.current = true;
    setInputError("");
    setRequestError(null);
    setCopied(false);
    setReview(null);
    setReviewedSource(null);
    setReviewedInputSignature("");
    setRewriteState({ status: "idle" });
    setRewriteHistory([]);
    lastRefinementRef.current = EMPTY_REWRITE_REFINEMENT;
    clearRewriteSession();
    setModelPickerOpen(false);
    setElapsedSeconds(0);
    setProcessing("reviewing");

    try {
      const result = await requestReview(input);
      if (activeRequestRef.current !== requestId) return;
      setReviewedInputSignature(inputSignature(input));
      setReviewedSource(result.source);
      setReview(result.review);
      setMessage(result.message);
      setPassScore(result.passScore);
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (error) {
      if (activeRequestRef.current !== requestId) return;
      showRequestError({
        message: messageForError(error, locale, t),
        retryable: error instanceof ApiRequestError
          ? error.details?.retryable ?? error.code !== "VALIDATION_ERROR"
          : true,
        context: "review",
        diagnostics: error instanceof ApiRequestError ? error.details : undefined,
      });
    } finally {
      if (activeRequestRef.current === requestId) {
        inFlightRef.current = false;
        setProcessing("idle");
      }
    }
  }

  async function handleDirectRewrite() {
    if (inFlightRef.current) return;

    const input = currentInput();
    const validationError = validateInput(input);
    if (validationError) {
      setInputError(validationError);
      inputRef.current?.focus();
      return;
    }

    const requestId = ++requestSequenceRef.current;
    activeRequestRef.current = requestId;
    inFlightRef.current = true;
    setInputError("");
    setRequestError(null);
    setCopied(false);
    setReview(null);
    setReviewedSource(null);
    setReviewedInputSignature("");
    setRewriteState({ status: "loading", attemptId: requestId });
    setRewriteHistory([]);
    setMessage("");
    setPassScore(initialPassScore);
    lastRefinementRef.current = EMPTY_REWRITE_REFINEMENT;
    clearRewriteSession();
    setModelPickerOpen(false);
    setElapsedSeconds(0);
    setProcessing("rewriting");

    try {
      const result = await requestDirectRewrite(input);
      if (activeRequestRef.current !== requestId) return;
      const firstTurn: CompletedRewriteTurn = {
        rewrittenText: result.finalText,
        lengthOption: null,
        instruction: "",
      };
      setReviewedInputSignature(inputSignature(input));
      setReviewedSource(result.source);
      setRewriteHistory([firstTurn]);
      setRewriteState({
        status: "success",
        attemptId: requestId,
        text: result.finalText,
        validation: result.validation,
      });
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (error) {
      if (activeRequestRef.current !== requestId) return;
      if (
        error instanceof ApiRequestError &&
        error.code === "INEXACT_REWRITE_QUOTATION" &&
        error.details?.quotationIssues?.length
      ) {
        setRewriteState({
          status: "quotation-failed",
          attemptId: requestId,
          issues: error.details.quotationIssues,
          candidateText: error.details.candidateText,
          attempts: error.details.attempts,
        });
      } else {
        setRewriteState({ status: "idle" });
        showRequestError({
          message: messageForError(error, locale, t),
          retryable: error instanceof ApiRequestError
            ? error.details?.retryable ?? error.code !== "VALIDATION_ERROR"
            : true,
          context: "rewrite",
          diagnostics: error instanceof ApiRequestError ? error.details : undefined,
        });
      }
    } finally {
      if (activeRequestRef.current === requestId) {
        inFlightRef.current = false;
        setProcessing("idle");
      }
    }
  }

  async function handleRewrite(refinement: RewriteRefinement) {
    if (inFlightRef.current || !reviewedSource || reviewIsStale) return;
    if (rewriteHistory.length >= MAX_REWRITE_HISTORY_ENTRIES) {
      showRequestError({
        message: t("historyLimitError", { count: MAX_REWRITE_HISTORY_ENTRIES }),
        retryable: false,
        context: "rewrite",
      });
      return;
    }

    const submittedRefinement: RewriteRefinement = {
      lengthOption: refinement.lengthOption ?? null,
      instruction: refinement.instruction.trim(),
    };
    lastRefinementRef.current = submittedRefinement;

    const requestId = ++requestSequenceRef.current;
    activeRequestRef.current = requestId;
    inFlightRef.current = true;
    setRequestError(null);
    setCopied(false);
    setRewriteState({ status: "loading", attemptId: requestId });
    setElapsedSeconds(0);
    setProcessing("rewriting");

    try {
      const result = await requestRewrite(
        reviewedSource,
        review,
        rewriteHistory,
        submittedRefinement,
        selectedModel,
      );
      if (activeRequestRef.current !== requestId) return;
      setRewriteHistory((history) => [
        ...history,
        {
          rewrittenText: result.finalText,
          lengthOption: submittedRefinement.lengthOption,
          instruction: submittedRefinement.instruction,
        },
      ]);
      setRewriteState({
        status: "success",
        attemptId: requestId,
        text: result.finalText,
        validation: result.validation,
      });
      requestAnimationFrame(() => outputRef.current?.focus());
    } catch (error) {
      if (activeRequestRef.current !== requestId) return;
      if (
        error instanceof ApiRequestError &&
        error.code === "INEXACT_REWRITE_QUOTATION" &&
        error.details?.quotationIssues?.length
      ) {
        setRewriteState({
          status: "quotation-failed",
          attemptId: requestId,
          issues: error.details.quotationIssues,
          candidateText: error.details.candidateText,
          attempts: error.details.attempts,
        });
      } else {
        setRewriteState({ status: "idle" });
        showRequestError({
          message: messageForError(error, locale, t),
          retryable: error instanceof ApiRequestError ? error.details?.retryable !== false : true,
          context: "rewrite",
          diagnostics: error instanceof ApiRequestError ? error.details : undefined,
        });
      }
    } finally {
      if (activeRequestRef.current === requestId) {
        inFlightRef.current = false;
        setProcessing("idle");
      }
    }
  }

  function handleInitialRewrite() {
    return handleRewrite(EMPTY_REWRITE_REFINEMENT);
  }

  function handleRetryRewrite() {
    if (!reviewedSource) return handleDirectRewrite();
    return handleRewrite(lastRefinementRef.current);
  }

  async function handleCopy() {
    if (!finalText) return;
    setRequestError(null);

    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(finalText);
      setCopied(true);
      return;
    } catch {
      const output = outputRef.current;
      if (output) {
        output.focus();
        output.select();
        output.setSelectionRange(0, output.value.length);
        if (document.execCommand("copy")) {
          setCopied(true);
          return;
        }
      }
      showRequestError({
        message: t("copyError"),
        retryable: false,
        context: "copy",
      });
    }
  }

  function handleStartNew() {
    uploadSequenceRef.current += 1;
    setDraftAttachments([]);
    setDraftAttachmentError("");
    setPendingExtractedText("");
    setUploadDragActive(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    draftRef.current = "";
    setDraft("");
    setSourceUrl("");
    setInputError("");
    clearResults();
    focusInput();
  }

  const loadingMessage = processing === "reviewing"
    ? t("reviewLoading")
    : processing === "rewriting"
      ? t("rewriteLoading")
      : "";
  const longReasoningMessage = elapsedSeconds >= 30
    ? t("longReasoning", { model: selectedModelDetails.label })
    : "";

  return (
    <div className="workspace" aria-busy={busy}>
      <form className="card input-card" onSubmit={handleReview} noValidate>
        <div className="section-kicker">
          <span>01</span>
          {t("sourceInput")}
        </div>
        <div className="section-heading">
          <div>
            <h2>{t("addArticleOrDraft")}</h2>
            <p>{t("pasteTextOrUrl")}</p>
          </div>
          <div className="section-heading-tools">
            <span className="privacy-note">{t("privacyNote")}</span>
            <button
              className="model-change-button"
              type="button"
              aria-label={t("changeModelAria", { model: selectedModelDetails.label })}
              aria-expanded={modelPickerOpen}
              aria-controls="model-picker"
              onClick={() => setModelPickerOpen((open) => !open)}
              disabled={busy}
            >
              <span>{t("aiModel")}</span>
              <strong>{selectedModelDetails.label}</strong>
              <span className="model-change-action" aria-hidden="true">
                {t("change")}
              </span>
            </button>
          </div>
        </div>

        {modelPickerOpen ? (
          <fieldset id="model-picker" className="model-picker" disabled={busy}>
            <legend>{t("chooseAiModel")}</legend>
            <div className="model-picker-intro">
              <p>{t("highReasoningEvery")}</p>
              <span>{t("highReasoning")}</span>
            </div>
            <div className="model-option-grid">
              {SELECTABLE_MODELS.map((model) => (
                <label
                  className={
                    "model-option " + (selectedModel === model.id ? "model-option-selected" : "")
                  }
                  key={model.id}
                >
                  <input
                    type="radio"
                    name="ai-model"
                    value={model.id}
                    checked={selectedModel === model.id}
                    onChange={() => handleModelChange(model.id)}
                  />
                  <span className="model-option-copy">
                    <span className="model-option-title">
                      <strong>{model.label}</strong>
                      {model.recommended ? <span>{t("recommended")}</span> : null}
                    </span>
                    <small>
                      {t(model.id === "deepseek-v4-pro" ? "deepseekDescription" : "grokDescription")}
                    </small>
                  </span>
                </label>
              ))}
            </div>
            <div className="model-picker-footer">
              <p>{t("changeModelRequiresReview")}</p>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setModelPickerOpen(false)}
              >
                {t("done")}
              </button>
            </div>
          </fieldset>
        ) : null}

        <label className="input-label" htmlFor="draft-input">
          {t("draftLabel")}
        </label>
        <textarea
          id="draft-input"
          ref={inputRef}
          className={"draft-textarea " + (inputError ? "field-error" : "")}
          value={draft}
          onChange={(event) => {
            if (inFlightRef.current) return;
            draftRef.current = event.target.value;
            setDraft(event.target.value);
            markSourceChanged();
          }}
          placeholder={t("draftPlaceholder")}
          aria-describedby="draft-help draft-count draft-error"
          aria-invalid={Boolean(inputError)}
          maxLength={MAX_DRAFT_CHARS}
          disabled={busy}
        />

        <div className="input-meta">
          <p id="draft-help">{t("draftHelp")}</p>
          <p id="draft-count" className="count">
            {words.toLocaleString(locale)} {words === 1 ? t("word") : t("words")} ·{" "}
            {draft.length.toLocaleString(locale)} /{" "}
            {MAX_DRAFT_CHARS.toLocaleString(locale)} {t("characters")}
          </p>
        </div>

        <div
          className={
            "file-upload-zone draft-upload-zone " +
            (uploadDragActive ? "file-upload-zone-active" : "") +
            (draftAttachmentError ? " file-upload-zone-error" : "")
          }
          onDragEnter={(event) => {
            event.preventDefault();
            if (!busy && !draftFileUploading && !pendingExtractedText) {
              setUploadDragActive(true);
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            if (!busy && !draftFileUploading && !pendingExtractedText) {
              setUploadDragActive(true);
            }
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setUploadDragActive(false);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            setUploadDragActive(false);
            const files = Array.from(event.dataTransfer.files ?? []);
            if (files.length) addDraftFiles(files);
          }}
        >
          <input
            ref={fileInputRef}
            id="draft-file"
            className="visually-hidden-file-input"
            type="file"
            multiple
            accept={FILE_UPLOAD_ACCEPT}
            disabled={busy || draftFileUploading || Boolean(pendingExtractedText)}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length) addDraftFiles(files);
            }}
          />
          <div>
            <strong>{t("uploadZoneTitle")}</strong>
            <p>{t("uploadHelp")}</p>
          </div>
          <label className="button button-secondary file-picker-button" htmlFor="draft-file">
            {t("chooseFiles")}
          </label>
        </div>

        <div className="draft-upload-summary">
          <p className="attachment-summary" aria-live="polite">
            {t("filesSelected", {
              count: draftAttachments.length.toLocaleString(locale),
              fileLabel: draftAttachments.length === 1 ? t("file") : t("files"),
              size: formattedUploadSize(draftAttachmentTotal, locale),
            })}
          </p>
          {draftFilesToExtract.length ? (
            <button
              className="button button-secondary"
              type="button"
              disabled={busy || draftFileUploading || Boolean(pendingExtractedText)}
              onClick={() => void processDraftFiles()}
            >
              {draftFileUploading ? t("extractingFiles") : t("extractSelectedFiles")}
            </button>
          ) : null}
        </div>

        <div aria-live="polite">
          {draftAttachments.map((attachment) => (
            <div className="attachment-row draft-attachment-row" key={attachment.id}>
              <div className="attachment-icon" aria-hidden="true">DOC</div>
              <div className="attachment-details">
                <strong>{attachment.name}</strong>
                <span>{attachment.type} · {formattedUploadSize(attachment.size, locale)}</span>
                <span
                  className={
                    "attachment-status " +
                    (attachment.status === "error" || attachment.error
                      ? "attachment-status-error"
                      : "")
                  }
                >
                  {attachment.status === "processing" ? (
                    <>
                      <span className="spinner" aria-hidden="true" />
                      {t("extractingContent")}
                    </>
                  ) : attachment.status === "selected" ? (
                    t("readyToExtract")
                  ) : attachment.status === "awaiting-choice" ? (
                    t("contentExtractedChoice")
                  ) : attachment.status === "added" ? (
                    t("contentAdded")
                  ) : (
                    attachment.error
                  )}
                </span>
                {attachment.truncated ? (
                  <span className="attachment-warning">
                    {t("extractedTruncated")}
                  </span>
                ) : null}
              </div>
              <button
                className="button button-quiet attachment-remove"
                type="button"
                aria-label={t("removeFileAria", { name: attachment.name })}
                onClick={() => removeDraftAttachment(attachment.id)}
                disabled={busy || draftFileUploading}
              >
                {t("remove")}
              </button>
            </div>
          ))}
        </div>

        {draftAttachmentError ? (
          <p className="field-error-message" role="alert">
            {draftAttachmentError}
          </p>
        ) : null}

        {draftAttachments.some((attachment) => attachment.status === "awaiting-choice") && pendingExtractedText ? (
          <div className="attachment-choice" role="group" aria-label={t("addExtractedGroup")}>
            <div>
              <strong>{t("keepCurrentDraft")}</strong>
              <p>{t("appendReplaceHelp")}</p>
            </div>
            <div className="attachment-choice-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => applyExtractedContent("append")}
              >
                {t("appendToDraft")}
              </button>
              <button
                className="button button-quiet"
                type="button"
                onClick={() => applyExtractedContent("replace")}
              >
                {t("replaceDraft")}
              </button>
            </div>
          </div>
        ) : null}

        <div className="source-options-grid">
          <div>
            <label className="input-label" htmlFor="source-url">
              {t("publicArticleUrl")}
            </label>
            <input
              id="source-url"
              type="url"
              value={sourceUrl}
              onChange={(event) => {
                setSourceUrl(event.target.value);
                markSourceChanged();
              }}
              placeholder="https://example.com/article"
              disabled={busy}
            />
            <p className="field-help">{t("urlHelp")}</p>
          </div>

        </div>

        <p id="draft-error" className="field-error-message" role={inputError ? "alert" : undefined}>
          {inputError}
        </p>

        <div className="form-actions">
          <div className="source-action-buttons">
            <button className="button button-primary review-button" type="submit" disabled={busy}>
              {processing === "reviewing" ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  {t("reviewingDraft")}
                </>
              ) : (
                t("reviewDraft")
              )}
            </button>
            <button
              className="button button-secondary rewrite-button"
              type="button"
              disabled={busy}
              onClick={() => void handleDirectRewrite()}
            >
              {processing === "rewriting" && !reviewedSource ? (
                <>
                  <span className="spinner spinner-dark" aria-hidden="true" />
                  {t("rewritingDraft")}
                </>
              ) : (
                t("rewriteDraft")
              )}
            </button>
          </div>
          <p>
            {t("passThreshold")}: {initialPassScore}/100 <span aria-hidden="true">·</span>{" "}
            {selectedModelDetails.label} <span aria-hidden="true">·</span> {t("highReasoning")}
          </p>
        </div>
      </form>

      {loadingMessage ? (
        <div className="loading-panel" role="status" aria-live="polite">
          <span className="spinner spinner-dark" aria-hidden="true" />
          <div>
            <strong>{processing === "reviewing" ? t("reviewInProgress") : t("rewriteInProgress")}</strong>
            <p>{loadingMessage}{longReasoningMessage}</p>
            <span className="loading-elapsed">{t("elapsed", { time: formatElapsed(elapsedSeconds, t) })}</span>
          </div>
        </div>
      ) : null}

      {requestError ? (
        <div className="error-panel" role="alert" ref={errorRef} tabIndex={-1}>
          <div className="error-symbol" aria-hidden="true">!</div>
          <div>
            <strong>{t("requestFailed")}</strong>
            <p>{requestError.message}</p>
            {requestError.diagnostics?.stage ? (
              <dl className="error-diagnostics" aria-label={t("requestDiagnostics")}>
                <div><dt>{t("stage")}</dt><dd>{stageLabel(requestError.diagnostics.stage, t)}</dd></div>
                {requestError.diagnostics.provider ? (
                  <div><dt>{t("provider")}</dt><dd>{requestError.diagnostics.provider}</dd></div>
                ) : null}
                {requestError.diagnostics.model ? (
                  <div><dt>{t("model")}</dt><dd>{requestError.diagnostics.model}</dd></div>
                ) : null}
                {requestError.diagnostics.httpStatus !== undefined ? (
                  <div>
                    <dt>{t("httpStatus")}</dt>
                    <dd>{requestError.diagnostics.httpStatus || t("noResponse")}</dd>
                  </div>
                ) : null}
                {requestError.diagnostics.causeSummary ? (
                  <div className="error-cause">
                    <dt>{t("cause")}</dt><dd>{locale === "en" ? requestError.diagnostics.causeSummary : t("diagnosticCauseGeneric")}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
            {requestError.retryable && requestError.context === "rewrite" ? (
              <button
                className="button button-secondary"
                type="button"
                onClick={handleRetryRewrite}
                disabled={busy}
              >
                {t("retryRewrite")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {review || rewriteState.status === "quotation-failed" || rewriteState.status === "success" ? (
        <div
          className="results-stack"
          ref={resultRef}
          tabIndex={-1}
          role="region"
          aria-label={t("reviewResultRegion")}
        >
          {review ? (
            <ReviewSummary
              review={review}
              passScore={passScore}
              message={message}
              busy={busy}
              reviewIsStale={reviewIsStale}
              onRewrite={handleInitialRewrite}
              onEditDraft={focusInput}
            />
          ) : null}
          {rewriteState.status === "quotation-failed" ? (
            <QuotationFailurePanel
              issues={rewriteState.issues}
              candidateText={rewriteState.candidateText}
              attempts={rewriteState.attempts}
              busy={busy}
              onRetry={handleRetryRewrite}
            />
          ) : null}
          {rewriteState.status === "success" ? (
            <OutputPanel
              output={rewriteState.text}
              busy={busy}
              copied={copied}
              outputRef={outputRef}
              onCopy={handleCopy}
              onRewriteAgain={handleRewrite}
              onEditInput={focusInput}
              onStartNew={handleStartNew}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
