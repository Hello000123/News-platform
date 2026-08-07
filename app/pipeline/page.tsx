import Link from "next/link";

import { AccountBar } from "@/components/auth/account-bar";
import { PipelineWorkspace } from "@/components/pipeline/pipeline-workspace";
import { requirePageSession } from "@/lib/server/auth/guards";
import { getWebsiteDefaultModel } from "@/lib/server/config";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "News Pipeline | PressReady",
};

export default async function PipelinePage() {
  const session = await requirePageSession("/pipeline");
  return (
    <div className="editorial-admin">
      <AccountBar user={session.user} />
      <main className="pipeline-page">
        <div className="pipeline-shell">
          <div className="pipeline-page-heading">
            <div>
              <div className="eyebrow">Editorial publishing</div>
              <h1>News Pipeline</h1>
              <p>
                Turn incoming reports into editable posts, upload your own featured
                photo, choose a public category, and publish directly to the newsroom.
              </p>
            </div>
            <Link className="button button-secondary" href="/review">
              Review workspace
            </Link>
          </div>
          <PipelineWorkspace initialModel={getWebsiteDefaultModel()} />
        </div>
      </main>
    </div>
  );
}
