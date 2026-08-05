import { z } from "zod";

import {
  MAX_REWRITE_INSTRUCTION_CHARS,
  rewriteLengthOptionSchema,
  rewriteOutputLanguageSchema,
  rewriteValidationSchema,
  selectableModelSchema,
} from "@/lib/shared/contracts";

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
    mergedIntoArticleId: z.string().nullable().optional(),
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
      .max(49, "A rewrite can combine up to 49 related reports.")
      .default([]),
    instruction: z
      .string()
      .trim()
      .max(
        MAX_REWRITE_INSTRUCTION_CHARS,
        `Improvement instructions are limited to ${MAX_REWRITE_INSTRUCTION_CHARS.toLocaleString("en-US")} characters.`,
      )
      .default(""),
  })
  .strict();

export type PipelineRewriteInput = z.input<typeof pipelineRewriteInputSchema>;

export const popularPipelineStorySchema = z
  .object({
    articleId: z.string(),
    title: z.string(),
    sourceCount: z.number().int().min(1),
    reportCount: z.number().int().min(1),
    publishedAt: z.number().nullable(),
    relatedArticleIds: z.array(z.string()).min(1).max(200),
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
