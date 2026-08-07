import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { R2Bucket } from "@cloudflare/workers-types";

import { AppError } from "@/lib/server/errors";

let testBucket: R2Bucket | undefined;
let testNewsImageBucket: R2Bucket | undefined;

export const NEWS_IMAGE_STORAGE_PREFIX = "news-images/";
export const NEWS_IMAGE_KEY_PATTERN = /^[0-9a-f]{32}$/u;

export function setAccountDocumentBucketForTesting(
  bucket: R2Bucket | undefined,
) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("The R2 test override is available only while running tests.");
  }
  testBucket = bucket;
}

export function setNewsImageBucketForTesting(bucket: R2Bucket | undefined) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("The R2 test override is available only while running tests.");
  }
  testNewsImageBucket = bucket;
}

function accountDocumentBucketBinding() {
  const bucket = getCloudflareContext().env.ACCOUNT_DOCUMENTS;
  if (!bucket) throw new Error("Missing ACCOUNT_DOCUMENTS binding.");
  return bucket;
}

export function getAccountDocumentBucket() {
  if (testBucket) return testBucket;
  try {
    return accountDocumentBucketBinding();
  } catch (error) {
    throw new AppError(
      "DOCUMENT_STORAGE_UNAVAILABLE",
      "Supporting-document storage is temporarily unavailable. Try again later.",
      503,
      { cause: error },
    );
  }
}

/**
 * News images share the private ACCOUNT_DOCUMENTS bucket, but are isolated under
 * a dedicated namespace and are only served through the capability-key route.
 */
export function getNewsImageBucket() {
  if (testNewsImageBucket) return testNewsImageBucket;
  try {
    return accountDocumentBucketBinding();
  } catch (error) {
    throw new AppError(
      "NEWS_IMAGE_STORAGE_UNAVAILABLE",
      "News-image storage is temporarily unavailable. Try again later.",
      503,
      { cause: error },
    );
  }
}

export function isValidNewsImageKey(key: string) {
  return NEWS_IMAGE_KEY_PATTERN.test(key);
}

export function newsImageStorageKey(key: string) {
  if (!isValidNewsImageKey(key)) {
    throw new AppError("NEWS_IMAGE_NOT_FOUND", "The image was not found.", 404);
  }
  return `${NEWS_IMAGE_STORAGE_PREFIX}${key}`;
}

export function managedNewsImageKey(imageUrl: string | null | undefined) {
  if (!imageUrl) return null;
  const match = /^\/api\/news-images\/([0-9a-f]{32})(?:\?v=\d+)?$/u.exec(imageUrl);
  return match?.[1] ?? null;
}
