export type Asset = {
  _id: string;
  name: string;
  description?: string;
  system: string;
  ownerTeam: string;
  classification: string;
  dataCategories?: string[];
  dataSubjects?: string[];
  status: string;
  updatedAt?: string;
};
