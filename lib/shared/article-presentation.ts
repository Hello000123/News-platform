import { z } from "zod";

export const ARTICLE_PRESENTATION_VERSION = 1 as const;
export const ARTICLE_IMAGE_MIN_SCALE_PERCENT = 30;
export const ARTICLE_IMAGE_MAX_SCALE_PERCENT = 100;
export const ARTICLE_IMAGE_SCALE_STEP = 10;
export const ARTICLE_IMAGE_MIN_ASPECT_RATIO = 0.35;
export const ARTICLE_IMAGE_MAX_ASPECT_RATIO = 3.5;
export const ARTICLE_PRESENTATION_FONT_FAMILIES = [
  "default",
  "pmingliu",
  "microsoft-jhenghei",
  "serif",
  "sans",
  "arial",
  "calibri",
  "georgia",
  "times-new-roman",
  "monospace",
] as const;
export const ARTICLE_PRESENTATION_FONT_SIZES = [
  12,
  14,
  16,
  18,
  20,
  24,
  28,
  32,
  36,
  40,
  48,
  56,
  64,
  72,
  80,
  96,
] as const;
export const ARTICLE_PRESENTATION_SCRIPTS = [
  "normal",
  "subscript",
  "superscript",
] as const;

const ARTICLE_PRESENTATION_MAX_BLOCKS = 202;
const ARTICLE_PRESENTATION_MAX_SEGMENTS_PER_BLOCK = 400;
const ARTICLE_PRESENTATION_MAX_SEGMENTS = 2_000;
const ARTICLE_PRESENTATION_MAX_TEXT = 60_000;
const ARTICLE_PRESENTATION_MAX_IMAGES = 120;
const SAFE_TEXT_CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const SAFE_TEXT_LINE_BREAKS = /[\r\n\u2028\u2029]/u;
const SAFE_PRESENTATION_ID = /^[a-z0-9][a-z0-9:_-]{0,159}$/u;

export type ArticlePresentationFontFamily =
  (typeof ARTICLE_PRESENTATION_FONT_FAMILIES)[number];
export type ArticlePresentationFontSize =
  (typeof ARTICLE_PRESENTATION_FONT_SIZES)[number];
export type ArticlePresentationScript =
  (typeof ARTICLE_PRESENTATION_SCRIPTS)[number];

export interface ArticlePresentationSourceBlock {
  id: string;
  text: string;
}

export interface ArticlePresentationImageGeometry {
  imageScalePercent: number;
  imageAspectRatio: number | null;
}

export interface ArticlePresentationStylePatch {
  fontFamily?: ArticlePresentationFontFamily | null;
  fontSize?: ArticlePresentationFontSize | null;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  script?: ArticlePresentationScript;
  highlightColor?: string | null;
  fontColor?: string | null;
}

export interface ArticlePresentationSelectionStyle {
  fontFamily: ArticlePresentationFontFamily | null | undefined;
  fontSize: ArticlePresentationFontSize | null | undefined;
  bold: boolean | undefined;
  italic: boolean | undefined;
  underline: boolean | undefined;
  strikethrough: boolean | undefined;
  script: ArticlePresentationScript | undefined;
  highlightColor: string | null | undefined;
  fontColor: string | null | undefined;
}

const fontSizeSchema = z
  .number()
  .int()
  .refine(
    (value): value is ArticlePresentationFontSize =>
      (ARTICLE_PRESENTATION_FONT_SIZES as readonly number[]).includes(value),
    "Choose an allowed article font size.",
  );

const colorSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/iu, "Choose a six-digit hexadecimal colour.")
  .transform((value) => value.toLowerCase());

const presentationTextSchema = z
  .string()
  .max(ARTICLE_PRESENTATION_MAX_TEXT)
  .refine(
    (value) => !SAFE_TEXT_LINE_BREAKS.test(value),
    "Line breaks cannot be added inside a locked article block.",
  )
  .refine(
    (value) => !SAFE_TEXT_CONTROL_CHARACTERS.test(value),
    "Article text contains unsupported control characters.",
  );

export const articlePresentationSegmentSchema = z
  .object({
    text: presentationTextSchema,
    fontFamily: z.enum(ARTICLE_PRESENTATION_FONT_FAMILIES).nullable(),
    fontSize: fontSizeSchema.nullable(),
    bold: z.boolean().default(false),
    italic: z.boolean().default(false),
    underline: z.boolean().default(false),
    strikethrough: z.boolean().default(false),
    script: z.enum(ARTICLE_PRESENTATION_SCRIPTS).default("normal"),
    highlightColor: colorSchema.nullable().default(null),
    fontColor: colorSchema.nullable().default(null),
  })
  .strict();

export const articlePresentationBlockSchema = z
  .object({
    id: z
      .string()
      .regex(SAFE_PRESENTATION_ID, "The presentation block is invalid."),
    segments: z
      .array(articlePresentationSegmentSchema)
      .min(1)
      .max(ARTICLE_PRESENTATION_MAX_SEGMENTS_PER_BLOCK),
  })
  .strict();

export const articlePresentationImageGeometrySchema = z
  .object({
    imageScalePercent: z
      .number()
      .int()
      .min(ARTICLE_IMAGE_MIN_SCALE_PERCENT)
      .max(ARTICLE_IMAGE_MAX_SCALE_PERCENT),
    imageAspectRatio: z
      .number()
      .finite()
      .min(ARTICLE_IMAGE_MIN_ASPECT_RATIO)
      .max(ARTICLE_IMAGE_MAX_ASPECT_RATIO)
      .nullable(),
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
    imageAspectRatio: z
      .number()
      .finite()
      .min(ARTICLE_IMAGE_MIN_ASPECT_RATIO)
      .max(ARTICLE_IMAGE_MAX_ASPECT_RATIO)
      .nullable()
      .default(null),
    imageSettings: z
      .record(
        z.string().regex(SAFE_PRESENTATION_ID, "The presentation image is invalid."),
        articlePresentationImageGeometrySchema,
      )
      .refine(
        (settings) => Object.keys(settings).length <= ARTICLE_PRESENTATION_MAX_IMAGES,
        "The presentation contains too many images.",
      )
      .default({}),
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

function defaultSegment(text: string): ArticlePresentationSegment {
  return articlePresentationSegmentSchema.parse({
    text,
    fontFamily: null,
    fontSize: null,
  });
}

function sameSegmentStyle(
  left: ArticlePresentationSegment,
  right: ArticlePresentationSegment,
) {
  return (
    left.fontFamily === right.fontFamily &&
    left.fontSize === right.fontSize &&
    left.bold === right.bold &&
    left.italic === right.italic &&
    left.underline === right.underline &&
    left.strikethrough === right.strikethrough &&
    left.script === right.script &&
    left.highlightColor === right.highlightColor &&
    left.fontColor === right.fontColor
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
  if (merged.length > 0) return merged;
  return [{ ...(segments[0] ?? defaultSegment("")), text: "" }];
}

export function createDefaultArticlePresentation(
  sourceUpdatedAt: number,
  sourceBlocks: readonly ArticlePresentationSourceBlock[],
  sourceImageIds: readonly string[] = [],
): ArticlePresentation {
  return articlePresentationSchema.parse({
    version: ARTICLE_PRESENTATION_VERSION,
    sourceUpdatedAt,
    blocks: sourceBlocks.map((block) => ({
      id: block.id,
      segments: [defaultSegment(block.text)],
    })),
    imageScalePercent: ARTICLE_IMAGE_MAX_SCALE_PERCENT,
    imageAspectRatio: null,
    imageSettings: Object.fromEntries(
      sourceImageIds
        .filter((imageId) => imageId !== "hero")
        .map((imageId) => [
          imageId,
          {
            imageScalePercent: ARTICLE_IMAGE_MAX_SCALE_PERCENT,
            imageAspectRatio: null,
          },
        ]),
    ),
  });
}

export function validateArticlePresentation(
  input: unknown,
  sourceUpdatedAt: number,
  sourceBlocks: readonly ArticlePresentationSourceBlock[],
  sourceImageIds: readonly string[] = ["hero"],
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
  let textLength = 0;
  const blocks = parsed.blocks.map((block, index) => {
    const source = sourceBlocks[index];
    if (!source || source.id !== block.id) {
      throw new Error("Article presentation blocks cannot be moved or reordered.");
    }
    const text = block.segments.map((segment) => segment.text).join("");
    if (!text.trim()) {
      throw new Error("Locked article blocks cannot be left empty.");
    }
    textLength += text.length;
    segmentCount += block.segments.length;
    return { ...block, segments: mergeAdjacentSegments(block.segments) };
  });

  if (textLength > ARTICLE_PRESENTATION_MAX_TEXT) {
    throw new Error("The edited article text is too long.");
  }
  if (segmentCount > ARTICLE_PRESENTATION_MAX_SEGMENTS) {
    throw new Error("The article contains too many formatting changes.");
  }

  const allowedImages = new Set(sourceImageIds);
  for (const imageId of Object.keys(parsed.imageSettings)) {
    if (!allowedImages.has(imageId)) {
      throw new Error("Presentation images cannot be added or replaced.");
    }
  }

  return articlePresentationSchema.parse({ ...parsed, blocks });
}

export function articlePresentationImageGeometry(
  presentation: ArticlePresentation,
  imageId = "hero",
): ArticlePresentationImageGeometry {
  if (imageId === "hero") {
    return {
      imageScalePercent: presentation.imageScalePercent,
      imageAspectRatio: presentation.imageAspectRatio,
    };
  }
  return (
    presentation.imageSettings[imageId] ?? {
      imageScalePercent: ARTICLE_IMAGE_MAX_SCALE_PERCENT,
      imageAspectRatio: null,
    }
  );
}

export function setArticlePresentationImageGeometry(
  presentation: ArticlePresentation,
  imageId: string,
  geometry: ArticlePresentationImageGeometry,
) {
  const parsedGeometry = articlePresentationImageGeometrySchema.parse(geometry);
  if (imageId === "hero") {
    return articlePresentationSchema.parse({
      ...presentation,
      imageScalePercent: parsedGeometry.imageScalePercent,
      imageAspectRatio: parsedGeometry.imageAspectRatio,
    });
  }
  return articlePresentationSchema.parse({
    ...presentation,
    imageSettings: {
      ...presentation.imageSettings,
      [imageId]: parsedGeometry,
    },
  });
}

export function articlePresentationBlockText(
  presentation: ArticlePresentation,
  blockId: string,
) {
  return (
    presentation.blocks
      .find((candidate) => candidate.id === blockId)
      ?.segments.map((segment) => segment.text)
      .join("") ?? null
  );
}

export function replaceArticleText(
  presentation: ArticlePresentation,
  blockId: string,
  start: number,
  end: number,
  replacement: string,
) {
  const block = presentation.blocks.find((candidate) => candidate.id === blockId);
  if (
    !block ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    SAFE_TEXT_LINE_BREAKS.test(replacement) ||
    SAFE_TEXT_CONTROL_CHARACTERS.test(replacement)
  ) {
    return presentation;
  }
  const blockLength = block.segments.reduce(
    (total, segment) => total + segment.text.length,
    0,
  );
  if (start < 0 || end < start || end > blockLength) return presentation;
  if (blockLength - (end - start) + replacement.length > ARTICLE_PRESENTATION_MAX_TEXT) {
    return presentation;
  }

  let cursor = 0;
  let inheritedStyle: ArticlePresentationSegment | null = null;
  const before: ArticlePresentationSegment[] = [];
  const after: ArticlePresentationSegment[] = [];
  for (const segment of block.segments) {
    const segmentStart = cursor;
    const segmentEnd = cursor + segment.text.length;
    cursor = segmentEnd;

    if (!inheritedStyle && start >= segmentStart && start <= segmentEnd) {
      inheritedStyle = segment;
    }
    if (segmentEnd <= start) {
      before.push({ ...segment });
    } else if (segmentStart < start) {
      before.push({ ...segment, text: segment.text.slice(0, start - segmentStart) });
    }

    if (segmentStart >= end) {
      after.push({ ...segment });
    } else if (segmentEnd > end) {
      after.push({ ...segment, text: segment.text.slice(end - segmentStart) });
    }
  }

  const replacementSegment = {
    ...(inheritedStyle ?? before.at(-1) ?? after[0] ?? defaultSegment("")),
    text: replacement,
  };
  const nextSegments = mergeAdjacentSegments([
    ...before,
    replacementSegment,
    ...after,
  ]);

  return articlePresentationSchema.parse({
    ...presentation,
    blocks: presentation.blocks.map((candidate) =>
      candidate.id === blockId
        ? { ...candidate, segments: nextSegments }
        : candidate,
    ),
  });
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
        ...(patch.fontFamily !== undefined ? { fontFamily: patch.fontFamily } : {}),
        ...(patch.fontSize !== undefined ? { fontSize: patch.fontSize } : {}),
        ...(patch.bold !== undefined ? { bold: patch.bold } : {}),
        ...(patch.italic !== undefined ? { italic: patch.italic } : {}),
        ...(patch.underline !== undefined ? { underline: patch.underline } : {}),
        ...(patch.strikethrough !== undefined
          ? { strikethrough: patch.strikethrough }
          : {}),
        ...(patch.script !== undefined ? { script: patch.script } : {}),
        ...(patch.highlightColor !== undefined
          ? { highlightColor: patch.highlightColor }
          : {}),
        ...(patch.fontColor !== undefined ? { fontColor: patch.fontColor } : {}),
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

export function articlePresentationSelectionStyle(
  presentation: ArticlePresentation,
  blockId: string,
  start: number,
  end: number,
): ArticlePresentationSelectionStyle | null {
  const block = presentation.blocks.find((candidate) => candidate.id === blockId);
  if (!block || end <= start) return null;
  let cursor = 0;
  const selected = block.segments.filter((segment) => {
    const segmentStart = cursor;
    const segmentEnd = cursor + segment.text.length;
    cursor = segmentEnd;
    return segmentEnd > start && segmentStart < end;
  });
  if (selected.length === 0) return null;

  function common<K extends keyof ArticlePresentationSegment>(key: K) {
    const first = selected[0][key];
    return selected.every((segment) => segment[key] === first) ? first : undefined;
  }
  return {
    fontFamily: common("fontFamily"),
    fontSize: common("fontSize"),
    bold: common("bold"),
    italic: common("italic"),
    underline: common("underline"),
    strikethrough: common("strikethrough"),
    script: common("script"),
    highlightColor: common("highlightColor"),
    fontColor: common("fontColor"),
  };
}

export function articlePresentationFingerprint(
  presentation: ArticlePresentation,
) {
  return JSON.stringify(presentation);
}
