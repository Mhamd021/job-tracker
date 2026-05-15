export type Status = 'TO_APPLY' | 'APPLIED' | 'INTERVIEW' | 'OFFER' | 'REJECTED';

export interface Application {
  id: string;
  companyName: string;
  companyUrl?: string;
  jobRole: string;
  status: Status;
  notes?: string;
  appliedAt: string;
  updatedAt: string;
}

export interface Stats {
  total: number;
  byStatus: { status: Status; count: number }[];
}