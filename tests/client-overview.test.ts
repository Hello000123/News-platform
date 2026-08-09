import { readFile } from "node:fs/promises";

import type { D1Database } from "@cloudflare/workers-types";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getClientOverview } from "@/lib/server/client-overview";

async function executeSqlScript(database: D1Database, sql: string) {
  for (const statement of sql
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean)) {
    await database.prepare(statement).run();
  }
}

describe("client overview aggregation", () => {
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
      "0010_pipeline_article_publication.sql",
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
           id, email, full_name, role, status, created_at, updated_at
         ) VALUES
           ('employee-1', 'employee@example.test', 'Employee One', 'employee', 'active', 1, 1),
           ('client-1', 'one@example.test', 'Client One', 'client', 'active', 1, 1),
           ('client-2', 'two@example.test', 'Client Two', 'client', 'setup_pending', 1, 1),
           ('client-3', 'three@example.test', 'Client Three', 'client', 'active', 1, 1),
           ('client-4', 'four@example.test', 'Client Four', 'client', 'active', 1, 1),
           ('client-5', 'five@example.test', 'Client Five', 'client', 'active', 1, 1),
           ('client-6', 'six@example.test', 'Client Six', 'client', 'active', 1, 1),
           ('client-7', 'seven@example.test', 'Client Seven', 'client', 'disabled', 1, 1)`,
      )
      .run();
    const insertSummary = database.prepare(
      `INSERT INTO client_company_summaries (
         client_user_id, company_type, products_or_services_json,
         recurring_subjects_json, insufficient_information,
         source_article_count, generated_at, updated_at, generated_by_user_id
       ) VALUES (?, ?, '[]', '[]', ?, 0, 2, 2, 'employee-1')`,
    );
    await database.batch([
      insertSummary.bind("client-1", "Technology", 0),
      insertSummary.bind("client-2", " technology ", 0),
      insertSummary.bind("client-3", "Media", 0),
      insertSummary.bind("client-5", null, 1),
      insertSummary.bind("client-6", "Unknown", 1),
      insertSummary.bind("client-7", "TECHNOLOGY", 0),
    ]);
  });

  afterEach(async () => {
    await miniflare.dispose();
  });

  it("uses every client account as the denominator and groups structured types case-insensitively", async () => {
    const overview = await getClientOverview(database);
    const distribution = overview.companyTypeDistribution;

    expect(distribution.totalClients).toBe(7);
    expect(distribution.classifiedClients).toBe(4);
    expect(distribution.unclassifiedClients).toBe(3);
    expect(distribution.items).toEqual(
      expect.arrayContaining([
        {
          companyType: "TECHNOLOGY",
          clientCount: 3,
          percentage: 42.9,
          isUnclassified: false,
        },
        {
          companyType: "Media",
          clientCount: 1,
          percentage: 14.3,
          isUnclassified: false,
        },
        {
          companyType: "Unknown / Unclassified",
          clientCount: 3,
          percentage: 42.9,
          isUnclassified: true,
        },
      ]),
    );
    const roundedTotal = distribution.items.reduce(
      (total, item) => total + item.percentage,
      0,
    );
    expect(roundedTotal).toBeCloseTo(100, 0);
  });

  it("returns a stable empty distribution when there are no client accounts", async () => {
    await database.prepare("DELETE FROM client_company_summaries").run();
    await database.prepare("DELETE FROM users WHERE role = 'client'").run();
    const overview = await getClientOverview(database);
    expect(overview.companyTypeDistribution).toEqual({
      totalClients: 0,
      classifiedClients: 0,
      unclassifiedClients: 0,
      items: [],
    });
  });
});
