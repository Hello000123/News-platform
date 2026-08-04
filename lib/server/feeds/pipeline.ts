import type { D1Database } from "@cloudflare/workers-types";

import { nowInSeconds } from "@/lib/server/auth/crypto";
import { AppError } from "@/lib/server/errors";
import {
  insertPipelineArticles,
  listActiveFeeds,
  markFeedFetchResult,
} from "@/lib/server/feeds/repository";
import { parseFeedXml } from "@/lib/server/feeds/rss-parser";
import {
  fetchPublicContent,
  SourceContextError,
  type SourceContextDependencies,
} from "@/lib/server/sources/source-context";
import type { FeedFetchResult, FeedView } from "@/lib/shared/feeds-contracts";

export interface FeedIngestSummary {
  feeds: FeedFetchResult[];
  totalParsed: number;
  totalAdded: number;
  failedCount: number;
}

function feedErrorStatus(code: SourceContextError["code"]) {
  if (code === "SOURCE_FETCH_TIMEOUT") return 504;
  if (code === "SOURCE_TOO_LARGE") return 413;
  if (code === "UNSUPPORTED_SOURCE_TYPE") return 415;
  if (code === "INVALID_SOURCE_URL" || code === "NON_PUBLIC_SOURCE") return 400;
  return 502;
}

export async function fetchAndIngestFeed(
  database: D1Database,
  feed: FeedView,
  dependencies: SourceContextDependencies = {},
): Promise<FeedFetchResult> {
  const fetchedAt = nowInSeconds();
  let parsedCount = 0;
  let addedCount = 0;

  try {
    const fetched = await fetchPublicContent(feed.url, dependencies, {
      allowXmlFeed: true,
    });
    if (!fetched.body.trim()) {
      throw new AppError(
        "FEED_EMPTY_CONTENT",
        "The feed returned no content.",
        422,
        { publicDetails: { retryable: false } },
      );
    }

    const items = parseFeedXml(fetched.body);
    parsedCount = items.length;
    addedCount = await insertPipelineArticles(database, feed.id, items);
    await markFeedFetchResult(database, feed.id, {
      fetchedAt,
      ok: true,
      error: null,
    });
    return {
      feed: { ...feed, lastFetchedAt: fetchedAt, lastFetchedOk: true, lastError: null },
      parsedCount,
      addedCount,
      errors: [],
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.slice(0, 500)
        : "Feed retrieval failed.";
    await markFeedFetchResult(database, feed.id, {
      fetchedAt,
      ok: false,
      error: message,
    });
    if (error instanceof SourceContextError) {
      throw new AppError(error.code, error.message, feedErrorStatus(error.code), {
        cause: error,
        publicDetails: { retryable: true },
      });
    }
    if (error instanceof AppError) throw error;
    throw new AppError("FEED_FETCH_FAILED", message, 502, {
      cause: error,
      publicDetails: { retryable: true },
    });
  }
}

export async function ingestAllFeeds(
  database: D1Database,
  dependencies: SourceContextDependencies = {},
): Promise<FeedIngestSummary> {
  const feeds = await listActiveFeeds(database);
  const results: FeedFetchResult[] = [];
  let totalParsed = 0;
  let totalAdded = 0;
  let failedCount = 0;

  for (const feed of feeds) {
    try {
      const result = await fetchAndIngestFeed(database, feed, dependencies);
      results.push(result);
      totalParsed += result.parsedCount;
      totalAdded += result.addedCount;
    } catch (error) {
      failedCount += 1;
      results.push({
        feed: {
          ...feed,
          lastFetchedAt: nowInSeconds(),
          lastFetchedOk: false,
          lastError:
            error instanceof Error
              ? error.message.slice(0, 500)
              : "Feed retrieval failed.",
        },
        parsedCount: 0,
        addedCount: 0,
        errors: [
          error instanceof Error
            ? error.message.slice(0, 500)
            : "Feed retrieval failed.",
        ],
      });
    }
  }

  return { feeds: results, totalParsed, totalAdded, failedCount };
}
