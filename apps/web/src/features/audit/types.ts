export type AuditItem = {
  _id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  changedFields: string[];
  createdAt: string;
  actorId?: { fullName?: string; email?: string } | string;
};
