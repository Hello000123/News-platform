import { z } from "zod";

import {
  MAX_REWRITE_INSTRUCTION_CHARS,
  quotationIssueKindSchema,
  rewriteLengthOptionSchema,
  rewriteOutputLanguageSchema,
  rewriteValidationSchema,
  selectableModelSchema,
} from "@/lib/shared/contracts";
import { NEWS_CATEGORY_VALUES } from "@/lib/shared/news-categories";

export type { NewsCategory } from "@/lib/shared/news-categories";

export const FEED_STATUSES = ["active", "paused"] as const;
export type FeedStatus = (typeof FEED_STATUSES)[number];

export const PIPELINE_ARTICLE_STATUSES = [
  "new",
  "rewritten",
  "approved",
  "discarded",
] as const;
export type PipelineArticleStatus = (typeof PIPELINE_ARTICLE_STATUSES)[number];

export const FEED_NAME_MAX_LENGTH = 120;
export const FEED_URL_MAX_LENGTH = 2_048;
export const PIPELINE_ARTICLE_TITLE_MAX_LENGTH = 1_000;
export const PIPELINE_ARTICLE_URL_MAX_LENGTH = 2_048;
export const PIPELINE_ARTICLE_DESCRIPTION_MAX_LENGTH = 20_000;
export const PIPELINE_ARTICLE_AUTHOR_MAX_LENGTH = 500;
export const PIPELINE_ARTICLE_REWRITTEN_TEXT_MAX_LENGTH = 50_000;
export const SCRAPED_ARTICLE_CONTENT_MAX_LENGTH = 50_000;
export const MAX_PIPELINE_RELATED_ARTICLE_IDS = 200;
export const MAX_PIPELINE_REWRITE_DEBUG_LOGS = 100;

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

function requiredSingleLine(label: string, maximum: number) {
  return z
    .string()
    .max(maximum + 64, `${label} is too long.`)
    .refine((value) => !CONTROL_CHARACTERS.test(value), `${label} contains invalid characters.`)
    .transform((value) => value.normalize("NFC").trim().replace(/\s+/gu, " "))
    .pipe(
      z
        .string()
        .min(1, `${label} is required.`)
        .max(maximum, `${label} must be ${maximum} characters or fewer.`),
    );
}

export const feedUrlSchema = z
  .string()
  .trim()
  .max(FEED_URL_MAX_LENGTH, `Feed URLs are limited to ${FEED_URL_MAX_LENGTH.toLocaleString("en-US")} characters.`)
  .url("Enter a valid feed URL.")
  .transform((value) => {
    const url = new URL(value);
    url.hash = "";
    return url.href;
  });

export const feedStatusSchema = z.enum(FEED_STATUSES);

export const feedInputSchema = z
  .object({
    name: requiredSingleLine("Feed name", FEED_NAME_MAX_LENGTH),
    url: feedUrlSchema,
  })
  .strict();

export type FeedInput = z.infer<typeof feedInputSchema>;

export const feedUpdateSchema = z
  .object({
    name: requiredSingleLine("Feed name", FEED_NAME_MAX_LENGTH),
    url: feedUrlSchema,
    status: feedStatusSchema,
  })
  .strict();

export type FeedUpdateInput = z.infer<typeof feedUpdateSchema>;

const scrapedOptionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .nullable()
    .optional()
    .transform((value) => value || null);

export const scrapedArticleInputSchema = z
  .object({
    source: requiredSingleLine("Scraper source", FEED_NAME_MAX_LENGTH),
    title: requiredSingleLine("Article title", PIPELINE_ARTICLE_TITLE_MAX_LENGTH),
    url: feedUrlSchema,
    author: scrapedOptionalText(PIPELINE_ARTICLE_AUTHOR_MAX_LENGTH),
    publishedAt: scrapedOptionalText(100),
    contentText: z
      .string()
      .max(SCRAPED_ARTICLE_CONTENT_MAX_LENGTH + 1_000)
      .transform((value) => value.trim())
      .pipe(z.string().min(1, "Scraped article text is required.").max(SCRAPED_ARTICLE_CONTENT_MAX_LENGTH)),
    imageUrl: scrapedOptionalText(FEED_URL_MAX_LENGTH),
  })
  .strict();

export type ScrapedArticleInput = z.infer<typeof scrapedArticleInputSchema>;

export const scrapedArticleImportRequestSchema = z
  .object({
    articles: z.array(scrapedArticleInputSchema).min(1).max(100),
  })
  .strict();

export const feedViewSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    url: z.string(),
    status: feedStatusSchema,
    lastFetchedAt: z.number().nullable(),
    lastFetchedOk: z.boolean(),
    lastError: z.string().nullable(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .strict();

export type FeedView = z.infer<typeof feedViewSchema>;

export const pipelineArticleStatusSchema = z.enum(PIPELINE_ARTICLE_STATUSES);
export const pipelineArticleCategorySchema = z.enum(NEWS_CATEGORY_VALUES);

export const pipelineArticleViewSchema = z
  .object({
    id: z.string(),
    feedId: z.string(),
    feedName: z.string(),
    title: z.string(),
    url: z.string(),
    description: z.string().nullable(),
    author: z.string().nullable(),
    pubDate: z.number().nullable(),
    status: pipelineArticleStatusSchema,
    rewrittenText: z.string().nullable(),
    sourceText: z.string().nullable().optional(),
    imageUrl: z.string().nullable().optional(),
    category: pipelineArticleCategorySchema.nullable().optional(),
    mergedIntoArticleId: z.string().nullable().optional(),
    publishedAt: z.number().nullable().optional(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .strict();

export type PipelineArticleView = z.infer<typeof pipelineArticleViewSchema>;

export const feedListResponseSchema = z
  .object({
    feeds: z.array(feedViewSchema),
  })
  .strict();

export const feedFetchResultSchema = z
  .object({
    feed: feedViewSchema,
    parsedCount: z.number().int().min(0),
    addedCount: z.number().int().min(0),
    errors: z.array(z.string()),
  })
  .strict();

export type FeedFetchResult = z.infer<typeof feedFetchResultSchema>;

export const feedFetchAllResponseSchema = z
  .object({
    feeds: z.array(feedFetchResultSchema),
    totalParsed: z.number().int().min(0),
    totalAdded: z.number().int().min(0),
    failedCount: z.number().int().min(0),
  })
  .strict();

export const articleListResponseSchema = z
  .object({
    articles: z.array(pipelineArticleViewSchema),
  })
  .strict();

export const articleContentResponseSchema = z
  .object({
    article: pipelineArticleViewSchema,
    content: z.string(),
  })
  .strict();

export const pipelineRewriteInputSchema = z
  .object({
    model: selectableModelSchema.optional(),
    lengthOption: rewriteLengthOptionSchema.nullable().optional(),
    outputLanguage: rewriteOutputLanguageSchema.optional(),
    relatedArticleIds: z
      .array(z.string().trim().min(1).max(128))
      .max(
        MAX_PIPELINE_RELATED_ARTICLE_IDS,
        `A rewrite can combine up to ${MAX_PIPELINE_RELATED_ARTICLE_IDS} selected report IDs.`,
      )
      .default([]),
    instruction: z
      .string()
      .trim()
      .max(
        MAX_REWRITE_INSTRUCTION_CHARS,
        `Improvement instructions are limited to ${MAX_REWRITE_INSTRUCTION_CHARS.toLocaleString("en-US")} characters.`,
      )
      .default(""),
    publish: z.boolean().default(false),
    debugBatchId: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9._:-]+$/u, "The rewrite debug batch ID is invalid.")
      .optional(),
  })
  .strict();

export type PipelineRewriteInput = z.input<typeof pipelineRewriteInputSchema>;
export type PipelineRewriteRequest = z.infer<typeof pipelineRewriteInputSchema>;

export const pipelineRewriteSourceOriginSchema = z.enum([
  "saved_scraper",
  "live_page",
  "rss_preview",
]);

export const pipelineRewriteDebugEntrySchema = z
  .object({
    id: z.string(),
    batchId: z.string().nullable(),
    articleId: z.string(),
    articleTitle: z.string(),
    requestedModel: selectableModelSchema,
    outputLanguage: rewriteOutputLanguageSchema,
    requestedLengthOption: rewriteLengthOptionSchema.nullable(),
    effectiveLengthOption: rewriteLengthOptionSchema.nullable(),
    relatedReportCount: z.number().int().min(1),
    sourceOrigin: pipelineRewriteSourceOriginSchema.nullable(),
    sourceCharacters: z.number().int().min(0).nullable(),
    linkedCharacters: z.number().int().min(0).nullable(),
    outcome: z.enum(["success", "failure"]),
    validationStatus: z.enum(["passed", "passed_after_retry"]).nullable(),
    attempts: z.number().int().min(1).max(3).nullable(),
    errorCode: z.string().nullable(),
    errorMessage: z.string().nullable(),
    errorDetails: z.array(z.string()),
    retryable: z.boolean().nullable(),
    stage: z.enum(["review_request", "rewrite_request"]).nullable(),
    provider: z.string().nullable(),
    providerModel: z.string().nullable(),
    providerHttpStatus: z.number().int().min(0).max(599).nullable(),
    causeSummary: z.string().nullable(),
    quotationIssueKinds: z.array(quotationIssueKindSchema),
    quotationIssueCount: z.number().int().min(0),
    candidateCharacters: z.number().int().min(0).nullable(),
    durationMs: z.number().int().min(0),
    createdAt: z.number().int().min(0),
  })
  .strict();

export type PipelineRewriteDebugEntry = z.infer<typeof pipelineRewriteDebugEntrySchema>;
export type PipelineRewriteSourceOrigin = z.infer<typeof pipelineRewriteSourceOriginSchema>;

export const pipelineRewriteDebugListResponseSchema = z
  .object({
    logs: z.array(pipelineRewriteDebugEntrySchema).max(MAX_PIPELINE_REWRITE_DEBUG_LOGS),
  })
  .strict();

export const popularPipelineStorySchema = z
  .object({
    articleId: z.string(),
    title: z.string(),
    sourceCount: z.number().int().min(1),
    reportCount: z.number().int().min(1),
    publishedAt: z.number().nullable(),
    relatedArticleIds: z.array(z.string()).min(1).max(MAX_PIPELINE_RELATED_ARTICLE_IDS),
  })
  .strict();

export type PopularPipelineStory = z.infer<typeof popularPipelineStorySchema>;

export const popularPipelineStoriesResponseSchema = z
  .object({
    stories: z.array(popularPipelineStorySchema).max(5),
  })
  .strict();

export const pipelineRewriteResponseSchema = z
  .object({
    article: pipelineArticleViewSchema,
    finalText: z.string().min(1),
    validation: rewriteValidationSchema,
  })
  .strict();

export const pipelineStatusUpdateSchema = z
  .object({
    status: z.enum(["approved", "discarded"]),
  })
  .strict();

export type PipelineStatusUpdateInput = z.infer<typeof pipelineStatusUpdateSchema>;

const MANAGED_NEWS_IMAGE_PATH = /^\/api\/news-images\/[0-9a-f]{32}(?:\?v=\d+)?$/u;

const pipelineArticleImageUrlSchema = z
  .union([
    z.null(),
    z.literal(""),
    z
      .string()
      .trim()
      .max(
        FEED_URL_MAX_LENGTH,
        `Image URLs are limited to ${FEED_URL_MAX_LENGTH.toLocaleString("en-US")} characters.`,
      )
      .refine((value) => {
        if (MANAGED_NEWS_IMAGE_PATH.test(value)) return true;
        try {
          const url = new URL(value);
          return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
        } catch {
          return false;
        }
      }, "Use an uploaded news image or a public HTTP or HTTPS image URL without embedded credentials."),
  ])
  .transform((value) => value || null);

export const pipelineArticlePostUpdateSchema = z
  .object({
    rewrittenText: z
      .string()
      .trim()
      .min(1, "The post needs a headline and article copy before it can be saved.")
      .max(
        PIPELINE_ARTICLE_REWRITTEN_TEXT_MAX_LENGTH,
        `Post copy is limited to ${PIPELINE_ARTICLE_REWRITTEN_TEXT_MAX_LENGTH.toLocaleString("en-US")} characters.`,
      )
      .optional(),
    imageUrl: pipelineArticleImageUrlSchema.optional(),
    category: pipelineArticleCategorySchema.nullable().optional(),
    status: z.enum(["approved", "discarded"]).optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.rewrittenText !== undefined ||
      input.imageUrl !== undefined ||
      input.category !== undefined ||
      input.status !== undefined,
    "Change the post copy, category, featured image, or publication status before saving.",
  );

export type PipelineArticlePostUpdateInput = z.input<
  typeof pipelineArticlePostUpdateSchema
>;
export type PipelineArticlePostUpdate = z.infer<
  typeof pipelineArticlePostUpdateSchema
>;
