import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  articleDisplayTitle,
  extractArticleSummary,
  selectRelatedArticles,
} from "@/components/news/article-content";
import { NewsArticlePageContent } from "@/components/news/article-page-content";
import { getArticlePresentationState } from "@/lib/server/article-presentation";
import { getDatabase } from "@/lib/server/auth/database";
import { getOptionalPageSession } from "@/lib/server/auth/guards";
import { getPublicArticleById, listPublicArticles } from "@/lib/server/feeds/repository";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string | string[] }>;
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

export default async function NewsArticlePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const database = getDatabase();
  const [article, approvedArticles, session, query] = await Promise.all([
    getPublicArticleById(database, id),
    listPublicArticles(database),
    getOptionalPageSession(),
    searchParams,
  ]);
  if (!article) notFound();
  const presentation = await getArticlePresentationState(database, article);
  const canEditPresentation = session?.user.role === "employee";
  const editPresentation = canEditPresentation && query.edit === "1";

  return (
    <NewsArticlePageContent
      article={article}
      related={selectRelatedArticles(article, approvedArticles)}
      presentationDraft={presentation.draft}
      publishedPresentation={presentation.published}
      canEditPresentation={canEditPresentation}
      editPresentation={editPresentation}
    />
  );
}
