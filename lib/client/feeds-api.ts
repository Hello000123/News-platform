import { csrfHeaders } from "@/lib/client/auth-api";
import { MAX_REQUEST_BYTES } from "@/lib/shared/contracts";
import type {
  FeedFetchResult,
  FeedInput,
  FeedUpdateInput,
  FeedView,
  PipelineArticleStatus,
  PipelineArticleView,
  PipelineRewriteInput,
  PopularPipelineStory,
  ScrapedArticleInput,
} from "@/lib/shared/feeds-contracts";

export const SCRAPED_IMPORT_SAFE_BYTES = MAX_REQUEST_BYTES - 8_192;

export class FeedRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "FeedRequestError";
  }
}

interface ErrorBody {
  error?: {
    code?: string;
    message?: string;
    fieldErrors?: Record<string, string[]>;
  };
}

async function requestJson<T>(endpoint: string, init: RequestInit): Promise<T> {
  const response = await fetch(endpoint, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...init.headers,
    },
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new FeedRequestError(
      "INVALID_SERVER_RESPONSE",
      "The server returned an unreadable response.",
      undefined,
      response.status,
    );
  }

  if (!response.ok) {
    const errorBody = body as ErrorBody;
    const error = errorBody.error;
    throw new FeedRequestError(
      error?.code || "REQUEST_FAILED",
      error?.message || "The request failed. Please try again.",
      error?.fieldErrors,
      response.status,
    );
  }
  return body as T;
}

function postJson<T>(endpoint: string, body: unknown, includeCsrf = false) {
  return requestJson<T>(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(includeCsrf ? csrfHeaders() : {}),
    },
    body: JSON.stringify(body),
  });
}

function jsonByteLength(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function scraperImportBatches(articles: readonly ScrapedArticleInput[]) {
  const batches: ScrapedArticleInput[][] = [];
  let current: ScrapedArticleInput[] = [];

  for (const article of articles) {
    const oneArticlePayload = { articles: [article] };
    if (jsonByteLength(oneArticlePayload) > SCRAPED_IMPORT_SAFE_BYTES) {
      throw new FeedRequestError(
        "SCRAPED_ARTICLE_TOO_LARGE",
        "One scraped article is too large to import. Shorten its saved text and try again.",
      );
    }

    const next = [...current, article];
    if (
      current.length > 0 &&
      (next.length > 100 || jsonByteLength({ articles: next }) > SCRAPED_IMPORT_SAFE_BYTES)
    ) {
      batches.push(current);
      current = [article];
    } else {
      current = next;
    }
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

export function listFeeds() {
  return requestJson<{ feeds: FeedView[] }>("/api/feeds", { method: "GET" });
}

export function createFeed(input: FeedInput) {
  return postJson<{ feed: FeedView }>("/api/feeds", input, true);
}

export function updateFeed(id: string, input: FeedUpdateInput) {
  return requestJson<{ feed: FeedView }>(`/api/feeds/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...csrfHeaders(),
    },
    body: JSON.stringify(input),
  });
}

export function deleteFeed(id: string) {
  return requestJson<{ deleted: true }>(`/api/feeds/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: csrfHeaders(),
  });
}

export function fetchFeed(id: string) {
  return postJson<{ result: FeedFetchResult }>(
    `/api/feeds/${encodeURIComponent(id)}/fetch`,
    {},
    true,
  );
}

export function fetchAllFeeds() {
  return postJson<{
    feeds: FeedFetchResult[];
    totalParsed: number;
    totalAdded: number;
    failedCount: number;
  }>("/api/feeds/fetch-all", {}, true);
}

export function listPipelineArticles(status?: PipelineArticleStatus) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return requestJson<{ articles: PipelineArticleView[] }>(
    `/api/pipeline/articles${query}`,
    { method: "GET" },
  );
}

export function getPipelineArticleContent(id: string) {
  return requestJson<{ article: PipelineArticleView; content: string }>(
    `/api/pipeline/articles/${encodeURIComponent(id)}/content`,
    { method: "GET" },
  );
}

export function listPopularPipelineStories() {
  return requestJson<{ stories: PopularPipelineStory[] }>("/api/pipeline/popular", {
    method: "GET",
  });
}

export async function importScrapedArticles(articles: ScrapedArticleInput[]) {
  let imported = 0;
  let skipped = 0;
  for (const batch of scraperImportBatches(articles)) {
    const result = await postJson<{ imported: number; skipped: number; sources: number }>(
      "/api/pipeline/import-scraped",
      { articles: batch },
      true,
    );
    imported += result.imported;
    skipped += result.skipped;
  }
  return {
    imported,
    skipped,
    sources: new Set(articles.map((article) => article.source)).size,
  };
}

export function rewritePipelineArticle(id: string, input: PipelineRewriteInput = {}) {
  return postJson<{
    article: PipelineArticleView;
    finalText: string;
    validation: { status: "passed" | "passed_after_retry"; attempts: 1 | 2 };
  }>(
    `/api/pipeline/articles/${encodeURIComponent(id)}/rewrite`,
    input,
    true,
  );
}

export function updatePipelineArticleStatus(
  id: string,
  status: "approved" | "discarded",
) {
  return requestJson<{ article: PipelineArticleView }>(
    `/api/pipeline/articles/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...csrfHeaders(),
      },
      body: JSON.stringify({ status }),
    },
  );
}
