import { z } from "zod";

export const ARTICLE_PRESENTATION_VERSION = 1 as const;
export const ARTICLE_IMAGE_MIN_SCALE_PERCENT = 30;
export const ARTICLE_IMAGE_MAX_SCALE_PERCENT = 100;
export const ARTICLE_IMAGE_SCALE_STEP = 10;
export const ARTICLE_PRESENTATION_FONT_FAMILIES = [
  "default",
  "serif",
  "sans",
  "monospace",
] as const;
export const ARTICLE_PRESENTATION_FONT_SIZES = [
  14,
  16,
  18,
  20,
  24,
  28,
  32,
  40,
  48,
  56,
] as const;

const ARTICLE_PRESENTATION_MAX_BLOCKS = 202;
const ARTICLE_PRESENTATION_MAX_SEGMENTS_PER_BLOCK = 400;
const ARTICLE_PRESENTATION_MAX_SEGMENTS = 2_000;
const ARTICLE_PRESENTATION_MAX_TEXT = 60_000;

export type ArticlePresentationFontFamily =
  (typeof ARTICLE_PRESENTATION_FONT_FAMILIES)[number];
export type ArticlePresentationFontSize =
  (typeof ARTICLE_PRESENTATION_FONT_SIZES)[number];

export interface ArticlePresentationSourceBlock {
  id: string;
  text: string;
}

export interface ArticlePresentationStylePatch {
  fontFamily?: ArticlePresentationFontFamily | null;
  fontSize?: ArticlePresentationFontSize | null;
}

const fontSizeSchema = z
  .number()
  .int()
  .refine(
    (value): value is ArticlePresentationFontSize =>
      (ARTICLE_PRESENTATION_FONT_SIZES as readonly number[]).includes(value),
    "Choose an allowed article font size.",
  );

export const articlePresentationSegmentSchema = z
  .object({
    text: z.string().min(1).max(ARTICLE_PRESENTATION_MAX_TEXT),
    fontFamily: z.enum(ARTICLE_PRESENTATION_FONT_FAMILIES).nullable(),
    fontSize: fontSizeSchema.nullable(),
  })
  .strict();

export const articlePresentationBlockSchema = z
  .object({
    id: z
      .string()
      .regex(/^(?:title|deck|body:[0-9]{1,3})$/u, "The presentation block is invalid."),
    segments: z
      .array(articlePresentationSegmentSchema)
      .min(1)
      .max(ARTICLE_PRESENTATION_MAX_SEGMENTS_PER_BLOCK),
  })
  .strict();

export const articlePresentationSchema = z
  .object({
    version: z.literal(ARTICLE_PRESENTATION_VERSION),
    sourceUpdatedAt: z.number().int().nonnegative(),
    blocks: z
      .array(articlePresentationBlockSchema)
      .min(1)
      .max(ARTICLE_PRESENTATION_MAX_BLOCKS),
    imageScalePercent: z
      .number()
      .int()
      .min(ARTICLE_IMAGE_MIN_SCALE_PERCENT)
      .max(ARTICLE_IMAGE_MAX_SCALE_PERCENT),
  })
  .strict();

export type ArticlePresentation = z.infer<typeof articlePresentationSchema>;
export type ArticlePresentationSegment = z.infer<
  typeof articlePresentationSegmentSchema
>;

export const articlePresentationUpdateSchema = z
  .object({
    action: z.enum(["save", "publish"]),
    presentation: articlePresentationSchema,
  })
  .strict();

export type ArticlePresentationUpdate = z.infer<
  typeof articlePresentationUpdateSchema
>;

function sameSegmentStyle(
  left: ArticlePresentationSegment,
  right: ArticlePresentationSegment,
) {
  return (
    left.fontFamily === right.fontFamily && left.fontSize === right.fontSize
  );
}

function mergeAdjacentSegments(
  segments: readonly ArticlePresentationSegment[],
) {
  const merged: ArticlePresentationSegment[] = [];
  for (const segment of segments) {
    if (!segment.text) continue;
    const previous = merged.at(-1);
    if (previous && sameSegmentStyle(previous, segment)) {
      previous.text += segment.text;
    } else {
      merged.push({ ...segment });
    }
  }
  return merged;
}

export function createDefaultArticlePresentation(
  sourceUpdatedAt: number,
  sourceBlocks: readonly ArticlePresentationSourceBlock[],
): ArticlePresentation {
  return articlePresentationSchema.parse({
    version: ARTICLE_PRESENTATION_VERSION,
    sourceUpdatedAt,
    blocks: sourceBlocks.map((block) => ({
      id: block.id,
      segments: [
        { text: block.text, fontFamily: null, fontSize: null },
      ],
    })),
    imageScalePercent: ARTICLE_IMAGE_MAX_SCALE_PERCENT,
  });
}

export function validateArticlePresentation(
  input: unknown,
  sourceUpdatedAt: number,
  sourceBlocks: readonly ArticlePresentationSourceBlock[],
) {
  const parsed = articlePresentationSchema.parse(input);
  if (parsed.sourceUpdatedAt !== sourceUpdatedAt) {
    throw new Error(
      "The article changed after this presentation draft was opened. Refresh before saving.",
    );
  }
  if (parsed.blocks.length !== sourceBlocks.length) {
    throw new Error("Article presentation blocks cannot be added or removed.");
  }

  let segmentCount = 0;
  const blocks = parsed.blocks.map((block, index) => {
    const source = sourceBlocks[index];
    if (!source || source.id !== block.id) {
      throw new Error("Article presentation blocks cannot be moved or reordered.");
    }
    const text = block.segments.map((segment) => segment.text).join("");
    if (text !== source.text) {
      throw new Error("Article text cannot be changed in presentation editing mode.");
    }
    segmentCount += block.segments.length;
    return { ...block, segments: mergeAdjacentSegments(block.segments) };
  });

  if (segmentCount > ARTICLE_PRESENTATION_MAX_SEGMENTS) {
    throw new Error("The article contains too many formatting changes.");
  }

  return articlePresentationSchema.parse({ ...parsed, blocks });
}

export function applyArticleTextStyle(
  presentation: ArticlePresentation,
  blockId: string,
  start: number,
  end: number,
  patch: ArticlePresentationStylePatch,
) {
  const block = presentation.blocks.find((candidate) => candidate.id === blockId);
  if (!block || !Number.isInteger(start) || !Number.isInteger(end)) {
    return presentation;
  }
  const blockLength = block.segments.reduce(
    (total, segment) => total + segment.text.length,
    0,
  );
  if (start < 0 || end <= start || end > blockLength) return presentation;

  let cursor = 0;
  const nextSegments: ArticlePresentationSegment[] = [];
  for (const segment of block.segments) {
    const segmentStart = cursor;
    const segmentEnd = cursor + segment.text.length;
    cursor = segmentEnd;
    if (segmentEnd <= start || segmentStart >= end) {
      nextSegments.push({ ...segment });
      continue;
    }

    const overlapStart = Math.max(start, segmentStart);
    const overlapEnd = Math.min(end, segmentEnd);
    const before = segment.text.slice(0, overlapStart - segmentStart);
    const selected = segment.text.slice(
      overlapStart - segmentStart,
      overlapEnd - segmentStart,
    );
    const after = segment.text.slice(overlapEnd - segmentStart);
    if (before) nextSegments.push({ ...segment, text: before });
    if (selected) {
      nextSegments.push({
        ...segment,
        text: selected,
        ...(patch.fontFamily !== undefined
          ? { fontFamily: patch.fontFamily }
          : {}),
        ...(patch.fontSize !== undefined ? { fontSize: patch.fontSize } : {}),
      });
    }
    if (after) nextSegments.push({ ...segment, text: after });
  }

  return articlePresentationSchema.parse({
    ...presentation,
    blocks: presentation.blocks.map((candidate) =>
      candidate.id === blockId
        ? { ...candidate, segments: mergeAdjacentSegments(nextSegments) }
        : candidate,
    ),
  });
}

export function articlePresentationFingerprint(
  presentation: ArticlePresentation,
) {
  return JSON.stringify(presentation);
}
