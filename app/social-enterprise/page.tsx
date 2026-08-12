import type { Metadata } from "next";

import {
  CategoryPageContent,
  categoryPresentationSource,
} from "@/components/news/category-page-content";
import { getDatabase } from "@/lib/server/auth/database";
import { getOptionalPageSession } from "@/lib/server/auth/guards";
import { listPublicArticlesByCategory } from "@/lib/server/feeds/repository";
import { getPublicPagePresentationState } from "@/lib/server/public-page-presentation";
import type { ArticlePresentation } from "@/lib/shared/article-presentation";
import type { PipelineArticleView } from "@/lib/shared/feeds-contracts";
import { newsCategoryDefinition } from "@/lib/shared/news-categories";

export const dynamic = "force-dynamic";

const category = newsCategoryDefinition("social-enterprise");

export const metadata: Metadata = {
  title: `${category.label}｜PressReady`,
  description: category.description,
};

export default async function SocialEnterprisePage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string | string[] }>;
}) {
  const database = getDatabase();
  let articles: PipelineArticleView[] = [];
  let loadFailed = false;
  let presentationDraft: ArticlePresentation | undefined;
  let publishedPresentation: ArticlePresentation | undefined;
  let canEditPresentation = false;

  try {
    articles = await listPublicArticlesByCategory(database, category.value, 100);
  } catch {
    loadFailed = true;
  }

  try {
    const [session, presentation] = await Promise.all([
      getOptionalPageSession(),
      getPublicPagePresentationState(
        database,
        categoryPresentationSource(articles, category.value, loadFailed),
      ),
    ]);
    canEditPresentation = session?.user.role === "employee";
    presentationDraft = presentation.draft;
    publishedPresentation = presentation.published;
  } catch {
    // Public reading remains available while optional editing services are unavailable.
  }

  const query = await searchParams;
  return (
    <CategoryPageContent
      articles={articles}
      category={category.value}
      loadFailed={loadFailed}
      presentationDraft={presentationDraft}
      publishedPresentation={publishedPresentation}
      canEditPresentation={canEditPresentation}
      editPresentation={canEditPresentation && query.edit === "1"}
    />
  );
}
