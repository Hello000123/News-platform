import { z } from "zod";

import type { NewsCategory } from "@/lib/shared/news-categories";

export const CLIENT_NEWS_PAGE_SIZE = 10;
export const CLIENT_NEWS_MAX_PAGE_SIZE = 50;

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

function optionalSummaryText(label: string, maximum: number) {
  return z
    .union([z.string(), z.null()])
    .transform((value) => value?.normalize("NFC").trim().replace(/\s+/gu, " ") || null)
    .refine(
      (value) => value === null || !CONTROL_CHARACTERS.test(value),
      `${label} contains invalid characters.`,
    )
    .refine(
      (value) => value === null || value.length <= maximum,
      `${label} must be ${maximum.toLocaleString("en-US")} characters or fewer.`,
    );
}

const summaryListItemSchema = z
  .string()
  .transform((value) => value.normalize("NFC").trim().replace(/\s+/gu, " "))
  .pipe(
    z
      .string()
      .min(1)
      .max(160)
      .refine((value) => !CONTROL_CHARACTERS.test(value), "Summary items contain invalid characters."),
  );

export const companySummaryModelResponseSchema = z
  .object({
    company_name: optionalSummaryText("Company name", 200),
    company_type: optionalSummaryText("Company type", 120),
    products_or_services: z.array(summaryListItemSchema).max(12),
    short_description: optionalSummaryText("Company description", 1_200),
    recurring_subjects: z.array(summaryListItemSchema).max(12),
    insufficient_information: z.boolean(),
  })
  .strict();

export type CompanySummaryModelResponse = z.infer<
  typeof companySummaryModelResponseSchema
>;

export interface ClientCompanySummaryView {
  companyName: string | null;
  companyType: string | null;
  productsOrServices: string[];
  shortDescription: string | null;
  recurringSubjects: string[];
  insufficientInformation: boolean;
  sourceArticleCount: number;
  sourceLatestPublishedAt: number | null;
  modelId: string | null;
  generatedAt: number;
  generatedBy: {
    id: string;
    fullName: string;
  };
}

export interface ClientDetailProfileView {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  company: string | null;
  department: string | null;
  jobTitle: string | null;
  status: "setup_pending" | "active" | "disabled";
  createdAt: number;
}

export interface ClientPublishedNewsView {
  id: string;
  title: string;
  publicationDate: number;
  status: "approved";
  language: string | null;
  category: NewsCategory | null;
  href: string;
}

export interface ClientPublishedNewsPageView {
  items: ClientPublishedNewsView[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ClientDetailView {
  client: ClientDetailProfileView;
  summary: ClientCompanySummaryView | null;
  publishedNews: ClientPublishedNewsPageView;
}

export interface ClientSummaryTargetView {
  id: string;
  fullName: string;
  hasSummary: boolean;
}
