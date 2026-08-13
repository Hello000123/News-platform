import type { D1Database, D1Result } from "@cloudflare/workers-types";

import {
  getPasswordPepper,
  getPasswordSetupTtlSeconds,
} from "@/lib/server/auth/config";
import {
  createId,
  nowInSeconds,
  randomToken,
  sealPasswordProof,
  sha256,
} from "@/lib/server/auth/crypto";
import {
  approvedAccountEmail,
  deliverEmail,
  newAccountRequestEmail,
  rejectedAccountEmail,
  removedClientAccountEmail,
  suspendedClientAccountEmail,
  type EmailDeliveryResult,
} from "@/lib/server/auth/email";
import {
  createPendingAccountRequest,
  getAccountRequestById,
  getActiveClientAccount,
  getSetupTokenByHash,
  recordEmailDelivery,
} from "@/lib/server/auth/repository";
import { validateUploadedFile } from "@/lib/server/uploads/file-processing";
import {
  getAccountDocumentBucket,
  managedNewsImageKey,
  newsImageStorageKey,
} from "@/lib/server/uploads/storage";
import { buildSessionMaterial, type SessionMaterial } from "@/lib/server/auth/sessions";
import { AppError } from "@/lib/server/errors";
import {
  PASSWORD_PROOF_BYTES,
  PASSWORD_SALT_BYTES,
  SCRYPT_BLOCK_SIZE,
  SCRYPT_COST,
  SCRYPT_PARALLELIZATION,
} from "@/lib/shared/auth-contracts";
import type {
  AccountRequestInput,
  AccountRequestView,
  AuthenticatedUser,
  ClientRemovalAuditView,
  ClientSuspensionAuditView,
  PasswordDerivation,
} from "@/lib/shared/auth-contracts";
import {
  MAX_UPLOAD_BYTES,
  totalUploadBytes,
  validateUploadCollection,
} from "@/lib/shared/file-upload";

function changed(result: D1Result) {
  return Number(result.meta.changes ?? 0);
}

function scryptPasswordDerivation(salt: string): PasswordDerivation {
  return {
    algorithm: "scrypt",
    salt,
    cost: SCRYPT_COST,
    blockSize: SCRYPT_BLOCK_SIZE,
    parallelization: SCRYPT_PARALLELIZATION,
    keyLength: PASSWORD_PROOF_BYTES,
  };
}

async function recordDelivery(
  database: D1Database,
  request: AccountRequestView,
  messageType: "new_request" | "approved_setup" | "rejected",
  recipient: string,
  delivery: EmailDeliveryResult,
) {
  await recordEmailDelivery(database, {
    accountRequestId: request.id,
    messageType,
    recipient,
    status: delivery.status,
    providerMessageId: delivery.providerMessageId,
    errorCode: delivery.errorCode,
  });
}

export async function submitAccountRequest(
  database: D1Database,
  input: AccountRequestInput,
  publicAppUrl: string,
  attachmentFiles: readonly File[] = [],
) {
  const attachments: Array<{
    id: string;
    storageKey: string;
    fileName: string;
    mimeType: string;
    size: number;
    createdAt: number;
  }> = [];
  let bucket: ReturnType<typeof getAccountDocumentBucket> | undefined;

  if (attachmentFiles.length) {
    const collection = validateUploadCollection(attachmentFiles);
    if ("error" in collection) {
      const tooLarge =
        totalUploadBytes(attachmentFiles) > MAX_UPLOAD_BYTES ||
        attachmentFiles.some((file) => file.size > MAX_UPLOAD_BYTES);
      throw new AppError(
        tooLarge ? "UPLOAD_TOTAL_TOO_LARGE" : "INVALID_UPLOAD_SELECTION",
        collection.error ?? "The selected files are invalid.",
        tooLarge ? 413 : 400,
      );
    }
    const validatedFiles = await Promise.all(
      attachmentFiles.map((file) => validateUploadedFile(file)),
    );
    bucket = getAccountDocumentBucket();
    try {
      for (const validated of validatedFiles) {
        const attachment = {
          id: createId(),
          storageKey: `account-requests/${createId()}`,
          fileName: validated.safeName,
          mimeType: validated.mimeType,
          size: validated.size,
          createdAt: nowInSeconds(),
        };
        attachments.push(attachment);
        await bucket.put(attachment.storageKey, validated.bytes, {
          httpMetadata: { contentType: attachment.mimeType },
        });
      }
    } catch (error) {
      await Promise.allSettled(
        attachments.map((attachment) => bucket!.delete(attachment.storageKey)),
      );
      throw new AppError(
        "DOCUMENT_STORAGE_UNAVAILABLE",
        "The supporting documents could not be stored securely. Try again later.",
        503,
        { cause: error },
      );
    }
  }

  let request: AccountRequestView;
  try {
    request = await createPendingAccountRequest(database, input, attachments);
  } catch (error) {
    if (attachments.length && bucket) {
      await Promise.allSettled(
        attachments.map((attachment) => bucket!.delete(attachment.storageKey)),
      );
    }
    throw error;
  }
  let delivery: EmailDeliveryResult;
  try {
    delivery = await deliverEmail(newAccountRequestEmail(request, publicAppUrl));
  } catch {
    delivery = { status: "failed", errorCode: "TEMPLATE_CONFIGURATION" };
  }
  await recordDelivery(
    database,
    request,
    "new_request",
    process.env.ACCOUNT_APPROVAL_NOTIFICATION_EMAIL?.trim().toLowerCase() ||
      "employee@example.test",
    delivery,
  );
  return { request, delivery };
}

function assertEmployee(employee: AuthenticatedUser) {
  if (employee.role !== "employee") {
    throw new AppError(
      "FORBIDDEN",
      "You do not have permission to perform this action.",
      403,
    );
  }
}

export async function approveAccountRequest(
  database: D1Database,
  requestId: string,
  employee: AuthenticatedUser,
  publicAppUrl: string,
) {
  assertEmployee(employee);
  const existing = await getAccountRequestById(database, requestId);
  if (!existing) {
    throw new AppError("ACCOUNT_REQUEST_NOT_FOUND", "Account request not found.", 404);
  }
  if (existing.status !== "pending") {
    throw new AppError(
      "ACCOUNT_REQUEST_ALREADY_DECIDED",
      "This account request has already been decided.",
      409,
    );
  }

  const now = nowInSeconds();
  const decisionId = createId();
  const userId = createId();
  const tokenId = createId();
  const auditId = createId();
  const rawToken = randomToken();
  const tokenHash = await sha256(rawToken);
  const expiresAt = now + getPasswordSetupTtlSeconds();
  const setupUrl = `${publicAppUrl}/setup-password#token=${encodeURIComponent(rawToken)}`;

  try {
    const results = await database.batch([
      database
        .prepare(
          `UPDATE account_requests
           SET status = 'approved',
               decided_by = ?,
               decided_at = ?,
               rejection_reason = NULL,
               decision_id = ?,
               updated_at = ?
           WHERE id = ? AND status = 'pending'`,
        )
        .bind(employee.id, now, decisionId, now, requestId),
      database
        .prepare(
          `INSERT INTO users (
            id, email, full_name, phone, company, department, job_title,
            password_hash, role, status, account_request_id, created_at, updated_at
           )
           SELECT
            ?, email, full_name, phone, company, department, job_title,
            NULL, 'client', 'setup_pending', id, ?, ?
           FROM account_requests
           WHERE id = ? AND decision_id = ?`,
        )
        .bind(userId, now, now, requestId, decisionId),
      database
        .prepare(
          `INSERT INTO password_setup_tokens (
            id, user_id, token_hash, expires_at, created_at
           ) VALUES (
            ?,
            (
              SELECT user.id
              FROM users AS user
              INNER JOIN account_requests AS request
                ON request.id = user.account_request_id
              WHERE request.id = ?
                AND request.decision_id = ?
                AND user.status = 'setup_pending'
              LIMIT 1
            ),
            ?,
            ?,
            ?
           )`,
        )
        .bind(tokenId, requestId, decisionId, tokenHash, expiresAt, now),
      database
        .prepare(
          `INSERT INTO approval_audit_records (
            id, account_request_id, actor_user_id, action, created_at
           ) VALUES (?, ?, ?, 'approved', ?)`,
        )
        .bind(auditId, requestId, employee.id, now),
    ]);
    if (changed(results[0]) !== 1 || changed(results[2]) !== 1) {
      throw new Error("Approval state changed concurrently.");
    }
  } catch (error) {
    const latest = await getAccountRequestById(database, requestId);
    if (latest?.status !== "pending") {
      throw new AppError(
        "ACCOUNT_REQUEST_ALREADY_DECIDED",
        "This account request has already been decided.",
        409,
      );
    }
    throw new AppError(
      "ACCOUNT_APPROVAL_FAILED",
      "The account could not be approved. Please try again.",
      500,
      { cause: error },
    );
  }

  const request = await getAccountRequestById(database, requestId);
  if (!request) {
    throw new AppError(
      "ACCOUNT_APPROVAL_FAILED",
      "The account could not be approved. Please try again.",
      500,
    );
  }
  const delivery = await deliverEmail(approvedAccountEmail(request, setupUrl, expiresAt));
  await recordDelivery(database, request, "approved_setup", request.email, delivery);
  return { request, delivery };
}

export async function rejectAccountRequest(
  database: D1Database,
  requestId: string,
  employee: AuthenticatedUser,
  rejectionReason?: string,
) {
  assertEmployee(employee);
  const existing = await getAccountRequestById(database, requestId);
  if (!existing) {
    throw new AppError("ACCOUNT_REQUEST_NOT_FOUND", "Account request not found.", 404);
  }
  if (existing.status !== "pending") {
    throw new AppError(
      "ACCOUNT_REQUEST_ALREADY_DECIDED",
      "This account request has already been decided.",
      409,
    );
  }

  const now = nowInSeconds();
  const decisionId = createId();
  const results = await database.batch([
    database
      .prepare(
        `UPDATE account_requests
         SET status = 'rejected',
             decided_by = ?,
             decided_at = ?,
             rejection_reason = ?,
             decision_id = ?,
             updated_at = ?
         WHERE id = ? AND status = 'pending'`,
      )
      .bind(employee.id, now, rejectionReason || null, decisionId, now, requestId),
    database
      .prepare(
        `INSERT INTO approval_audit_records (
          id, account_request_id, actor_user_id, action, reason, created_at
         )
         SELECT ?, id, ?, 'rejected', ?, ?
         FROM account_requests
         WHERE id = ? AND decision_id = ?`,
      )
      .bind(
        createId(),
        employee.id,
        rejectionReason || null,
        now,
        requestId,
        decisionId,
      ),
  ]);

  if (changed(results[0]) !== 1) {
    throw new AppError(
      "ACCOUNT_REQUEST_ALREADY_DECIDED",
      "This account request has already been decided.",
      409,
    );
  }

  const request = await getAccountRequestById(database, requestId);
  if (!request) {
    throw new AppError(
      "ACCOUNT_REJECTION_FAILED",
      "The account request could not be rejected. Please try again.",
      500,
    );
  }
  const delivery = await deliverEmail(rejectedAccountEmail(request, rejectionReason));
  await recordDelivery(database, request, "rejected", request.email, delivery);
  return { request, delivery };
}

export async function resendPasswordSetupEmail(
  database: D1Database,
  requestId: string,
  employee: AuthenticatedUser,
  publicAppUrl: string,
) {
  assertEmployee(employee);
  const request = await getAccountRequestById(database, requestId);
  if (!request) {
    throw new AppError("ACCOUNT_REQUEST_NOT_FOUND", "Account request not found.", 404);
  }
  if (request.status !== "approved") {
    throw new AppError(
      "SETUP_EMAIL_NOT_AVAILABLE",
      "A setup email is available only for an approved request.",
      409,
    );
  }

  const user = await database
    .prepare(
      `SELECT id FROM users
       WHERE account_request_id = ? AND status = 'setup_pending'
       LIMIT 1`,
    )
    .bind(requestId)
    .first<{ id: string }>();
  if (!user) {
    throw new AppError(
      "SETUP_EMAIL_NOT_AVAILABLE",
      "This account has already completed setup or is not active.",
      409,
    );
  }

  const now = nowInSeconds();
  const expiresAt = now + getPasswordSetupTtlSeconds();
  const rawToken = randomToken();
  const setupUrl = `${publicAppUrl}/setup-password#token=${encodeURIComponent(rawToken)}`;
  await database.batch([
    database
      .prepare(
        `UPDATE password_setup_tokens
         SET invalidated_at = ?
         WHERE user_id = ? AND used_at IS NULL AND invalidated_at IS NULL`,
      )
      .bind(now, user.id),
    database
      .prepare(
        `INSERT INTO password_setup_tokens (
          id, user_id, token_hash, expires_at, created_at
         ) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(createId(), user.id, await sha256(rawToken), expiresAt, now),
    database
      .prepare(
        `INSERT INTO approval_audit_records (
          id, account_request_id, actor_user_id, action, created_at
         ) VALUES (?, ?, ?, 'setup_email_resent', ?)`,
      )
      .bind(createId(), requestId, employee.id, now),
  ]);

  const delivery = await deliverEmail(approvedAccountEmail(request, setupUrl, expiresAt));
  await recordDelivery(database, request, "approved_setup", request.email, delivery);
  return { request, delivery };
}

export async function removeClientAccount(
  database: D1Database,
  clientId: string,
  employee: AuthenticatedUser,
  removalMessage: string,
  confirmationName: string,
) {
  assertEmployee(employee);
  const client = await getActiveClientAccount(database, clientId);
  if (!client) {
    throw new AppError(
      "CLIENT_ACCOUNT_NOT_FOUND",
      "The client account could not be found or has already been removed.",
      404,
    );
  }
  if (confirmationName.normalize("NFC") !== client.fullName.normalize("NFC")) {
    throw new AppError(
      "CLIENT_NAME_CONFIRMATION_MISMATCH",
      "Type the client name exactly as shown to confirm removal.",
      400,
    );
  }

  const auditId = createId();
  const now = nowInSeconds();
  const attachmentKeys = await database
    .prepare(
      `SELECT attachment.storage_key
       FROM account_request_attachments AS attachment
       INNER JOIN account_requests AS request
         ON request.id = attachment.account_request_id
       WHERE request.email = ? COLLATE NOCASE`,
    )
    .bind(client.email)
    .all<{ storage_key: string }>();
  const ownedImageUrls = await database
    .prepare(
      `SELECT DISTINCT owned.image_url
       FROM pipeline_articles AS owned
       WHERE (
         owned.published_by_user_id = ? OR
         owned.feed_id IN (
           SELECT id FROM feeds WHERE created_by_user_id = ?
         )
       )
         AND owned.image_url IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM pipeline_articles AS retained
           WHERE retained.id <> owned.id
             AND retained.image_url = owned.image_url
             AND NOT (
               retained.published_by_user_id = ? OR
               retained.feed_id IN (
                 SELECT id FROM feeds WHERE created_by_user_id = ?
               )
             )
         )`,
    )
    .bind(clientId, clientId, clientId, clientId)
    .all<{ image_url: string }>();
  const storageKeys = new Set(
    attachmentKeys.results.map(({ storage_key: storageKey }) => storageKey),
  );
  for (const { image_url: imageUrl } of ownedImageUrls.results) {
    const managedKey = managedNewsImageKey(imageUrl);
    if (managedKey) storageKeys.add(newsImageStorageKey(managedKey));
  }
  if (storageKeys.size > 0) {
    const bucket = getAccountDocumentBucket();
    const keys = [...storageKeys];
    try {
      for (let index = 0; index < keys.length; index += 1_000) {
        await bucket.delete(keys.slice(index, index + 1_000));
      }
    } catch (error) {
      throw new AppError(
        "CLIENT_DATA_DELETION_FAILED",
        "The client data could not be removed completely. No database records were deleted.",
        503,
        { cause: error },
      );
    }
  }

  await database.batch([
    database
      .prepare(
        `UPDATE pipeline_articles
         SET merged_into_article_id = NULL
         WHERE merged_into_article_id IN (
           SELECT id
           FROM pipeline_articles
           WHERE published_by_user_id = ?
              OR feed_id IN (
                SELECT id FROM feeds WHERE created_by_user_id = ?
              )
         )`,
      )
      .bind(clientId, clientId),
    database
      .prepare(
        `DELETE FROM pipeline_rewrite_debug_logs
         WHERE requested_by_user_id = ?
            OR article_id IN (
              SELECT id
              FROM pipeline_articles
              WHERE published_by_user_id = ?
                 OR feed_id IN (
                   SELECT id FROM feeds WHERE created_by_user_id = ?
                 )
            )`,
      )
      .bind(clientId, clientId, clientId),
    database
      .prepare(
        `DELETE FROM article_presentations
         WHERE draft_updated_by_user_id = ?
            OR published_by_user_id = ?
            OR article_id IN (
              SELECT id
              FROM pipeline_articles
              WHERE published_by_user_id = ?
                 OR feed_id IN (
                   SELECT id FROM feeds WHERE created_by_user_id = ?
                 )
            )`,
      )
      .bind(clientId, clientId, clientId, clientId),
    database
      .prepare(
        `DELETE FROM public_page_presentations
         WHERE draft_updated_by_user_id = ? OR published_by_user_id = ?`,
      )
      .bind(clientId, clientId),
    database
      .prepare(
        `DELETE FROM client_company_summaries
         WHERE client_user_id = ? OR generated_by_user_id = ?`,
      )
      .bind(clientId, clientId),
    database
      .prepare(
        `DELETE FROM pipeline_rewrite_commits
         WHERE requested_by_user_id = ?
            OR article_id IN (
              SELECT id
              FROM pipeline_articles
              WHERE published_by_user_id = ?
                 OR feed_id IN (
                   SELECT id FROM feeds WHERE created_by_user_id = ?
                 )
            )`,
      )
      .bind(clientId, clientId, clientId),
    database
      .prepare(
        `DELETE FROM pipeline_articles
         WHERE published_by_user_id = ?
            OR feed_id IN (
              SELECT id FROM feeds WHERE created_by_user_id = ?
            )`,
      )
      .bind(clientId, clientId),
    database
      .prepare("DELETE FROM feeds WHERE created_by_user_id = ?")
      .bind(clientId),
    database
      .prepare(
        "DELETE FROM agent_usage_suspension_audit_records WHERE subject_user_id = ?",
      )
      .bind(clientId),
    database
      .prepare(
        `DELETE FROM client_account_suspension_audit_records
         WHERE client_user_id = ? OR actor_user_id = ?`,
      )
      .bind(clientId, clientId),
    database
      .prepare(
        `DELETE FROM client_removal_audit_records
         WHERE removed_client_user_id = ?
            OR client_email = ? COLLATE NOCASE
            OR actor_user_id = ?`,
      )
      .bind(clientId, client.email, clientId),
    database
      .prepare(
        `DELETE FROM email_delivery_records
         WHERE recipient = ? COLLATE NOCASE
            OR account_request_id IN (
              SELECT id FROM account_requests WHERE email = ? COLLATE NOCASE
            )`,
      )
      .bind(client.email, client.email),
    database
      .prepare("DELETE FROM approval_audit_records WHERE actor_user_id = ?")
      .bind(clientId),
    database
      .prepare("UPDATE account_requests SET decided_by = NULL WHERE decided_by = ?")
      .bind(clientId),
    database
      .prepare(
        "DELETE FROM agent_usage_threshold_audit_records WHERE actor_user_id = ?",
      )
      .bind(clientId),
    database
      .prepare(
        `UPDATE agent_usage_thresholds
         SET updated_by_user_id = NULL
         WHERE updated_by_user_id = ?`,
      )
      .bind(clientId),
    database
      .prepare("DELETE FROM users WHERE id = ? AND role = 'client'")
      .bind(clientId),
    database
      .prepare("DELETE FROM account_requests WHERE email = ? COLLATE NOCASE")
      .bind(client.email),
  ]);

  const remainingClient = await database
    .prepare("SELECT id FROM users WHERE id = ? LIMIT 1")
    .bind(clientId)
    .first<{ id: string }>();
  if (remainingClient) {
    throw new AppError(
      "CLIENT_ACCOUNT_ALREADY_REMOVED",
      "The client account has already been removed.",
      409,
    );
  }

  const delivery = await deliverEmail(
    removedClientAccountEmail(client, removalMessage),
  );

  const audit: ClientRemovalAuditView = {
    id: auditId,
    removedClientAccountId: client.id,
    clientEmail: client.email,
    administratorAccountId: employee.id,
    removalMessage,
    createdAt: now,
  };
  return { client, audit, delivery };
}

async function updateClientSuspensionEmailStatus(
  database: D1Database,
  auditId: string,
  delivery: EmailDeliveryResult,
) {
  await database
    .prepare(
      `UPDATE client_account_suspension_audit_records
       SET email_status = ?, provider_message_id = ?, email_error_code = ?
       WHERE id = ? AND action = 'manual_suspended'`,
    )
    .bind(
      delivery.status,
      delivery.providerMessageId ?? null,
      delivery.errorCode ?? null,
      auditId,
    )
    .run();
}

export async function suspendClientAccount(
  database: D1Database,
  clientId: string,
  employee: AuthenticatedUser,
  reason: string,
) {
  assertEmployee(employee);
  const client = await getActiveClientAccount(database, clientId);
  if (!client || client.status !== "active") {
    throw new AppError(
      "CLIENT_ACCOUNT_NOT_FOUND",
      "The active client account could not be found.",
      404,
    );
  }
  if (client.manualSuspension || client.aiSuspension) {
    throw new AppError(
      "CLIENT_ACCOUNT_ALREADY_SUSPENDED",
      "The client account is already suspended.",
      409,
    );
  }

  const auditId = createId();
  const now = nowInSeconds();
  const results = await database.batch([
    database
      .prepare(
        `INSERT INTO client_account_suspension_audit_records (
           id, client_user_id, actor_user_id, action, reason, created_at,
           email_status
         )
         SELECT ?, id, ?, 'manual_suspended', ?, ?, 'pending'
         FROM users
         WHERE id = ?
           AND role = 'client'
           AND status = 'active'
           AND manual_suspended_at IS NULL
           AND (ai_suspended_until IS NULL OR ai_suspended_until <= ?)`,
      )
      .bind(auditId, employee.id, reason, now, clientId, now),
    database
      .prepare(
        `UPDATE users
         SET manual_suspended_at = ?,
             manual_suspension_reason = ?,
             manual_suspended_by_user_id = ?,
             updated_at = ?
         WHERE id = ?
           AND role = 'client'
           AND status = 'active'
           AND manual_suspended_at IS NULL
           AND (ai_suspended_until IS NULL OR ai_suspended_until <= ?)
           AND EXISTS (
             SELECT 1
             FROM client_account_suspension_audit_records
             WHERE id = ? AND client_user_id = users.id
           )`,
      )
      .bind(now, reason, employee.id, now, clientId, now, auditId),
    database
      .prepare(
        `UPDATE sessions
         SET revoked_at = ?
         WHERE user_id = ?
           AND revoked_at IS NULL
           AND EXISTS (
             SELECT 1
             FROM client_account_suspension_audit_records
             WHERE id = ? AND client_user_id = sessions.user_id
           )`,
      )
      .bind(now, clientId, auditId),
  ]);
  if (changed(results[0]) !== 1 || changed(results[1]) !== 1) {
    throw new AppError(
      "CLIENT_ACCOUNT_ALREADY_SUSPENDED",
      "The client account is already suspended.",
      409,
    );
  }

  const delivery = await deliverEmail(
    suspendedClientAccountEmail(client, reason),
  );
  try {
    await updateClientSuspensionEmailStatus(database, auditId, delivery);
  } catch (error) {
    console.error("[auth-client-suspension] Delivery status update failed.", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
  }

  const suspendedClient = await getActiveClientAccount(database, clientId);
  if (!suspendedClient?.manualSuspension) {
    throw new AppError(
      "CLIENT_SUSPENSION_STATE_UNAVAILABLE",
      "The client was suspended, but the updated account state could not be loaded.",
      500,
    );
  }
  const audit: ClientSuspensionAuditView = {
    id: auditId,
    clientAccountId: clientId,
    administratorAccountId: employee.id,
    action: "manual_suspended",
    reason,
    recoveredManualSuspension: false,
    recoveredAutomaticSuspension: false,
    createdAt: now,
  };
  return { client: suspendedClient, audit, delivery };
}

export async function recoverClientAccount(
  database: D1Database,
  clientId: string,
  employee: AuthenticatedUser,
) {
  assertEmployee(employee);
  const client = await getActiveClientAccount(database, clientId);
  if (!client || client.status !== "active") {
    throw new AppError(
      "CLIENT_ACCOUNT_NOT_FOUND",
      "The active client account could not be found.",
      404,
    );
  }
  if (!client.manualSuspension && !client.aiSuspension) {
    throw new AppError(
      "CLIENT_ACCOUNT_NOT_SUSPENDED",
      "The client account is not currently suspended.",
      409,
    );
  }

  const auditId = createId();
  const now = nowInSeconds();
  const results = await database.batch([
    database
      .prepare(
        `INSERT INTO client_account_suspension_audit_records (
           id, client_user_id, actor_user_id, action, reason,
           recovered_manual_suspension, recovered_automatic_suspension,
           created_at, email_status
         )
         SELECT ?, id, ?, 'recovered', NULL,
                CASE WHEN manual_suspended_at IS NOT NULL THEN 1 ELSE 0 END,
                CASE WHEN ai_suspended_until > ? THEN 1 ELSE 0 END,
                ?, 'not_attempted'
         FROM users
         WHERE id = ?
           AND role = 'client'
           AND status = 'active'
           AND (
             manual_suspended_at IS NOT NULL OR
             ai_suspended_until > ?
           )`,
      )
      .bind(auditId, employee.id, now, now, clientId, now),
    database
      .prepare(
        `UPDATE users
         SET manual_suspended_at = NULL,
             manual_suspension_reason = NULL,
             manual_suspended_by_user_id = NULL,
             ai_suspension_id = NULL,
             ai_suspended_at = NULL,
             ai_suspended_until = NULL,
             ai_suspension_period = NULL,
             ai_suspension_threshold = NULL,
             ai_suspension_observed_count = NULL,
             updated_at = ?
         WHERE id = ?
           AND role = 'client'
           AND status = 'active'
           AND EXISTS (
             SELECT 1
             FROM client_account_suspension_audit_records
             WHERE id = ? AND client_user_id = users.id
           )`,
      )
      .bind(now, clientId, auditId),
    database
      .prepare(
        `UPDATE sessions
         SET revoked_at = ?
         WHERE user_id = ? AND revoked_at IS NULL`,
      )
      .bind(now, clientId),
  ]);
  if (changed(results[0]) !== 1 || changed(results[1]) !== 1) {
    throw new AppError(
      "CLIENT_ACCOUNT_NOT_SUSPENDED",
      "The client account is not currently suspended.",
      409,
    );
  }

  const recoveredClient = await getActiveClientAccount(database, clientId);
  if (!recoveredClient) {
    throw new AppError(
      "CLIENT_RECOVERY_STATE_UNAVAILABLE",
      "The client was recovered, but the updated account state could not be loaded.",
      500,
    );
  }
  const audit: ClientSuspensionAuditView = {
    id: auditId,
    clientAccountId: clientId,
    administratorAccountId: employee.id,
    action: "recovered",
    reason: null,
    recoveredManualSuspension: Boolean(client.manualSuspension),
    recoveredAutomaticSuspension: Boolean(client.aiSuspension),
    createdAt: now,
  };
  return { client: recoveredClient, audit };
}

export async function inspectPasswordSetupToken(database: D1Database, rawToken: string) {
  if (rawToken.length < 32 || rawToken.length > 256) return null;
  const token = await getSetupTokenByHash(database, await sha256(rawToken));
  const now = nowInSeconds();
  if (
    !token ||
    token.used_at ||
    token.invalidated_at ||
    token.expires_at <= now ||
    token.user_status !== "setup_pending"
  ) {
    return null;
  }
  return {
    email: token.email,
    fullName: token.full_name,
    expiresAt: token.expires_at,
    derivation: scryptPasswordDerivation(randomToken(PASSWORD_SALT_BYTES)),
  };
}

export async function completePasswordSetup(
  database: D1Database,
  rawToken: string,
  passwordSalt: string,
  passwordProof: string,
  request: Request,
) {
  const tokenHash = await sha256(rawToken);
  const token = await getSetupTokenByHash(database, tokenHash);
  const now = nowInSeconds();
  if (
    !token ||
    token.used_at ||
    token.invalidated_at ||
    token.expires_at <= now ||
    token.user_status !== "setup_pending"
  ) {
    throw new AppError(
      "INVALID_SETUP_TOKEN",
      "This password setup link is invalid, expired, or has already been used.",
      400,
    );
  }

  const passwordHash = await sealPasswordProof(
    token.user_id,
    scryptPasswordDerivation(passwordSalt),
    passwordProof,
    getPasswordPepper(),
  );
  const session = await buildSessionMaterial(token.user_id, request);

  try {
    await database.batch([
      database
        .prepare(
          `UPDATE password_setup_tokens
           SET used_at = ?, consumed_by_session_id = ?
           WHERE id = ?
             AND used_at IS NULL
             AND invalidated_at IS NULL
             AND expires_at > ?`,
        )
        .bind(now, session.id, token.id, now),
      database
        .prepare(
          `UPDATE users
           SET password_hash = ?,
               status = 'active',
               password_set_at = ?,
               updated_at = ?
           WHERE id = ?
             AND status = 'setup_pending'
             AND EXISTS (
               SELECT 1
               FROM password_setup_tokens
               WHERE id = ? AND consumed_by_session_id = ?
             )`,
        )
        .bind(passwordHash, now, now, token.user_id, token.id, session.id),
      database
        .prepare(
          `UPDATE sessions
           SET revoked_at = ?
           WHERE user_id = ? AND revoked_at IS NULL`,
        )
        .bind(now, token.user_id),
      database
        .prepare(
          `INSERT INTO sessions (
            id, user_id, token_hash, csrf_token_hash, expires_at,
            created_at, last_seen_at, ip_hash, user_agent_hash
           ) VALUES (
            ?,
            (
              SELECT user.id
              FROM users AS user
              INNER JOIN password_setup_tokens AS setup
                ON setup.user_id = user.id
              WHERE setup.id = ?
                AND setup.consumed_by_session_id = ?
                AND user.status = 'active'
              LIMIT 1
            ),
            ?, ?, ?, ?, ?, ?, ?
           )`,
        )
        .bind(
          session.id,
          token.id,
          session.id,
          session.tokenHash,
          session.csrfTokenHash,
          session.expiresAt,
          session.createdAt,
          session.createdAt,
          session.ipHash,
          session.userAgentHash,
        ),
      database
        .prepare(
          `UPDATE password_setup_tokens
           SET invalidated_at = ?
           WHERE user_id = ?
             AND id <> ?
             AND used_at IS NULL
             AND invalidated_at IS NULL`,
        )
        .bind(now, token.user_id, token.id),
    ]);
  } catch {
    throw new AppError(
      "INVALID_SETUP_TOKEN",
      "This password setup link is invalid, expired, or has already been used.",
      400,
    );
  }

  return {
    session: session satisfies SessionMaterial,
    user: {
      id: token.user_id,
      email: token.email,
      fullName: token.full_name,
      role: token.user_role,
    },
  };
}
