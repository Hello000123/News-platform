import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  articleDisplayTitle,
  extractArticleSummary,
  selectRelatedArticles,
} from "@/components/news/article-content";
import { NewsArticlePageContent } from "@/components/news/article-page-content";
import { getDatabase } from "@/lib/server/auth/database";
import { getPublicArticleById, listPublicArticles } from "@/lib/server/feeds/repository";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const article = await getPublicArticleById(getDatabase(), id);
  if (!article) return { title: "找不到報道 | PressReady" };

  return {
    title: `${articleDisplayTitle(article)} | PressReady`,
    description: extractArticleSummary(article) ?? undefined,
  };
}

export default async function NewsArticlePage({ params }: PageProps) {
  const { id } = await params;
  const database = getDatabase();
  const [article, approvedArticles] = await Promise.all([
    getPublicArticleById(database, id),
    listPublicArticles(database),
  ]);
  if (!article) notFound();

  return (
    <NewsArticlePageContent
      article={article}
      related={selectRelatedArticles(article, approvedArticles)}
    />
  );
}
