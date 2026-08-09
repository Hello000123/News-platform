export const UNKNOWN_COMPANY_TYPE_LABEL = "Unknown / Unclassified";

export interface ClientCompanyTypeDistributionItem {
  companyType: string;
  clientCount: number;
  percentage: number;
  isUnclassified: boolean;
}

export interface ClientCompanyTypeDistributionView {
  totalClients: number;
  classifiedClients: number;
  unclassifiedClients: number;
  items: ClientCompanyTypeDistributionItem[];
}

export interface ClientOverviewView {
  generatedAt: number;
  companyTypeDistribution: ClientCompanyTypeDistributionView;
}
