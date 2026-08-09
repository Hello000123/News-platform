"use client";

import { useEffect, useState } from "react";

import {
  AuthRequestError,
  getEmployeeClientOverview,
} from "@/lib/client/auth-api";
import type { ClientOverviewView } from "@/lib/shared/client-overview";

function formattedDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-HK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  }).format(new Date(timestamp * 1_000));
}

export function ClientOverview() {
  const [overview, setOverview] = useState<ClientOverviewView | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void getEmployeeClientOverview()
      .then(({ overview: nextOverview }) => {
        if (!cancelled) setOverview(nextOverview);
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(
            error instanceof AuthRequestError
              ? error.message
              : "The client overview could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshVersion]);

  if (loading && !overview) {
    return (
      <div className="loading-panel" role="status">
        <span className="spinner spinner-dark" aria-hidden="true" />
        <div>
          <strong>Loading client overview</strong>
          <p>Aggregating company types across the complete client base.</p>
        </div>
      </div>
    );
  }

  if (errorMessage && !overview) {
    return (
      <div className="client-overview-error">
        <div className="auth-alert auth-alert-error" role="alert">
          {errorMessage}
        </div>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => {
            setLoading(true);
            setErrorMessage("");
            setRefreshVersion((current) => current + 1);
          }}
        >
          Retry overview
        </button>
      </div>
    );
  }

  if (!overview) return null;
  const distribution = overview.companyTypeDistribution;
  return (
    <div className="client-overview-layout">
      <header className="client-overview-heading">
        <div>
          <div className="section-kicker">Client intelligence</div>
          <h2>Client Overview</h2>
          <p>
            Aggregated across every client account. Additional overview widgets can be added
            alongside this company-type distribution.
          </p>
        </div>
        <span>Updated {formattedDate(overview.generatedAt)}</span>
      </header>

      {distribution.totalClients === 0 ? (
        <div className="employee-empty">
          <strong>No client accounts</strong>
          <p>Company-type distribution will appear after the first client account is created.</p>
        </div>
      ) : (
        <section className="client-overview-widget" aria-labelledby="company-type-widget-title">
          <div className="client-overview-widget-heading">
            <div>
              <span className="section-kicker">Company classification</span>
              <h3 id="company-type-widget-title">Distribution by company type</h3>
              <p>
                All account statuses are included. Clients without a recognized structured
                company type remain in Unknown / Unclassified.
              </p>
            </div>
            <dl className="client-overview-totals">
              <div>
                <dt>All clients</dt>
                <dd>{distribution.totalClients.toLocaleString("en-US")}</dd>
              </div>
              <div>
                <dt>Classified</dt>
                <dd>{distribution.classifiedClients.toLocaleString("en-US")}</dd>
              </div>
              <div>
                <dt>Unclassified</dt>
                <dd>{distribution.unclassifiedClients.toLocaleString("en-US")}</dd>
              </div>
            </dl>
          </div>

          <div className="client-overview-visuals">
            <figure className="company-type-chart">
              <figcaption>Client percentage by structured company type</figcaption>
              <ul>
                {distribution.items.map((item) => (
                  <li
                    className={item.isUnclassified ? "company-type-unclassified" : ""}
                    key={item.companyType.toLocaleLowerCase("en-US")}
                    aria-label={`${item.companyType}: ${item.clientCount} clients, ${item.percentage.toFixed(1)} percent`}
                  >
                    <div className="company-type-chart-label">
                      <strong>{item.companyType}</strong>
                      <span>
                        {item.clientCount.toLocaleString("en-US")} · {item.percentage.toFixed(1)}%
                      </span>
                    </div>
                    <div className="company-type-chart-track" aria-hidden="true">
                      <span style={{ width: `${Math.max(item.percentage, 1)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </figure>

            <div className="client-overview-table-wrap">
              <table className="client-overview-table">
                <caption>Accessible client distribution by company type</caption>
                <thead>
                  <tr>
                    <th scope="col">Company type</th>
                    <th scope="col">Client count</th>
                    <th scope="col">Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {distribution.items.map((item) => (
                    <tr key={item.companyType.toLocaleLowerCase("en-US")}>
                      <th scope="row">{item.companyType}</th>
                      <td>{item.clientCount.toLocaleString("en-US")}</td>
                      <td>{item.percentage.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">All client accounts</th>
                    <td>{distribution.totalClients.toLocaleString("en-US")}</td>
                    <td>100.0%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
