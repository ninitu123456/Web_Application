import type { ClaimStatus, ItemStatus, User } from "./types";
export interface Notification {
  id: number;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}
export type ReportTarget = "ITEM" | "USER" | "CLAIM";
export type ReportStatus = "PENDING" | "REVIEWING" | "RESOLVED" | "DISMISSED";
export interface Report {
  id: number;
  reporterId: number;
  targetType: ReportTarget;
  targetId: number;
  reason: string;
  description: string | null;
  status: ReportStatus;
  reviewedBy: number | null;
  reviewedAt: string | null;
  createdAt: string;
}
export interface AdminUser extends User {
  accountStatus: "ACTIVE" | "SUSPENDED";
  createdAt: string;
  updatedAt: string;
}
export interface AdminLookup {
  id: number;
  name: string;
  isActive: boolean;
}
export interface AdminClaim {
  id: number;
  itemId: number;
  claimantId: number;
  status: ClaimStatus;
  submittedAt: string;
  reviewedAt: string | null;
  completedAt: string | null;
  item: {
    id: number;
    userId: number;
    title: string;
    type: "LOST" | "FOUND";
    status: ItemStatus;
  };
}
export interface Dashboard {
  users: { total: number; active: number; suspended: number };
  items: {
    total: number;
    lost: number;
    found: number;
    returned: number;
    byStatus: Record<ItemStatus, number>;
  };
  claims: { total: number; byStatus: Record<ClaimStatus, number> };
  matches: { total: number };
  reports: { total: number; byStatus: Record<ReportStatus, number> };
  categories: { id: number; name: string; count: number }[];
  recentActivity: { date: string; count: number }[];
}
export interface ActivityLog {
  id: number;
  actorId: number | null;
  action: string;
  entityType: string;
  entityId: number | null;
  createdAt: string;
  details: Record<string, string | number | boolean>;
}
