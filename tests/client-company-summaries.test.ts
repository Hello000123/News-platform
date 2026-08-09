import { readFile } from "node:fs/promises";

import type { D1Database } from "@cloudflare/workers-types";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  generateClientCompanySummary,
  getEmployeeClientDetail,
  parseCompanySummaryResponse,
  type CompanySummaryEvidence,
} from "@/lib/server/client-summaries";
import {
  commitPipelineArticleRewrite,
  getPipelineArticleById,
  updatePipelineArticlePost,
} from "@/lib/server/feeds/repository";
import { AppError } from "@/lib/server/errors";

async function executeSqlScript(database: D1Database, sql: string) {
  for (const statement of sql
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean)) {
    await database.prepare(statement).run();
  }
}

const employee = {
  id: "employee-1",
  email: "employee@example.test",
  fullName: "Employee One",
  role: "employee" as const,
};

const baseEvidence: CompanySummaryEvidence = {
  client: {
    id: "client-1",
    fullName: "Private Contact Name",
    email: "private@example.test",
    phone: "+852 2222 3333",
    company: "Harbour Technology Limited",
    department: "Communications",
    jobTitle: "Editor",
    status: "active",
    createdAt: 1_800_000_000,
  },
  totalPublishedArticles: 1,
  latestPublishedAt: 1_800_000_100,
  articles: [
    {
      id: "article-1",
      title: "Harbour Technology launches newsroom platform",
      bodyExcerpt: "The company provides newsroom workflow software.",
      category: "technology",
      language: "traditional_chinese",
      publicationDate: 1_800_000_100,
    },
  ],
};

function validModelSummary(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    company_name: "Harbour Technology Limited",
    company_type: "News technology",
    products_or_services: ["Newsroom workflow software"],
    short_description: "A provider of newsroom workflow software.",
    recurring_subjects: ["Newsroom technology"],
    insufficient_information: false,
    ...overrides,
  });
}

describe("client company summary response validation", () => {
  it("accepts strict structured output, deduplicates lists, and anchors the profile company name", () => {
    const parsed = parseCompanySummaryResponse(
      validModelSummary({
        company_name: "Invented Holdings",
        products_or_services: ["Newsroom workflow software", "newsroom workflow software"],
        recurring_subjects: ["Newsroom technology", "Newsroom technology"],
      }),
      baseEvidence,
      "grok-4.5",
    );

    expect(parsed.company_name).toBe("Harbour Technology Limited");
    expect(parsed.products_or_services).toEqual(["Newsroom workflow software"]);
    expect(parsed.recurring_subjects).toEqual(["Newsroom technology"]);
  });

  it("rejects malformed or incomplete AI responses", () => {
    for (const response of ["not json", JSON.stringify({ company_name: "Only one field" })]) {
      try {
        parseCompanySummaryResponse(response, baseEvidence, "grok-4.5");
        throw new Error("Expected summary validation to fail.");
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe("INVALID_COMPANY_SUMMARY_FORMAT");
      }
    }
  });

  it("does not retain recurring subjects when there is no published-news evidence", () => {
    const parsed = parseCompanySummaryResponse(
      validModelSummary({ recurring_subjects: ["Invented subject"] }),
      { ...baseEvidence, articles: [], totalPublishedArticles: 0, latestPublishedAt: null },
    );
    expect(parsed.recurring_subjects).toEqual([]);
  });
});

describe("client company summary persistence and publication ownership", () => {
  let miniflare: Miniflare;
  let database: D1Database;

  beforeEach(async () => {
    miniflare = new Miniflare({
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } };",
      d1Databases: { DB: crypto.randomUUID() },
      cf: false,
    });
    database = (await miniflare.getD1Database("DB")) as D1Database;
    for (const migration of [
      "0001_authentication.sql",
      "0006_feeds_pipeline.sql",
      "0007_scraped_article_content.sql",
      "0008_pipeline_article_merges.sql",
      "0010_pipeline_article_publication.sql",
      "0011_pipeline_article_categories.sql",
      "0013_pipeline_rewrite_commits.sql",
      "0018_client_company_summaries.sql",
    ]) {
      await executeSqlScript(
        database,
        await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8"),
      );
    }
    await database
      .prepare(
        `INSERT INTO users (
           id, email, full_name, phone, company, department, job_title,
           role, status, created_at, updated_at
         ) VALUES
           ('employee-1', 'employee@example.test', 'Employee One', NULL, NULL, NULL, NULL,
             'employee', 'active', 1800000000, 1800000000),
           ('employee-2', 'employee2@example.test', 'Employee Two', NULL, NULL, NULL, NULL,
             'employee', 'active', 1800000000, 1800000000),
           ('client-1', 'private@example.test', 'Private Contact Name', '+852 2222 3333',
             'Harbour Technology Limited', 'Communications', 'Editor',
             'client', 'active', 1800000000, 1800000000),
           ('client-2', 'minimal@example.test', 'Minimal Client', NULL, NULL, NULL, NULL,
             'client', 'active', 1800000000, 1800000000)`,
      )
      .run();
    await database
      .prepare(
        `INSERT INTO feeds (
           id, name, url, status, created_at, updated_at, created_by_user_id
         ) VALUES (
           'feed-1', 'Test Feed', 'https://feed.example.test/rss', 'active',
           1800000000, 1800000000, 'employee-1'
         )`,
      )
      .run();
  });

  afterEach(async () => {
    await miniflare.dispose();
  });

  async function insertArticle(
    id: string,
    publisher: string | null,
    publishedAt: number,
    status: "new" | "rewritten" | "approved" = "approved",
  ) {
    await database
      .prepare(
        `INSERT INTO pipeline_articles (
           id, feed_id, title, url, status, rewritten_text, source_text,
           category, published_at, published_by_user_id, created_at, updated_at
         ) VALUES (?, 'feed-1', ?, ?, ?, ?, ?, 'technology', ?, ?, ?, ?)`,
      )
      .bind(
        id,
        `Article ${id}`,
        `https://news.example.test/${id}`,
        status,
        status === "new" ? null : `Headline ${id}\n\nPublished article body for ${id}.`,
        `Source ${id}`,
        status === "approved" ? publishedAt : null,
        publisher,
        publishedAt - 10,
        publishedAt - 10,
      )
      .run();
  }

  it("sends only approved company fields and public evidence, validates output, and upserts regeneration", async () => {
    await insertArticle("summary-article", "client-1", 1_800_000_100);
    const completion = vi.fn(async (request: { userPrompt: string; stage: string }) => {
      expect(request.stage).toBe("company_summary_request");
      expect(request.userPrompt).toContain("Harbour Technology Limited");
      expect(request.userPrompt).toContain("Published article body");
      expect(request.userPrompt).not.toContain("private@example.test");
      expect(request.userPrompt).not.toContain("+852 2222 3333");
      expect(request.userPrompt).not.toContain("Private Contact Name");
      return validModelSummary();
    });

    const first = await generateClientCompanySummary(
      database,
      "client-1",
      employee,
      completion,
    );
    expect(first.companyType).toBe("News technology");
    expect(first.sourceArticleCount).toBe(1);

    await generateClientCompanySummary(
      database,
      "client-1",
      employee,
      async () => validModelSummary({ company_type: "Media software" }),
    );
    const rows = await database
      .prepare(
        `SELECT COUNT(*) AS total, company_type
         FROM client_company_summaries
         WHERE client_user_id = 'client-1'`,
      )
      .first<{ total: number; company_type: string }>();
    expect(rows).toEqual({ total: 1, company_type: "Media software" });
  });

  it("stores an insufficient-information result without calling AI when no usable evidence exists", async () => {
    const completion = vi.fn(async () => validModelSummary());
    const summary = await generateClientCompanySummary(
      database,
      "client-2",
      employee,
      completion,
    );
    expect(completion).not.toHaveBeenCalled();
    expect(summary.insufficientInformation).toBe(true);
    expect(summary.modelId).toBeNull();
    expect(summary.productsOrServices).toEqual([]);
  });

  it("rejects non-employees and unknown or non-client detail identifiers", async () => {
    await expect(
      generateClientCompanySummary(
        database,
        "client-1",
        { ...employee, id: "client-1", role: "client" },
        async () => validModelSummary(),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      getEmployeeClientDetail(database, "employee-1"),
    ).rejects.toMatchObject({ code: "CLIENT_NOT_FOUND" });
  });

  it("paginates only articles owned by the requested client", async () => {
    for (let index = 1; index <= 12; index += 1) {
      await insertArticle(`owned-${index}`, "client-1", 1_800_001_000 + index);
    }
    await insertArticle("other-client", "client-2", 1_800_002_000);

    const detail = await getEmployeeClientDetail(database, "client-1", {
      page: 2,
      pageSize: 10,
    });
    expect(detail.publishedNews.totalItems).toBe(12);
    expect(detail.publishedNews.page).toBe(2);
    expect(detail.publishedNews.items).toHaveLength(2);
    expect(detail.publishedNews.items.map(({ id }) => id)).not.toContain("other-client");
  });

  it("records the authenticated publisher on direct and AI publication paths", async () => {
    await insertArticle("direct-publish", null, 1_800_003_000, "rewritten");
    await updatePipelineArticlePost(
      database,
      "direct-publish",
      { status: "approved" },
      "client-1",
    );
    let owner = await database
      .prepare("SELECT published_by_user_id FROM pipeline_articles WHERE id = ?")
      .bind("direct-publish")
      .first<{ published_by_user_id: string | null }>();
    expect(owner?.published_by_user_id).toBe("client-1");

    await updatePipelineArticlePost(
      database,
      "direct-publish",
      { status: "approved" },
      "employee-2",
    );
    owner = await database
      .prepare("SELECT published_by_user_id FROM pipeline_articles WHERE id = ?")
      .bind("direct-publish")
      .first<{ published_by_user_id: string | null }>();
    expect(owner?.published_by_user_id).toBe("client-1");

    await insertArticle("ai-publish", null, 1_800_004_000, "new");
    const before = await getPipelineArticleById(database, "ai-publish");
    expect(before).not.toBeNull();
    await commitPipelineArticleRewrite(database, {
      articleId: "ai-publish",
      rewrittenText: "AI headline\n\nAI article body.",
      status: "approved",
      precondition: {
        status: before!.status,
        updatedAt: before!.updatedAt,
        rewrittenText: before!.rewrittenText,
      },
      relatedArticleIds: [],
      requestedByUserId: "client-1",
      requestedModel: "grok-4.5",
      outputLanguage: "traditional_chinese",
      requestedLengthOption: null,
      relatedReportCount: 1,
      validationStatus: "passed",
      attempts: 1,
    });
    owner = await database
      .prepare("SELECT published_by_user_id FROM pipeline_articles WHERE id = ?")
      .bind("ai-publish")
      .first<{ published_by_user_id: string | null }>();
    expect(owner?.published_by_user_id).toBe("client-1");
  });
});
