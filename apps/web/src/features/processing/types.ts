export type Activity = {
  _id: string;
  name: string;
  purpose: string;
  legalBasis: string;
  dataCategories: string[];
  dataSubjects: string[];
  systems: string[];
  assetIds: string[];
  retentionPeriodDays: number | null;
  status: string;
  updatedAt?: string;
};
