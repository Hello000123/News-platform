import type { Metadata } from "next";

import {
  buildHomepageView,
  homepagePresentationSource,
  NewsHomepage,
} from "@/components/news/homepage-content";
import { getDatabase } from "@/lib/server/auth/database";
import { getOptionalPageSession } from "@/lib/server/auth/guards";
import { listPublicArticles } from "@/lib/server/feeds/repository";
import { getPublicPagePresentationState } from "@/lib/server/public-page-presentation";
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
  const source = homepagePresentationSource(view);
  let presentationDraft: ArticlePresentation | undefined;
  let publishedPresentation: ArticlePresentation | undefined;
  let canEditPresentation = false;

  try {
    const [session, presentation] = await Promise.all([
      getOptionalPageSession(),
      getPublicPagePresentationState(database, source),
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
