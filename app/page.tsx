import type { Metadata } from "next";

import {
  buildHomepageView,
  NewsHomepage,
} from "@/components/news/homepage-content";
import { getArticlePresentationState } from "@/lib/server/article-presentation";
import { getDatabase } from "@/lib/server/auth/database";
import { getOptionalPageSession } from "@/lib/server/auth/guards";
import { listPublicArticles } from "@/lib/server/feeds/repository";
import type { ArticlePresentation } from "@/lib/shared/article-presentation";
import type { PipelineArticleView } from "@/lib/shared/feeds-contracts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "PressReady — Approved Newsroom",
  description: "Live approved reporting from the PressReady newsroom.",
};

interface HomePageProps {
  searchParams: Promise<{ edit?: string | string[] }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const database = getDatabase();
  let articles: PipelineArticleView[] = [];

  try {
    articles = await listPublicArticles(database, 100);
  } catch {
    // The public prototype remains usable before its D1 binding is configured.
  }

  const view = buildHomepageView(articles);
  const lead = view.lead && !view.lead.isPrototype ? view.lead.article : null;
  let presentationDraft: ArticlePresentation | undefined;
  let publishedPresentation: ArticlePresentation | undefined;
  let canEditPresentation = false;

  try {
    const [session, presentation] = await Promise.all([
      getOptionalPageSession(),
      lead ? getArticlePresentationState(database, lead) : Promise.resolve(null),
    ]);
    canEditPresentation = session?.user.role === "employee";
    presentationDraft = presentation?.draft;
    publishedPresentation = presentation?.published;
  } catch {
    // Public reading remains available while optional editing services are unavailable.
  }

  const query = await searchParams;
  return (
    <NewsHomepage
      view={view}
      presentationDraft={presentationDraft}
      publishedPresentation={publishedPresentation}
      canEditPresentation={canEditPresentation}
      editPresentation={canEditPresentation && query.edit === "1"}
    />
  );
}
