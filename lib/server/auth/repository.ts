import type { D1Database } from "@cloudflare/workers-types";

import { createId, nowInSeconds } from "@/lib/server/auth/crypto";
import { isUniqueConstraintError } from "@/lib/server/auth/database";
import { AppError } from "@/lib/server/errors";
import {
  agentUsagePeriodLabel,
  DEFAULT_AGENT_USAGE_PERIOD,
  isAgentSuspensionPeriod,
  resolveAgentUsageWindow,
  type AgentUsagePeriod,
} from "@/lib/shared/agent-usage";
import type {
  AccountRequestInput,
  AccountRequestAttachmentView,
  AccountRequestStatus,
  AccountRequestView,
  AccountListUserView,
  UserRole,
  UserStatus,
} from "@/lib/shared/auth-contracts";

interface AccountRequestRow {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  company: string | null;
  department: string | null;
  job_title: string | null;
  admin_message: string | null;
  status: AccountRequestStatus;
  decided_by: string | null;
  decided_at: number | null;
  rejection_reason: string | null;
  created_at: number;
  updated_at: number;
  actor_full_name: string | null;
  actor_email: string | null;
}

interface AccountRequestAttachmentRow {
  id: string;
  account_request_id: string;
  storage_key: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
  created_at: number;
}

export interface PendingAccountRequestAttachment {
  id: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: number;
}

interface AccountListUserRow {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  status: UserStatus;
  created_at: number;
  review_request_count?: number | null;
  rewrite_request_count?: number | null;
  period_request_count?: number | null;
  period_review_request_count?: number | null;
  period_rewrite_request_count?: number | null;
  ai_suspension_id?: string | null;
  ai_suspended_at?: number | null;
  ai_suspended_until?: number | null;
  ai_suspension_period?: string | null;
  ai_suspension_threshold?: number | null;
  ai_suspension_observed_count?: number | null;
}

export interface UserAuthRow {
  id: string;
  email: string;
  full_name: string;
  password_hash: string | null;
  role: UserRole;
  status: UserStatus;
}

export interface SetupTokenRow {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  expires_at: number;
  used_at: number | null;
  invalidated_at: number | null;
  user_status: UserStatus;
  user_role: UserRole;
}

function mapAccountRequest(
  row: AccountRequestRow,
  attachments: AccountRequestAttachmentView[] = [],
): AccountRequestView {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    department: row.department,
    jobTitle: row.job_title,
    adminMessage: row.admin_message,
    attachments,
    attachment: attachments[0] ?? null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    decidedAt: row.decided_at,
    rejectionReason: row.rejection_reason,
    decidedBy:
      row.decided_by && row.actor_full_name && row.actor_email
        ? {
            id: row.decided_by,
            fullName: row.actor_full_name,
            email: row.actor_email,
          }
        : null,
  };
}

function mapAccountListUser(
  row: AccountListUserRow,
  nowSeconds = nowInSeconds(),
): AccountListUserView {
  const hasActiveSuspension =
    Boolean(row.ai_suspension_id) &&
    Number(row.ai_suspended_until ?? 0) > nowSeconds &&
    isAgentSuspensionPeriod(row.ai_suspension_period) &&
    Number(row.ai_suspended_at ?? -1) >= 0 &&
    Number(row.ai_suspension_threshold ?? 0) > 0 &&
    Number(row.ai_suspension_observed_count ?? 0) > 0;
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    reviewRequestCount: Number(row.review_request_count ?? 0),
    rewriteRequestCount: Number(row.rewrite_request_count ?? 0),
    periodRequestCount: Number(row.period_request_count ?? 0),
    periodReviewRequestCount: Number(row.period_review_request_count ?? 0),
    periodRewriteRequestCount: Number(row.period_rewrite_request_count ?? 0),
    aiSuspension: hasActiveSuspension
      ? {
          id: row.ai_suspension_id as string,
          startedAt: Number(row.ai_suspended_at),
          expiresAt: Number(row.ai_suspended_until),
          triggeredPeriod: row.ai_suspension_period as NonNullable<
            AccountListUserView["aiSuspension"]
          >["triggeredPeriod"],
          periodLabel: agentUsagePeriodLabel(
            row.ai_suspension_period as NonNullable<
              AccountListUserView["aiSuspension"]
            >["triggeredPeriod"],
          ),
          configuredThreshold: Number(row.ai_suspension_threshold),
          observedRequestCount: Number(row.ai_suspension_observed_count),
        }
      : null,
  };
}

const ACCOUNT_REQUEST_SELECT = `
  SELECT
    request.id,
    request.email,
    request.full_name,
    request.phone,
    request.company,
    request.department,
    request.job_title,
    request.admin_message,
    request.status,
    request.decided_by,
    request.decided_at,
    request.rejection_reason,
    request.created_at,
    request.updated_at,
    actor.full_name AS actor_full_name,
    actor.email AS actor_email
  FROM account_requests AS request
  LEFT JOIN users AS actor ON actor.id = request.decided_by
`;

export async function createPendingAccountRequest(
  database: D1Database,
  input: AccountRequestInput,
  attachments: readonly PendingAccountRequestAttachment[] = [],
) {
  const existingUser = await database
    .prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE LIMIT 1")
    .bind(input.email)
    .first<{ id: string }>();

  if (existingUser) {
    throw new AppError(
      "DUPLICATE_ACCOUNT_REQUEST",
      "An account request for this email is already pending or active.",
      409,
    );
  }

  const id = createId();
  const now = nowInSeconds();
  try {
    const requestInsert = database
      .prepare(
        `INSERT INTO account_requests (
          id, email, full_name, phone, company, department, job_title, admin_message,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      )
      .bind(
        id,
        input.email,
        input.fullName,
        input.phone,
        input.company,
        input.department,
        input.jobTitle,
        input.adminMessage,
        now,
        now,
      );
    if (attachments.length) {
      await database.batch([
        requestInsert,
        ...attachments.map((attachment) =>
          database
            .prepare(
              `INSERT INTO account_request_attachments (
                id, account_request_id, storage_key, original_name,
                content_type, size_bytes, created_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              attachment.id,
              id,
              attachment.storageKey,
              attachment.fileName,
              attachment.mimeType,
              attachment.size,
              attachment.createdAt,
            ),
        ),
      ]);
    } else {
      await requestInsert.run();
    }
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError(
        "DUPLICATE_ACCOUNT_REQUEST",
        "An account request for this email is already pending or active.",
        409,
      );
    }
    throw error;
  }

  const created = await getAccountRequestById(database, id);
  if (!created) {
    throw new AppError(
      "ACCOUNT_REQUEST_FAILED",
      "The account request could not be submitted. Please try again.",
      500,
    );
  }
  return created;
}

function mapAccountRequestAttachment(
  row: AccountRequestAttachmentRow,
): AccountRequestAttachmentView {
  return {
    id: row.id,
    fileName: row.original_name,
    mimeType: row.content_type,
    size: row.size_bytes,
    createdAt: row.created_at,
  };
}

async function attachmentsByAccountRequest(
  database: D1Database,
  requestIds: readonly string[],
) {
  const attachments = new Map<string, AccountRequestAttachmentView[]>();
  if (!requestIds.length) return attachments;
  const placeholders = requestIds.map(() => "?").join(", ");
  const result = await database
    .prepare(
      `SELECT
         id, account_request_id, storage_key, original_name,
         content_type, size_bytes, created_at
       FROM account_request_attachments
       WHERE account_request_id IN (${placeholders})
       ORDER BY created_at, id`,
    )
    .bind(...requestIds)
    .all<AccountRequestAttachmentRow>();
  for (const row of result.results) {
    const current = attachments.get(row.account_request_id) ?? [];
    current.push(mapAccountRequestAttachment(row));
    attachments.set(row.account_request_id, current);
  }
  return attachments;
}

export async function listAccountRequests(
  database: D1Database,
  status?: AccountRequestStatus,
) {
  const statement = status
    ? database
        .prepare(
          `${ACCOUNT_REQUEST_SELECT}
           WHERE request.status = ?
           ORDER BY request.created_at DESC
           LIMIT 200`,
        )
        .bind(status)
    : database.prepare(
        `${ACCOUNT_REQUEST_SELECT}
         ORDER BY request.created_at DESC
         LIMIT 200`,
      );
  const result = await statement.all<AccountRequestRow>();
  const attachments = await attachmentsByAccountRequest(
    database,
    result.results.map((row) => row.id),
  );
  return result.results.map((row) =>
    mapAccountRequest(row, attachments.get(row.id) ?? []),
  );
}

export async function getAccountRequestById(database: D1Database, id: string) {
  const row = await database
    .prepare(`${ACCOUNT_REQUEST_SELECT} WHERE request.id = ? LIMIT 1`)
    .bind(id)
    .first<AccountRequestRow>();
  if (!row) return null;
  const attachments = await attachmentsByAccountRequest(database, [row.id]);
  return mapAccountRequest(row, attachments.get(row.id) ?? []);
}

export async function getAccountRequestAttachmentByRequestId(
  database: D1Database,
  requestId: string,
  attachmentId?: string,
) {
  const statement = attachmentId
    ? database
        .prepare(
          `SELECT
             id, account_request_id, storage_key, original_name,
             content_type, size_bytes, created_at
           FROM account_request_attachments
           WHERE account_request_id = ? AND id = ?
           LIMIT 1`,
        )
        .bind(requestId, attachmentId)
    : database
        .prepare(
          `SELECT
             id, account_request_id, storage_key, original_name,
             content_type, size_bytes, created_at
           FROM account_request_attachments
           WHERE account_request_id = ?
           ORDER BY created_at, id
           LIMIT 1`,
        )
        .bind(requestId);
  const row = await statement.first<AccountRequestAttachmentRow>();
  return row
    ? {
        id: row.id,
        storageKey: row.storage_key,
        fileName: row.original_name,
        mimeType: row.content_type,
        size: row.size_bytes,
        createdAt: row.created_at,
      }
    : null;
}

export async function getAccountRoleSummary(database: D1Database) {
  const row = await database
    .prepare(
      `SELECT
        SUM(CASE WHEN role = 'employee' THEN 1 ELSE 0 END) AS employee_accounts,
        SUM(CASE WHEN role = 'client' THEN 1 ELSE 0 END) AS client_accounts
       FROM users
       WHERE status <> 'disabled'`,
    )
    .first<{ employee_accounts: number | null; client_accounts: number | null }>();
  return {
    employeeAccounts: Number(row?.employee_accounts ?? 0),
    clientAccounts: Number(row?.client_accounts ?? 0),
  };
}

export async function listUserAccounts(
  database: D1Database,
  role: UserRole,
  options: {
    usagePeriod?: AgentUsagePeriod;
    nowSeconds?: number;
  } = {},
) {
  const nowSeconds = options.nowSeconds ?? nowInSeconds();
  const usageWindow = resolveAgentUsageWindow(
    options.usagePeriod ?? DEFAULT_AGENT_USAGE_PERIOD,
    nowSeconds,
  );
  const periodUsageJoin = usageWindow.startAt === null
    ? ""
    : `LEFT JOIN (
         SELECT
           user_id,
           COUNT(*) AS request_count,
           SUM(CASE WHEN request_kind = 'review' THEN 1 ELSE 0 END)
             AS review_request_count,
           SUM(CASE WHEN request_kind = 'rewrite' THEN 1 ELSE 0 END)
             AS rewrite_request_count
         FROM agent_request_events
         WHERE attempted_at >= ? AND attempted_at <= ?
         GROUP BY user_id
       ) AS period_usage ON period_usage.user_id = account.id`;
  const periodRequestCount = usageWindow.startAt === null
    ? "COALESCE(usage.review_request_count, 0) + COALESCE(usage.rewrite_request_count, 0)"
    : "COALESCE(period_usage.request_count, 0)";
  const periodReviewRequestCount = usageWindow.startAt === null
    ? "COALESCE(usage.review_request_count, 0)"
    : "COALESCE(period_usage.review_request_count, 0)";
  const periodRewriteRequestCount = usageWindow.startAt === null
    ? "COALESCE(usage.rewrite_request_count, 0)"
    : "COALESCE(period_usage.rewrite_request_count, 0)";
  const prepared = database.prepare(
    `SELECT
       account.id,
       account.email,
       account.full_name,
       account.role,
       account.status,
       account.created_at,
       account.ai_suspension_id,
       account.ai_suspended_at,
       account.ai_suspended_until,
       account.ai_suspension_period,
       account.ai_suspension_threshold,
       account.ai_suspension_observed_count,
       COALESCE(usage.review_request_count, 0) AS review_request_count,
       COALESCE(usage.rewrite_request_count, 0) AS rewrite_request_count,
       ${periodRequestCount} AS period_request_count,
       ${periodReviewRequestCount} AS period_review_request_count,
       ${periodRewriteRequestCount} AS period_rewrite_request_count
     FROM users AS account
     LEFT JOIN agent_request_usage AS usage ON usage.user_id = account.id
     ${periodUsageJoin}
     WHERE account.role = ? AND account.status <> 'disabled'
     ORDER BY account.full_name COLLATE NOCASE, account.email COLLATE NOCASE
     LIMIT 500`,
  );
  const statement = usageWindow.startAt === null
    ? prepared.bind(role)
    : prepared.bind(usageWindow.startAt, usageWindow.endAt, role);
  const result = await statement.all<AccountListUserRow>();
  return result.results.map((row) => mapAccountListUser(row, nowSeconds));
}

export async function getActiveClientAccount(
  database: D1Database,
  id: string,
) {
  const row = await database
    .prepare(
      `SELECT
         id,
         email,
         full_name,
         role,
         status,
         created_at,
         ai_suspension_id,
         ai_suspended_at,
         ai_suspended_until,
         ai_suspension_period,
         ai_suspension_threshold,
         ai_suspension_observed_count
       FROM users
       WHERE id = ? AND role = 'client' AND status <> 'disabled'
       LIMIT 1`,
    )
    .bind(id)
    .first<AccountListUserRow>();
  return row ? mapAccountListUser(row) : null;
}

export async function updateClientRemovalEmailStatus(
  database: D1Database,
  auditId: string,
  delivery: {
    status: "sent" | "preview" | "failed";
    providerMessageId?: string;
    errorCode?: string;
  },
) {
  await database
    .prepare(
      `UPDATE client_removal_audit_records
       SET email_status = ?, provider_message_id = ?, email_error_code = ?
       WHERE id = ?`,
    )
    .bind(
      delivery.status,
      delivery.providerMessageId ?? null,
      delivery.errorCode ?? null,
      auditId,
    )
    .run();
}

export function getUserByEmail(database: D1Database, email: string) {
  return database
    .prepare(
      `SELECT id, email, full_name, password_hash, role, status
       FROM users
       WHERE email = ? COLLATE NOCASE
       LIMIT 1`,
    )
    .bind(email)
    .first<UserAuthRow>();
}

export function getSetupTokenByHash(database: D1Database, tokenHash: string) {
  return database
    .prepare(
      `SELECT
        token.id,
        token.user_id,
        token.expires_at,
        token.used_at,
        token.invalidated_at,
        user.email,
        user.full_name,
        user.status AS user_status,
        user.role AS user_role
       FROM password_setup_tokens AS token
       INNER JOIN users AS user ON user.id = token.user_id
       WHERE token.token_hash = ?
       LIMIT 1`,
    )
    .bind(tokenHash)
    .first<SetupTokenRow>();
}

export async function recordEmailDelivery(
  database: D1Database,
  values: {
    accountRequestId: string | null;
    messageType: "new_request" | "approved_setup" | "rejected";
    recipient: string;
    status: "sent" | "preview" | "failed";
    providerMessageId?: string;
    errorCode?: string;
  },
) {
  const now = nowInSeconds();
  await database
    .prepare(
      `INSERT INTO email_delivery_records (
        id, account_request_id, message_type, recipient, status,
        provider_message_id, error_code, created_at, sent_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      createId(),
      values.accountRequestId,
      values.messageType,
      values.recipient,
      values.status,
      values.providerMessageId ?? null,
      values.errorCode ?? null,
      now,
      values.status === "sent" ? now : null,
    )
    .run();
}
