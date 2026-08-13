"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ClientRemovalDialog } from "@/components/employee/client-removal-dialog";
import {
  ClientRecoveryDialog,
  ClientSuspensionDialog,
} from "@/components/employee/client-suspension-dialog";
import { ClientOverview } from "@/components/employee/client-overview";
import { FeedManagement } from "@/components/employee/feed-management";
import {
  AuthRequestError,
  generateEmployeeClientSummary,
  getEmployeeAgentUsageThresholds,
  listEmployeeClientSummaryTargets,
  listEmployeeAccountRequests,
  listEmployeeAccounts,
  updateEmployeeAgentUsageThresholds,
} from "@/lib/client/auth-api";
import type {
  AccountListUserView,
  AccountRoleSummary,
  AccountRequestStatus,
  AccountRequestView,
  AgentUsagePeriodView,
  AgentUsageThresholdRuleView,
  EmailDeliveryView,
} from "@/lib/shared/auth-contracts";
import {
  AGENT_USAGE_PERIODS,
  DEFAULT_AGENT_USAGE_PERIOD,
  type AgentUsagePeriod,
} from "@/lib/shared/agent-usage";

type AdminTab =
  | "approval"
  | "clients"
  | "client-overview"
  | "employees"
  | "feeds";
type Filter = AccountRequestStatus | "all";

interface SummaryBatchProgress {
  status: "preparing" | "running" | "complete";
  total: number;
  completed: number;
  succeeded: number;
  currentClient: string | null;
  failures: Array<{ clientName: string; message: string }>;
}

const ADMIN_TABS: Array<{ value: AdminTab; label: string }> = [
  { value: "approval", label: "Account Approval" },
  { value: "clients", label: "Client Accounts" },
  { value: "client-overview", label: "Client Overview" },
  { value: "employees", label: "Employee Accounts" },
  { value: "feeds", label: "News Feeds" },
];

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All requests" },
];

function formattedDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-HK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  }).format(new Date(timestamp * 1_000));
}

function formattedSuspensionDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-HK", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Hong_Kong",
    timeZoneName: "short",
  }).format(new Date(timestamp * 1_000));
}

function loadingLabel(tab: AdminTab) {
  if (tab === "approval") return "Loading account requests";
  if (tab === "clients") return "Loading client accounts";
  if (tab === "client-overview") return "Loading client overview";
  return "Loading employee accounts";
}

export function ApprovalDashboard({
  initialTab = "approval",
}: {
  initialTab?: AdminTab;
}) {
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);
  const [filter, setFilter] = useState<Filter>("pending");
  const [requests, setRequests] = useState<AccountRequestView[]>([]);
  const [accounts, setAccounts] = useState<AccountListUserView[]>([]);
  const [summary, setSummary] = useState<AccountRoleSummary | null>(null);
  const [usagePeriod, setUsagePeriod] = useState<AgentUsagePeriod>(
    DEFAULT_AGENT_USAGE_PERIOD,
  );
  const [usagePeriodView, setUsagePeriodView] =
    useState<AgentUsagePeriodView | null>(null);
  const [thresholdRules, setThresholdRules] = useState<
    AgentUsageThresholdRuleView[]
  >([]);
  const [thresholdSaving, setThresholdSaving] = useState(false);
  const [thresholdError, setThresholdError] = useState("");
  const [summaryBatch, setSummaryBatch] = useState<SummaryBatchProgress | null>(
    null,
  );
  const [loading, setLoading] = useState(
    initialTab !== "feeds" && initialTab !== "client-overview",
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState<{
    kind: "success" | "warning";
    message: string;
  } | null>(null);
  const [clientToRemove, setClientToRemove] =
    useState<AccountListUserView | null>(null);
  const [clientToSuspend, setClientToSuspend] =
    useState<AccountListUserView | null>(null);
  const [clientToRecover, setClientToRecover] =
    useState<AccountListUserView | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    if (activeTab === "feeds" || activeTab === "client-overview") {
      return () => {
        cancelled = true;
      };
    }

    async function load() {
      if (activeTab === "approval") {
        const result = await listEmployeeAccountRequests(
          filter === "all" ? undefined : filter,
        );
        if (cancelled) return;
        setSummary(result.summary);
        setRequests(result.requests);
        return;
      }
      if (activeTab === "clients") {
        const [result, thresholds] = await Promise.all([
          listEmployeeAccounts("client", usagePeriod),
          getEmployeeAgentUsageThresholds(),
        ]);
        if (cancelled) return;
        setSummary(result.summary);
        setAccounts(result.accounts);
        setUsagePeriodView(result.usagePeriod);
        setThresholdRules(thresholds.rules);
        return;
      }
      const result = await listEmployeeAccounts(
        "employee",
        DEFAULT_AGENT_USAGE_PERIOD,
      );
      if (cancelled) return;
      setSummary(result.summary);
      setAccounts(result.accounts);
      setUsagePeriodView(result.usagePeriod);
    }

    void load()
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(
            error instanceof AuthRequestError
              ? error.message
              : "Admin Panel data could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, filter, refreshVersion, usagePeriod]);

  function changeTab(tab: AdminTab) {
    if (tab === activeTab) return;
    setNotice(null);
    setErrorMessage("");
    setAccounts([]);
    setRequests([]);
    setUsagePeriodView(null);
    setThresholdError("");
    if (tab !== "feeds" && tab !== "client-overview") {
      setLoading(true);
    } else {
      setLoading(false);
    }
    setActiveTab(tab);
  }

  async function saveThresholdRules(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setThresholdSaving(true);
    setThresholdError("");
    setNotice(null);
    try {
      const result = await updateEmployeeAgentUsageThresholds({
        rules: thresholdRules.map(
          ({ period, enabled, threshold, suspensionHours }) => ({
            period,
            enabled,
            threshold,
            suspensionHours,
          }),
        ),
      });
      setThresholdRules(result.rules);
      setNotice({
        kind: "success",
        message: "Automatic AI usage suspension thresholds were saved.",
      });
    } catch (error) {
      setThresholdError(
        error instanceof AuthRequestError
          ? error.message
          : "The suspension thresholds could not be saved.",
      );
    } finally {
      setThresholdSaving(false);
    }
  }

  async function generateAllClientSummaries() {
    setSummaryBatch({
      status: "preparing",
      total: 0,
      completed: 0,
      succeeded: 0,
      currentClient: null,
      failures: [],
    });
    setNotice(null);
    try {
      const { clients } = await listEmployeeClientSummaryTargets();
      if (clients.length === 0) {
        setSummaryBatch({
          status: "complete",
          total: 0,
          completed: 0,
          succeeded: 0,
          currentClient: null,
          failures: [],
        });
        return;
      }
      let completed = 0;
      let succeeded = 0;
      const failures: SummaryBatchProgress["failures"] = [];
      for (const client of clients) {
        setSummaryBatch({
          status: "running",
          total: clients.length,
          completed,
          succeeded,
          currentClient: client.fullName,
          failures: [...failures],
        });
        try {
          await generateEmployeeClientSummary(client.id);
          succeeded += 1;
        } catch (error) {
          failures.push({
            clientName: client.fullName,
            message:
              error instanceof AuthRequestError
                ? error.message
                : "Summary generation failed.",
          });
        }
        completed += 1;
        setSummaryBatch({
          status: "running",
          total: clients.length,
          completed,
          succeeded,
          currentClient: null,
          failures: [...failures],
        });
      }
      setSummaryBatch({
        status: "complete",
        total: clients.length,
        completed,
        succeeded,
        currentClient: null,
        failures,
      });
    } catch (error) {
      setSummaryBatch({
        status: "complete",
        total: 0,
        completed: 0,
        succeeded: 0,
        currentClient: null,
        failures: [
          {
            clientName: "Client batch",
            message:
              error instanceof AuthRequestError
                ? error.message
                : "The client summary batch could not be started.",
          },
        ],
      });
    }
  }

  function handleRemoved(delivery: EmailDeliveryView) {
    const client = clientToRemove;
    setClientToRemove(null);
    setNotice(
      delivery.status === "failed"
        ? {
            kind: "warning",
            message:
              `${client?.fullName || "The client"} was permanently removed, ` +
              "but the removal email could not be delivered.",
          }
        : {
            kind: "success",
            message:
              delivery.status === "sent"
                ? `${client?.fullName || "The client"} was permanently removed and the notification email was sent.`
                : `${client?.fullName || "The client"} was permanently removed. Email preview mode recorded the notification without sending it externally.`,
          },
    );
    setLoading(true);
    setRefreshVersion((current) => current + 1);
  }

  function handleSuspended(delivery: EmailDeliveryView) {
    const client = clientToSuspend;
    setClientToSuspend(null);
    setNotice(
      delivery.status === "failed"
        ? {
            kind: "warning",
            message:
              `${client?.fullName || "The client"} can no longer access PressReady, ` +
              "but the suspension email could not be delivered.",
          }
        : {
            kind: "success",
            message:
              delivery.status === "sent"
                ? `${client?.fullName || "The client"} was suspended and the reason was emailed.`
                : `${client?.fullName || "The client"} was suspended. Email preview mode recorded the notification without sending it externally.`,
          },
    );
    setLoading(true);
    setRefreshVersion((current) => current + 1);
  }

  function handleRecovered() {
    const client = clientToRecover;
    setClientToRecover(null);
    setNotice({
      kind: "success",
      message: `${client?.fullName || "The client"} was recovered and can sign in again.`,
    });
    setLoading(true);
    setRefreshVersion((current) => current + 1);
  }

  return (
    <section className="employee-dashboard" aria-busy={loading}>
      {activeTab !== "client-overview" ? (
        <section className="account-summary" aria-labelledby="account-summary-heading">
          <div className="account-summary-heading">
            <div>
              <div className="section-kicker">Accounts</div>
              <h2 id="account-summary-heading">Account summary</h2>
            </div>
            <span>Current active role totals</span>
          </div>
          <div className="account-summary-grid">
            <article className="account-summary-card">
              <span>Employee accounts</span>
              <strong>{summary?.employeeAccounts ?? "—"}</strong>
            </article>
            <article className="account-summary-card">
              <span>Client accounts</span>
              <strong>{summary?.clientAccounts ?? "—"}</strong>
            </article>
          </div>
        </section>
      ) : null}

      <div className="admin-tabs" role="tablist" aria-label="Admin Panel sections">
        {ADMIN_TABS.map((tab) => (
          <button
            id={`admin-tab-${tab.value}`}
            className={activeTab === tab.value ? "admin-tab-active" : ""}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.value}
            aria-controls={`admin-panel-${tab.value}`}
            key={tab.value}
            onClick={() => changeTab(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {notice ? (
        <div
          className={`auth-alert ${
            notice.kind === "success"
              ? "auth-alert-success"
              : "auth-alert-error"
          }`}
          role={notice.kind === "success" ? "status" : "alert"}
        >
          {notice.message}
        </div>
      ) : null}

      {loading && activeTab !== "feeds" && activeTab !== "client-overview" ? (
        <div className="loading-panel" role="status">
          <span className="spinner spinner-dark" aria-hidden="true" />
          <div>
            <strong>{loadingLabel(activeTab)}</strong>
            <p>Retrieving the latest account records.</p>
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="auth-alert auth-alert-error" role="alert">
          {errorMessage}
        </div>
      ) : null}

      <section
        id="admin-panel-approval"
        role="tabpanel"
        aria-labelledby="admin-tab-approval"
        hidden={activeTab !== "approval"}
      >
        <div className="employee-filter" aria-label="Filter account requests">
          {FILTERS.map((option) => (
            <button
              type="button"
              className={filter === option.value ? "employee-filter-active" : ""}
              aria-pressed={filter === option.value}
              key={option.value}
              onClick={() => {
                if (filter === option.value) return;
                setLoading(true);
                setErrorMessage("");
                setNotice(null);
                setFilter(option.value);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>

        {!loading && !errorMessage && requests.length === 0 ? (
          <div className="employee-empty">
            <strong>
              No {filter === "all" ? "" : `${filter} `}account requests
            </strong>
            <p>Requests matching this view will appear here.</p>
          </div>
        ) : null}

        {!loading && requests.length > 0 ? (
          <div className="employee-request-list">
            {requests.map((request) => (
              <article className="employee-request-row" key={request.id}>
                <div>
                  <div className="employee-request-title">
                    <h2>{request.fullName}</h2>
                    <span className={`status-badge status-${request.status}`}>
                      {request.status}
                    </span>
                  </div>
                  <p>
                    {[request.company, request.department]
                      .filter(Boolean)
                      .join(" · ") || "Organisation details not provided"}
                  </p>
                  <small>
                    Submitted {formattedDate(request.createdAt)}
                    {request.decidedBy
                      ? ` · ${request.status} by ${request.decidedBy.fullName}`
                      : ""}
                  </small>
                </div>
                <Link
                  className="button button-secondary"
                  href={`/employee/requests/${encodeURIComponent(request.id)}`}
                >
                  View details
                </Link>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      {activeTab === "feeds" ? (
        <section
          id="admin-panel-feeds"
          role="tabpanel"
          aria-labelledby="admin-tab-feeds"
        >
          <FeedManagement />
        </section>
      ) : null}

      {activeTab === "client-overview" ? (
        <section
          id="admin-panel-client-overview"
          role="tabpanel"
          aria-labelledby="admin-tab-client-overview"
        >
          <ClientOverview />
        </section>
      ) : null}

      {activeTab !== "approval" &&
      activeTab !== "feeds" &&
      activeTab !== "client-overview" ? (
        <section
          id={`admin-panel-${activeTab}`}
          className="admin-account-panel"
          role="tabpanel"
          aria-labelledby={`admin-tab-${activeTab}`}
        >
          {activeTab === "clients" ? (
            <>
              <section className="admin-summary-batch" aria-labelledby="summary-batch-title">
                <div className="admin-summary-batch-heading">
                  <div>
                    <span className="section-kicker">Company intelligence</span>
                    <h2 id="summary-batch-title">Client company summaries</h2>
                    <p>
                      Generate evidence-bound summaries sequentially for every active client.
                      Existing summaries are safely replaced instead of duplicated.
                    </p>
                  </div>
                  <button
                    className="button button-primary"
                    type="button"
                    disabled={
                      summaryBatch?.status === "preparing" ||
                      summaryBatch?.status === "running"
                    }
                    onClick={() => void generateAllClientSummaries()}
                  >
                    {summaryBatch?.status === "preparing" ||
                    summaryBatch?.status === "running"
                      ? "Generating summaries…"
                      : "Generate All Client Summaries"}
                  </button>
                </div>
                {summaryBatch ? (
                  <div
                    className={`admin-summary-batch-progress ${
                      summaryBatch.status === "complete" && summaryBatch.failures.length > 0
                        ? "admin-summary-batch-partial"
                        : ""
                    }`}
                    role={
                      summaryBatch.status === "complete" && summaryBatch.failures.length > 0
                        ? "alert"
                        : "status"
                    }
                    aria-live="polite"
                  >
                    <strong>
                      {summaryBatch.status === "preparing"
                        ? "Preparing the client list…"
                        : summaryBatch.status === "running"
                          ? `${summaryBatch.completed} of ${summaryBatch.total} completed`
                          : summaryBatch.total === 0 && summaryBatch.failures.length === 0
                            ? "No active clients require summaries."
                            : summaryBatch.failures.length === 0
                              ? `All ${summaryBatch.succeeded} client summaries completed successfully.`
                              : `${summaryBatch.succeeded} of ${summaryBatch.total} summaries completed; ${summaryBatch.failures.length} failed.`}
                    </strong>
                    {summaryBatch.total > 0 ? (
                      <progress
                        max={summaryBatch.total}
                        value={summaryBatch.completed}
                        aria-label="Client summary generation progress"
                      />
                    ) : null}
                    {summaryBatch.currentClient ? (
                      <span>Generating {summaryBatch.currentClient}</span>
                    ) : null}
                    {summaryBatch.failures.length > 0 ? (
                      <ul>
                        {summaryBatch.failures.slice(0, 5).map((failure) => (
                          <li key={`${failure.clientName}:${failure.message}`}>
                            <strong>{failure.clientName}:</strong> {failure.message}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </section>

              <div className="admin-usage-toolbar">
                <div>
                  <label htmlFor="admin-usage-period">AI usage period</label>
                  <select
                    id="admin-usage-period"
                    value={usagePeriod}
                    disabled={loading}
                    onChange={(event) => {
                      const nextPeriod = event.target.value as AgentUsagePeriod;
                      if (nextPeriod === usagePeriod) return;
                      setLoading(true);
                      setErrorMessage("");
                      setNotice(null);
                      setAccounts([]);
                      setUsagePeriodView(null);
                      setUsagePeriod(nextPeriod);
                    }}
                  >
                    {AGENT_USAGE_PERIODS.map((period) => (
                      <option value={period.key} key={period.key}>
                        {period.label}
                      </option>
                    ))}
                  </select>
                </div>
                {usagePeriodView ? (
                  <div className="admin-usage-coverage" role="note">
                    <strong>Selected period: {usagePeriodView.label}</strong>
                    {usagePeriodView.period === "lifetime" ? (
                      <p>
                        Lifetime totals preserve requests recorded before timestamped tracking
                        began.
                      </p>
                    ) : usagePeriodView.isComplete ? (
                      <p>
                        This window is fully covered by timestamped tracking. Earlier aggregate-only
                        usage remains available under Lifetime.
                      </p>
                    ) : (
                      <p>
                        Partial period data: timestamped tracking began{" "}
                        {formattedDate(usagePeriodView.trackingStartedAt)}. Earlier requests in this
                        period cannot be reconstructed; their lifetime totals remain preserved.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>

              {thresholdRules.length > 0 ? (
                <form
                  className="admin-threshold-settings"
                  onSubmit={saveThresholdRules}
                >
                  <div className="admin-threshold-heading">
                    <div>
                      <span className="section-kicker">Automatic protection</span>
                      <h2>Automatic AI usage suspension</h2>
                      <p>
                        Set an independent request limit and suspension time for each
                        rolling period. Suspension time accepts up to two decimal places.
                      </p>
                    </div>
                    <button
                      className="button button-primary"
                      type="submit"
                      disabled={thresholdSaving}
                    >
                      {thresholdSaving ? "Saving thresholds…" : "Save thresholds"}
                    </button>
                  </div>
                  {thresholdError ? (
                    <div className="auth-alert auth-alert-error" role="alert">
                      {thresholdError}
                    </div>
                  ) : null}
                  <fieldset disabled={thresholdSaving}>
                    <legend className="sr-only">Automatic suspension thresholds</legend>
                    <div className="admin-threshold-grid">
                      {thresholdRules.map((rule) => (
                        <div className="admin-threshold-rule" key={rule.period}>
                          <div>
                            <strong>{rule.label}</strong>
                            <label className="admin-threshold-toggle">
                              <input
                                type="checkbox"
                                aria-label={`Enable automatic suspension for ${rule.label}`}
                                checked={rule.enabled}
                                onChange={(event) => {
                                  const enabled = event.target.checked;
                                  setThresholdRules((current) =>
                                    current.map((candidate) =>
                                      candidate.period === rule.period
                                        ? { ...candidate, enabled }
                                        : candidate,
                                    ),
                                  );
                                }}
                              />
                              <span>{rule.enabled ? "Enabled" : "Disabled"}</span>
                            </label>
                          </div>
                          <label htmlFor={`agent-threshold-${rule.period}`}>
                            Request limit
                          </label>
                          <input
                            id={`agent-threshold-${rule.period}`}
                            type="number"
                            aria-label={`Request limit for ${rule.label}`}
                            min="1"
                            max="1000000"
                            step="1"
                            required
                            value={rule.threshold}
                            onChange={(event) => {
                              const threshold = event.target.valueAsNumber;
                              setThresholdRules((current) =>
                                current.map((candidate) =>
                                  candidate.period === rule.period
                                    ? { ...candidate, threshold }
                                    : candidate,
                                ),
                              );
                            }}
                          />
                          <label htmlFor={`agent-suspension-hours-${rule.period}`}>
                            Suspension time (hours)
                          </label>
                          <input
                            id={`agent-suspension-hours-${rule.period}`}
                            type="number"
                            aria-label={`Suspension time in hours for ${rule.label}`}
                            min="0.01"
                            max="8760"
                            step="0.01"
                            inputMode="decimal"
                            required
                            value={rule.suspensionHours}
                            onChange={(event) => {
                              const suspensionHours = event.target.valueAsNumber;
                              setThresholdRules((current) =>
                                current.map((candidate) =>
                                  candidate.period === rule.period
                                    ? { ...candidate, suspensionHours }
                                    : candidate,
                                ),
                              );
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </fieldset>
                </form>
              ) : null}
            </>
          ) : null}

          {!loading && !errorMessage && accounts.length === 0 ? (
            <div className="employee-empty">
              <strong>
                No {activeTab === "clients" ? "client" : "employee"} accounts
              </strong>
              <p>Accounts with this role will appear here.</p>
            </div>
          ) : null}

          {!loading && accounts.length > 0 ? (
            <div className="admin-account-list">
              {accounts.map((account) => (
                <article className="admin-account-row" key={account.id}>
                  <div>
                    <h2>
                      {activeTab === "clients" ? (
                        <Link
                          className="admin-client-name-link"
                          href={`/employee/clients/${encodeURIComponent(account.id)}`}
                        >
                          {account.fullName}
                        </Link>
                      ) : (
                        account.fullName
                      )}
                    </h2>
                    <a href={`mailto:${account.email}`}>{account.email}</a>
                    <span
                      className={`status-badge ${
                        account.manualSuspension || account.aiSuspension
                          ? "status-suspended"
                          : `status-${account.status}`
                      }`}
                    >
                      {account.manualSuspension || account.aiSuspension
                        ? "Suspended"
                        : account.status === "setup_pending"
                          ? "Setup pending"
                          : account.status}
                    </span>
                    {activeTab === "clients" && account.manualSuspension ? (
                      <div className="admin-account-suspension" role="note">
                        <strong>Account manually suspended</strong>
                        <span>
                          Suspended {formattedSuspensionDate(account.manualSuspension.startedAt)}
                          {account.manualSuspension.suspendedBy
                            ? ` by ${account.manualSuspension.suspendedBy.fullName}`
                            : ""}
                        </span>
                        <p>{account.manualSuspension.reason}</p>
                      </div>
                    ) : null}
                    {activeTab === "clients" && account.aiSuspension ? (
                      <div className="admin-account-suspension" role="note">
                        <strong>Account automatically suspended</strong>
                        <span>
                          Automatically recovers{" "}
                          {formattedSuspensionDate(account.aiSuspension.expiresAt)}
                        </span>
                        <p>
                          {account.aiSuspension.observedRequestCount.toLocaleString("en-US")} AI
                          requests in {account.aiSuspension.periodLabel} exceeded the configured
                          limit of {account.aiSuspension.configuredThreshold.toLocaleString("en-US")}.
                        </p>
                      </div>
                    ) : null}
                    {activeTab === "clients" ? (
                      <dl
                        className="admin-account-usage"
                        aria-label={`${account.fullName} ${
                          usagePeriodView?.label ?? "selected period"
                        } AI request usage`}
                      >
                        <div>
                          <dt>
                            Total AI requests ·{" "}
                            {usagePeriodView?.label ?? "Selected period"}
                          </dt>
                          <dd>
                            {account.periodRequestCount.toLocaleString("en-US")}
                          </dd>
                        </div>
                        <div>
                          <dt>Review requests</dt>
                          <dd>
                            {account.periodReviewRequestCount.toLocaleString("en-US")}
                          </dd>
                        </div>
                        <div>
                          <dt>Rewrite requests</dt>
                          <dd>
                            {account.periodRewriteRequestCount.toLocaleString("en-US")}
                          </dd>
                        </div>
                        {usagePeriod !== "lifetime" ? (
                          <div>
                            <dt>Lifetime total</dt>
                            <dd>
                              {(
                                account.reviewRequestCount + account.rewriteRequestCount
                              ).toLocaleString("en-US")}
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                    ) : null}
                  </div>
                  {activeTab === "clients" ? (
                    <div className="admin-account-actions">
                      {account.manualSuspension || account.aiSuspension ? (
                        <button
                          className="button button-primary"
                          type="button"
                          onClick={() => {
                            setNotice(null);
                            setClientToRecover(account);
                          }}
                        >
                          Recover account
                        </button>
                      ) : account.status === "active" ? (
                        <button
                          className="button button-warning"
                          type="button"
                          onClick={() => {
                            setNotice(null);
                            setClientToSuspend(account);
                          }}
                        >
                          Suspend client
                        </button>
                      ) : null}
                      <button
                        className="button button-danger"
                        type="button"
                        onClick={() => {
                          setNotice(null);
                          setClientToRemove(account);
                        }}
                      >
                        Remove account
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {clientToRemove ? (
        <ClientRemovalDialog
          client={clientToRemove}
          onCancel={() => setClientToRemove(null)}
          onRemoved={({ emailDelivery }) => handleRemoved(emailDelivery)}
        />
      ) : null}
      {clientToSuspend ? (
        <ClientSuspensionDialog
          client={clientToSuspend}
          onCancel={() => setClientToSuspend(null)}
          onSuspended={({ emailDelivery }) => handleSuspended(emailDelivery)}
        />
      ) : null}
      {clientToRecover ? (
        <ClientRecoveryDialog
          client={clientToRecover}
          onCancel={() => setClientToRecover(null)}
          onRecovered={handleRecovered}
        />
      ) : null}
    </section>
  );
}
