export type Role = "USER" | "ADMIN";
export interface User {
  id: number;
  fullName: string;
  email: string;
  role: Role;
}
export interface Lookup {
  id: number;
  name: string;
}
export type ItemType = "LOST" | "FOUND";
export type ItemStatus =
  "OPEN" | "CLAIM_PENDING" | "CLAIMED" | "RETURNED" | "CLOSED";
export interface Item {
  id: number;
  userId: number;
  title: string;
  description: string;
  type: ItemType;
  categoryId: number;
  locationId: number;
  category?: Lookup;
  location?: Lookup;
  color: string | null;
  eventDate: string;
  status: ItemStatus;
  images: { id: number; url: string }[];
  createdAt: string;
  updatedAt: string;
}
export type ClaimStatus = "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED";
export interface Claim {
  id: number;
  claimantId: number;
  itemId: number;
  proofDescription: string;
  status: ClaimStatus;
  submittedAt: string;
  reviewedAt: string | null;
  completedAt: string | null;
  claimant?: { id: number; fullName: string };
  item?: {
    id: number;
    title: string;
    type: ItemType;
    status: ItemStatus;
    eventDate: string;
    category: string | null;
    location: string | null;
  };
}
export interface Match {
  matchId: number;
  itemId: number;
  score: number;
  reasons: string[];
}
export interface VisualSuggestion {
  itemId: number;
  title: string;
  description: string;
  color: string | null;
  eventDate: string;
  category: string;
  location: string;
  thumbnailUrl: string | null;
  cosineScore: number;
}
export interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
export interface Envelope<T> {
  success: boolean;
  message?: string;
  data: T;
  pagination?: PaginationData;
}
export type Query = Record<string, string | number | undefined>;
