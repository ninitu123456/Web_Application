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
  visibility?: "PUBLIC" | "HIDDEN";
  images: { id: number; url: string }[];
  verificationQuestions?: VerificationQuestion[];
  owner?: { id: number; fullName: string; returnedCount: number };
  savedAt?: string;
  createdAt: string;
  updatedAt: string;
}
export interface VerificationQuestion {
  id: number;
  position: number;
  question: string;
}
export interface ClaimAnswer {
  questionId: number;
  position: number;
  question: string;
  answer: string;
}
export interface Handover {
  claimId: number;
  claimStatus: ClaimStatus;
  appointment: {
    at: string;
    place: string;
    status: "PROPOSED" | "ACCEPTED";
    proposedBy: number | null;
  } | null;
  ownerConfirmedAt: string | null;
  claimantConfirmedAt: string | null;
  dispute: { reason: string; by: number | null; at: string; resolvedAt: string | null } | null;
  ownerId: number;
  claimantId: number;
}
export interface UserStats {
  posts: { total: number; lost: number; found: number; active: number; returned: number };
  claims: { sent: number; pending: number; approved: number; completed: number };
  incomingPendingClaims: number;
  totalViews: number;
  savedItems: number;
}
export interface ItemStats { views: number; saves: number; claims: number; pendingClaims: number }
export type ContactTopic = "GENERAL" | "ACCOUNT" | "ITEM" | "REPORT" | "OTHER";
export interface ContactMessage {
  id: number;
  userId: number | null;
  fullName: string;
  email: string;
  topic: ContactTopic;
  body: string;
  itemUrl: string | null;
  status: "NEW" | "HANDLED";
  createdAt: string;
  handledAt: string | null;
  handledBy: number | null;
}
export interface HandoverDispute {
  claimId: number;
  claimStatus: ClaimStatus;
  reason: string;
  disputedAt: string;
  resolvedAt: string | null;
  disputedBy: { id: number; fullName: string | null } | null;
  item: { id: number; title: string };
  owner: { id: number; fullName: string };
  claimant: { id: number; fullName: string };
  appointment: { at: string; place: string; status: string } | null;
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
  answers?: ClaimAnswer[];
  item?: {
    id: number;
    title: string;
    type: ItemType;
    status: ItemStatus;
    eventDate: string;
    category: string | null;
    location: string | null;
    visibility?: "PUBLIC" | "HIDDEN";
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
  visualState?: "processing" | "error" | "ready" | "disabled";
  success: boolean;
  message?: string;
  data: T;
  pagination?: PaginationData;
}
export type Query = Record<string, string | number | undefined>;

export interface Suggestion {
  item: Item;
  reasons: ("IMAGE" | "INFORMATION")[];
  similarityBand?: "VERY_HIGH" | "HIGH" | "MEDIUM";
  informationScore?: number;
  informationReasons?: string[];
}
export interface SuggestionsData {
  visual: Suggestion[];
  information: Suggestion[];
  totalUnique: number;
}
