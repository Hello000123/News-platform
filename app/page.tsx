import type { Metadata } from "next";

import {
  buildHomepageView,
  NewsHomepage,
} from "@/components/news/homepage-content";
import { getDatabase } from "@/lib/server/auth/database";
import { listPublicArticles } from "@/lib/server/feeds/repository";
import type { PipelineArticleView } from "@/lib/shared/feeds-contracts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "PressReady — Approved Newsroom",
  description: "Live approved reporting from the PressReady newsroom.",
};

export default async function HomePage() {
  let articles: PipelineArticleView[] = [];

  try {
    articles = await listPublicArticles(getDatabase(), 100);
  } catch {
    // The public prototype remains usable before its D1 binding is configured.
  }

  return <NewsHomepage view={buildHomepageView(articles)} />;
}
