import Link from "next/link";

import { AccountBar } from "@/components/auth/account-bar";
import { ClientDetail } from "@/components/employee/client-detail";
import { requirePageSession } from "@/lib/server/auth/guards";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Client Details | PressReady",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EmployeeClientDetailPage({ params }: PageProps) {
  const { id } = await params;
  const pathname = `/employee/clients/${encodeURIComponent(id)}`;
  const session = await requirePageSession(pathname, ["employee"]);
  return (
    <div className="editorial-admin">
      <AccountBar user={session.user} />
      <main className="employee-page">
        <div className="employee-shell">
          <Link className="employee-back-link" href="/employee?tab=clients">
            ← Back to client accounts
          </Link>
          <ClientDetail clientId={id} />
        </div>
      </main>
    </div>
  );
}
