import type { D1Database } from "@cloudflare/workers-types";

import { createId, nowInSeconds } from "@/lib/server/auth/crypto";
import { isAppError } from "@/lib/server/errors";
import type { RewriteLengthOption, RewriteOutputLanguage } from "@/lib/shared/contracts";
import {
  MAX_PIPELINE_REWRITE_DEBUG_LOGS,
  pipelineRewriteDebugEntrySchema,
  type PipelineRewriteDebugEntry,
  type PipelineRewriteSourceOrigin,
} from "@/lib/shared/feeds-contracts";
import type { SelectableModelId } from "@/lib/shared/models";

const DEBUG_LOG_RETENTION_SECONDS = 30 * 24 * 60 * 60;
const MAX_ERROR_DETAILS = 12;

interface RewriteDebugLogInput {
  id?: string;
  batchId?: string | null;
  articleId: string;
  articleTitle: string;
  requestedByUserId: string;
  requestedModel: SelectableModelId;
  outputLanguage: RewriteOutputLanguage;
  requestedLengthOption: RewriteLengthOption | null;
  effectiveLengthOption: RewriteLengthOption | null;
  relatedReportCount: number;
  sourceOrigin: PipelineRewriteSourceOrigin | null;
  sourceCharacters: number | null;
  linkedCharacters: number | null;
  outcome: "success" | "failure";
  validationStatus?: "passed" | "passed_after_retry" | null;
  attempts?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  errorDetails?: readonly string[];
  retryable?: boolean | null;
  stage?: "review_request" | "rewrite_request" | null;
  provider?: string | null;
  providerModel?: string | null;
  providerHttpStatus?: number | null;
  causeSummary?: string | null;
  quotationIssueKinds?: readonly PipelineRewriteDebugEntry["quotationIssueKinds"][number][];
  quotationIssueCount?: number;
  candidateCharacters?: number | null;
  durationMs: number;
}

interface RewriteDebugRow {
  id: string;
  batch_id: string | null;
  article_id: string;
  article_title: string;
  requested_model: SelectableModelId;
  output_language: RewriteOutputLanguage;
  requested_length_option: RewriteLengthOption | null;
  effective_length_option: RewriteLengthOption | null;
  related_report_count: number;
  source_origin: PipelineRewriteSourceOrigin | null;
  source_characters: number | null;
  linked_characters: number | null;
  outcome: "success" | "failure";
  validation_status: "passed" | "passed_after_retry" | null;
  attempts: number | null;
  error_code: string | null;
  error_message: string | null;
  error_details_json: string;
  retryable: number | null;
  stage: "review_request" | "rewrite_request" | null;
  provider: string | null;
  provider_model: string | null;
  provider_http_status: number | null;
  cause_summary: string | null;
  quotation_issue_kinds_json: string;
  quotation_issue_count: number;
  candidate_characters: number | null;
  duration_ms: number;
  created_at: number;
}

function bounded(value: string | null | undefined, maximum: number) {
  const normalized = value?.normalize("NFC").trim();
  return normalized ? normalized.slice(0, maximum) : null;
}

function boundedList(values: readonly string[] = []) {
  return values
    .map((value) => bounded(value, 1_000))
    .filter((value): value is string => Boolean(value))
    .slice(0, MAX_ERROR_DETAILS);
}

function parseStringArray(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function mapDebugRow(row: RewriteDebugRow) {
  return pipelineRewriteDebugEntrySchema.parse({
    id: row.id,
    batchId: row.batch_id,
    articleId: row.article_id,
    articleTitle: row.article_title,
    requestedModel: row.requested_model,
    outputLanguage: row.output_language,
    requestedLengthOption: row.requested_length_option,
    effectiveLengthOption: row.effective_length_option,
    relatedReportCount: row.related_report_count,
    sourceOrigin: row.source_origin,
    sourceCharacters: row.source_characters,
    linkedCharacters: row.linked_characters,
    outcome: row.outcome,
    validationStatus: row.validation_status,
    attempts: row.attempts,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    errorDetails: parseStringArray(row.error_details_json),
    retryable: row.retryable === null ? null : row.retryable === 1,
    stage: row.stage,
    provider: row.provider,
    providerModel: row.provider_model,
    providerHttpStatus: row.provider_http_status,
    causeSummary: row.cause_summary,
    quotationIssueKinds: parseStringArray(row.quotation_issue_kinds_json),
    quotationIssueCount: row.quotation_issue_count,
    candidateCharacters: row.candidate_characters,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  });
}

const DEBUG_SELECT = `
  SELECT
    id, batch_id, article_id, article_title, requested_model, output_language,
    requested_length_option, effective_length_option, related_report_count,
    source_origin, source_characters, linked_characters, outcome,
    validation_status, attempts, error_code, error_message, error_details_json,
    retryable, stage, provider, provider_model, provider_http_status,
    cause_summary, quotation_issue_kinds_json, quotation_issue_count,
    candidate_characters, duration_ms, created_at
  FROM pipeline_rewrite_debug_logs
`;

export function rewriteDebugFailureFields(error: unknown) {
  if (!isAppError(error)) {
    return {
      errorCode: "INTERNAL_ERROR",
      errorMessage: "An unexpected server error occurred.",
      errorDetails: [],
      retryable: null,
      stage: null,
      provider: null,
      providerModel: null,
      providerHttpStatus: null,
      causeSummary: null,
      quotationIssueKinds: [],
      quotationIssueCount: 0,
      candidateCharacters: null,
      attempts: null,
    } satisfies Partial<RewriteDebugLogInput>;
  }

  const quotationIssues = error.publicDetails?.quotationIssues ?? [];
  return {
    errorCode: error.code,
    errorMessage: error.publicMessage,
    errorDetails: error.publicDetails?.details ?? [],
    retryable: error.publicDetails?.retryable ?? null,
    stage: error.publicDetails?.stage ?? null,
    provider: error.publicDetails?.provider ?? null,
    providerModel: error.publicDetails?.model ?? null,
    providerHttpStatus: error.publicDetails?.httpStatus ?? null,
    causeSummary: error.publicDetails?.causeSummary ?? null,
    quotationIssueKinds: [...new Set(quotationIssues.map((issue) => issue.kind))],
    quotationIssueCount: quotationIssues.length,
    candidateCharacters: error.publicDetails?.candidateText?.length ?? null,
    attempts: error.publicDetails?.attempts ?? null,
  } satisfies Partial<RewriteDebugLogInput>;
}

export async function recordPipelineRewriteDebugLog(
  database: D1Database,
  input: RewriteDebugLogInput,
) {
  const id = input.id ?? createId();
  const createdAt = nowInSeconds();
  const errorDetails = boundedList(input.errorDetails);
  const quotationIssueKinds = [...new Set(input.quotationIssueKinds ?? [])];
  await database
    .prepare(
      `INSERT INTO pipeline_rewrite_debug_logs (
        id, batch_id, article_id, article_title, requested_by_user_id,
        requested_model, output_language, requested_length_option,
        effective_length_option, related_report_count, source_origin,
        source_characters, linked_characters, outcome, validation_status,
        attempts, error_code, error_message, error_details_json, retryable,
        stage, provider, provider_model, provider_http_status, cause_summary,
        quotation_issue_kinds_json, quotation_issue_count, candidate_characters,
        duration_ms, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      bounded(input.batchId, 128),
      input.articleId,
      bounded(input.articleTitle, 1_000) ?? "Untitled article",
      input.requestedByUserId,
      input.requestedModel,
      input.outputLanguage,
      input.requestedLengthOption,
      input.effectiveLengthOption,
      Math.max(1, Math.floor(input.relatedReportCount)),
      input.sourceOrigin,
      input.sourceCharacters,
      input.linkedCharacters,
      input.outcome,
      input.validationStatus ?? null,
      input.attempts ?? null,
      bounded(input.errorCode, 160),
      bounded(input.errorMessage, 2_000),
      JSON.stringify(errorDetails),
      input.retryable === null || input.retryable === undefined
        ? null
        : input.retryable
          ? 1
          : 0,
      input.stage ?? null,
      bounded(input.provider, 80),
      bounded(input.providerModel, 120),
      input.providerHttpStatus ?? null,
      bounded(input.causeSummary, 500),
      JSON.stringify(quotationIssueKinds),
      Math.max(0, Math.floor(input.quotationIssueCount ?? 0)),
      input.candidateCharacters ?? null,
      Math.max(0, Math.floor(input.durationMs)),
      createdAt,
    )
    .run();

  await database
    .prepare("DELETE FROM pipeline_rewrite_debug_logs WHERE created_at < ?")
    .bind(createdAt - DEBUG_LOG_RETENTION_SECONDS)
    .run();
  return id;
}

export async function listPipelineRewriteDebugLogs(
  database: D1Database,
  options: { limit?: number; requestedByUserId?: string } = {},
) {
  const limit = Math.max(
    1,
    Math.min(Math.floor(options.limit ?? 50), MAX_PIPELINE_REWRITE_DEBUG_LOGS),
  );
  const result = options.requestedByUserId
    ? await database
        .prepare(
          `${DEBUG_SELECT}
           WHERE requested_by_user_id = ?
           ORDER BY created_at DESC, id DESC
           LIMIT ?`,
        )
        .bind(options.requestedByUserId, limit)
        .all<RewriteDebugRow>()
    : await database
        .prepare(`${DEBUG_SELECT} ORDER BY created_at DESC, id DESC LIMIT ?`)
        .bind(limit)
        .all<RewriteDebugRow>();
  return result.results.map(mapDebugRow);
}
