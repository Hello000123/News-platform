import type { D1Database } from "@cloudflare/workers-types";

import { nowInSeconds } from "@/lib/server/auth/crypto";
import {
  UNKNOWN_COMPANY_TYPE_LABEL,
  type ClientCompanyTypeDistributionItem,
  type ClientOverviewView,
} from "@/lib/shared/client-overview";

const UNKNOWN_COMPANY_TYPE_KEY = "__unknown__";

interface CompanyTypeDistributionRow {
  type_key: string;
  type_label: string;
  client_count: number;
}

function roundedPercentage(clientCount: number, totalClients: number) {
  if (totalClients <= 0) return 0;
  return Number(((clientCount / totalClients) * 100).toFixed(1));
}

export async function getClientOverview(
  database: D1Database,
): Promise<ClientOverviewView> {
  const result = await database
    .prepare(
      `WITH client_types AS (
         SELECT
           client.id,
           CASE
             WHEN summary.company_type IS NULL
               OR length(trim(summary.company_type)) = 0
               OR lower(trim(summary.company_type)) IN (
                 'unknown',
                 'unclassified',
                 'unknown / unclassified',
                 'unknown/unclassified',
                 'not established',
                 'n/a',
                 'none',
                 'insufficient information'
               )
             THEN '${UNKNOWN_COMPANY_TYPE_KEY}'
             ELSE lower(trim(summary.company_type))
           END AS type_key,
           CASE
             WHEN summary.company_type IS NULL
               OR length(trim(summary.company_type)) = 0
               OR lower(trim(summary.company_type)) IN (
                 'unknown',
                 'unclassified',
                 'unknown / unclassified',
                 'unknown/unclassified',
                 'not established',
                 'n/a',
                 'none',
                 'insufficient information'
               )
             THEN '${UNKNOWN_COMPANY_TYPE_LABEL}'
             ELSE trim(summary.company_type)
           END AS type_label
         FROM users AS client
         LEFT JOIN client_company_summaries AS summary
           ON summary.client_user_id = client.id
         WHERE client.role = 'client'
       )
       SELECT
         type_key,
         CASE
           WHEN type_key = '${UNKNOWN_COMPANY_TYPE_KEY}'
             THEN '${UNKNOWN_COMPANY_TYPE_LABEL}'
           ELSE MIN(type_label)
         END AS type_label,
         COUNT(*) AS client_count
       FROM client_types
       GROUP BY type_key
       ORDER BY client_count DESC, type_label COLLATE NOCASE`,
    )
    .all<CompanyTypeDistributionRow>();
  const totalClients = result.results.reduce(
    (total, row) => total + Number(row.client_count),
    0,
  );
  const items: ClientCompanyTypeDistributionItem[] = result.results.map((row) => {
    const clientCount = Number(row.client_count);
    const isUnclassified = row.type_key === UNKNOWN_COMPANY_TYPE_KEY;
    return {
      companyType: isUnclassified
        ? UNKNOWN_COMPANY_TYPE_LABEL
        : row.type_label.trim().slice(0, 120),
      clientCount,
      percentage: roundedPercentage(clientCount, totalClients),
      isUnclassified,
    };
  });
  const unclassifiedClients = items
    .filter((item) => item.isUnclassified)
    .reduce((total, item) => total + item.clientCount, 0);
  return {
    generatedAt: nowInSeconds(),
    companyTypeDistribution: {
      totalClients,
      classifiedClients: totalClients - unclassifiedClients,
      unclassifiedClients,
      items,
    },
  };
}
