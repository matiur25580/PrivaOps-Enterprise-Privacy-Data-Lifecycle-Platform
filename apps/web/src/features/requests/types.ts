export type RequestItem = {
  _id: string;
  requestType: string;
  description: string;
  status: string;
  createdAt: string;
  dueAt?: string | null;
  identityVerificationStatus?: string;
  resolutionSummary?: string;
  rejectionReason?: string;
  assignedTo?: string | null;
};

export type RequestEvent = {
  _id: string;
  action: string;
  changedFields: string[];
  createdAt: string;
  actorId?: string;
};

export type RequestUpdate = {
  status: string;
  identityVerificationStatus: string;
  resolutionSummary: string;
  rejectionReason: string;
  assignedTo: string;
  dueAt: string;
};
