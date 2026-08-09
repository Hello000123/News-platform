import Link from "next/link";

import { AccountBar } from "@/components/auth/account-bar";
import { ApprovalDashboard } from "@/components/employee/approval-dashboard";
import { requirePageSession } from "@/lib/server/auth/guards";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Admin Panel | PressReady",
};

interface PageProps {
  searchParams: Promise<{ tab?: string | string[] }>;
}

export default async function EmployeeApprovalPage({ searchParams }: PageProps) {
  const session = await requirePageSession("/employee", ["employee"]);
  const query = await searchParams;
  const initialTab =
    query.tab === "clients" ||
    query.tab === "client-overview" ||
    query.tab === "employees" ||
    query.tab === "feeds"
      ? query.tab
      : "approval";
  return (
    <div className="editorial-admin">
      <AccountBar user={session.user} />
      <main className="employee-page">
        <div className="employee-shell">
          <div className="employee-page-heading">
            <div>
              <div className="eyebrow">Administration</div>
              <h1>Admin Panel</h1>
              <p>Review applications and manage client and employee account records.</p>
            </div>
            <div className="employee-page-heading-actions">
              <Link className="button button-primary" href="/pipeline">
                Manage news posts
              </Link>
              <Link className="button button-secondary" href="/review">
                Review workspace
              </Link>
            </div>
          </div>
          <ApprovalDashboard initialTab={initialTab} />
        </div>
      </main>
    </div>
  );
}
