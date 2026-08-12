import { readFile } from "node:fs/promises";

import type { D1Database } from "@cloudflare/workers-types";
import { Miniflare } from "miniflare";
import { describe, expect, it } from "vitest";

import {
  getPublicPagePresentationState,
  publishPublicPagePresentation,
  savePublicPagePresentationDraft,
} from "@/lib/server/public-page-presentation";
import {
  articlePresentationBlockText,
  createDefaultArticlePresentation,
  replaceArticleText,
  setArticlePresentationImageGeometry,
} from "@/lib/shared/article-presentation";
import { createPublicPagePresentationSource } from "@/lib/shared/public-page-presentation";

async function executeSqlScript(database: D1Database, sql: string) {
  for (const statement of sql
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean)) {
    await database.prepare(statement).run();
  }
}

describe("public-page presentation persistence", () => {
  it("keeps saved page drafts private and publishes all validated text and image settings", async () => {
    const miniflare = new Miniflare({
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } };",
      d1Databases: { DB: "19191919-1919-1919-1919-191919191919" },
      cf: false,
    });

    try {
      const database = (await miniflare.getD1Database("DB")) as D1Database;
      for (const migration of [
        "0001_authentication.sql",
        "0019_public_page_presentations.sql",
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
           ) VALUES ('employee-1', 'editor@example.test', 'Editor', 'employee', 'active', 1, 1)`,
        )
        .run();

      const source = createPublicPagePresentationSource(
        "homepage",
        [
          { id: "home:lead:story:title", text: "Original lead" },
          { id: "home:related:story:title", text: "Related report" },
        ],
        ["home:lead:story:image", "home:related:story:image"],
      );
      const initial = createDefaultArticlePresentation(
        source.sourceUpdatedAt,
        source.sourceBlocks,
        source.sourceImageIds,
      );
      const edited = replaceArticleText(
        initial,
        "home:related:story:title",
        0,
        7,
        "Updated",
      );
      const resized = setArticlePresentationImageGeometry(
        edited,
        "home:related:story:image",
        { imageScalePercent: 65, imageAspectRatio: 1.4 },
      );

      await savePublicPagePresentationDraft(database, source, resized, "employee-1");
      const saved = await getPublicPagePresentationState(database, source);
      expect(
        articlePresentationBlockText(saved.draft, "home:related:story:title"),
      ).toBe("Updated report");
      expect(saved.draft.imageSettings["home:related:story:image"]).toEqual({
        imageScalePercent: 65,
        imageAspectRatio: 1.4,
      });
      expect(
        articlePresentationBlockText(saved.published, "home:related:story:title"),
      ).toBe("Related report");
      expect(saved.hasUnpublishedChanges).toBe(true);

      await publishPublicPagePresentation(database, source, resized, "employee-1");
      const published = await getPublicPagePresentationState(database, source);
      expect(
        articlePresentationBlockText(published.published, "home:related:story:title"),
      ).toBe("Updated report");
      expect(published.published.imageSettings["home:related:story:image"]?.imageScalePercent).toBe(
        65,
      );
      expect(published.hasUnpublishedChanges).toBe(false);

      const evolvedSource = createPublicPagePresentationSource(
        "homepage",
        [
          { id: "home:latest:new-story:title", text: "New report" },
          { id: "home:related:story:title", text: "Related report" },
          { id: "home:lead:story:title", text: "Original lead" },
        ],
        [
          "home:latest:new-story:image",
          "home:related:story:image",
          "home:lead:story:image",
        ],
      );
      const rebased = await getPublicPagePresentationState(database, evolvedSource);
      expect(
        articlePresentationBlockText(rebased.published, "home:related:story:title"),
      ).toBe("Updated report");
      expect(
        rebased.published.imageSettings["home:related:story:image"]?.imageScalePercent,
      ).toBe(65);
      expect(
        articlePresentationBlockText(rebased.published, "home:latest:new-story:title"),
      ).toBe("New report");
    } finally {
      await miniflare.dispose();
    }
  });

  it("rejects added page blocks and image identifiers on the server", async () => {
    const miniflare = new Miniflare({
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } };",
      d1Databases: { DB: "29292929-2929-2929-2929-292929292929" },
      cf: false,
    });

    try {
      const database = (await miniflare.getD1Database("DB")) as D1Database;
      for (const migration of [
        "0001_authentication.sql",
        "0019_public_page_presentations.sql",
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
           ) VALUES ('employee-1', 'editor@example.test', 'Editor', 'employee', 'active', 1, 1)`,
        )
        .run();
      const source = createPublicPagePresentationSource(
        "technology",
        [{ id: "category:technology:0:story:title", text: "Report" }],
        ["category:technology:0:story:image"],
      );
      const initial = createDefaultArticlePresentation(
        source.sourceUpdatedAt,
        source.sourceBlocks,
        source.sourceImageIds,
      );

      await expect(
        savePublicPagePresentationDraft(
          database,
          source,
          {
            ...initial,
            blocks: [
              ...initial.blocks,
              { ...initial.blocks[0], id: "category:technology:1:injected:title" },
            ],
          },
          "employee-1",
        ),
      ).rejects.toThrow(/added or removed|moved or reordered|structure/iu);
      await expect(
        savePublicPagePresentationDraft(
          database,
          source,
          {
            ...initial,
            imageSettings: {
              ...initial.imageSettings,
              "category:technology:0:injected:image": {
                imageScalePercent: 50,
                imageAspectRatio: null,
              },
            },
          },
          "employee-1",
        ),
      ).rejects.toThrow(/cannot be added or replaced/iu);
    } finally {
      await miniflare.dispose();
    }
  });
});
