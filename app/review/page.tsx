import type { Metadata } from "next";

import { ReviewWorkspacePage } from "@/components/review-workspace-page";
import { requirePageSession } from "@/lib/server/auth/guards";
import { getReviewPassScore, getWebsiteDefaultModel } from "@/lib/server/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Review workspace | PressReady",
};

export default async function ReviewPage() {
  const session = await requirePageSession("/review");
  return (
    <ReviewWorkspacePage
      user={session.user}
      passScore={getReviewPassScore()}
      initialModel={getWebsiteDefaultModel()}
    />
  );
}
