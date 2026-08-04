import type { Metadata } from "next";

import {
  buildHomepageView,
  NewsHomepage,
} from "@/components/news/homepage-content";
import { getDatabase } from "@/lib/server/auth/database";
import { listPublicArticles } from "@/lib/server/feeds/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "PressReady — Approved Newsroom",
  description: "Live approved reporting from the PressReady newsroom.",
};

export default async function HomePage() {
  const articles = await listPublicArticles(getDatabase(), 15);
  return <NewsHomepage view={buildHomepageView(articles)} />;
}
