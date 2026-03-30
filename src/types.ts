export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  dailyRate: number;
  taxRate: number;
  memo?: string;
}

export interface WorkLog {
  id?: string;
  uid: string;
  date: string; // YYYY-MM-DD
  gongsu: number;
  siteName?: string;
  memo?: string;
  createdAt: any;
}

export type OperationType = 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}
