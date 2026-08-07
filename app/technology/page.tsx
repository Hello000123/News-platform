import type { Metadata } from "next";

import { CategoryPageContent } from "@/components/news/category-page-content";
import { getDatabase } from "@/lib/server/auth/database";
import { listPublicArticlesByCategory } from "@/lib/server/feeds/repository";
import type { PipelineArticleView } from "@/lib/shared/feeds-contracts";
import { newsCategoryDefinition } from "@/lib/shared/news-categories";

export const dynamic = "force-dynamic";

const category = newsCategoryDefinition("technology");

export const metadata: Metadata = {
  title: `${category.label}新聞｜PressReady`,
  description: category.description,
};

export default async function TechnologyPage() {
  let articles: PipelineArticleView[] = [];
  let loadFailed = false;

  try {
    articles = await listPublicArticlesByCategory(getDatabase(), category.value, 100);
  } catch {
    loadFailed = true;
  }

  return <CategoryPageContent articles={articles} category={category.value} loadFailed={loadFailed} />;
}
