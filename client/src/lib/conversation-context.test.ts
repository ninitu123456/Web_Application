import { describe, expect, it } from "vitest";
import {
  handoverMessage,
  progressSteps,
  type ConversationThread,
} from "./conversation-context";

const item = {
  id: 1,
  userId: 2,
  title: "Ví",
  type: "FOUND",
  status: "CLAIMED",
  eventDate: "2026-11-20",
  category: "Ví",
  location: "Thư viện",
  imageUrl: null,
} as const;
const handover = {
  claimId: 9,
  claimStatus: "APPROVED",
  appointment: {
    at: "2026-11-27T09:00:00Z",
    place: "Sảnh A",
    status: "PROPOSED",
    proposedBy: 2,
  },
  ownerConfirmedAt: null,
  claimantConfirmedAt: null,
  dispute: null,
  ownerId: 2,
  claimantId: 1,
} as const;
describe("progressSteps", () => {
  it("marks the first unfinished claim step as current", () => {
    const thread = {
      item,
      role: "CLAIMANT",
      claim: { id: 9, status: "APPROVED" },
      handover,
    } as ConversationThread;
    expect(progressSteps(thread).map((step) => step.state)).toEqual([
      "done",
      "done",
      "current",
      "todo",
    ]);
    const done = {
      ...thread,
      claim: { id: 9, status: "COMPLETED" },
    } as ConversationThread;
    expect(progressSteps(done).every((step) => step.state === "done")).toBe(
      true,
    );
  });
  it("tracks found-it chats by the LOST item status", () => {
    const open = {
      item: { ...item, type: "LOST", status: "OPEN" },
      role: "FINDER",
      claim: null,
      handover: null,
    } as ConversationThread;
    expect(progressSteps(open)[1].state).toBe("current");
    const returned = {
      ...open,
      item: { ...open.item, status: "RETURNED" },
    } as ConversationThread;
    expect(progressSteps(returned).every((step) => step.state === "done")).toBe(
      true,
    );
  });
  it("writes chat notes for appointment actions", () => {
    expect(handoverMessage("proposed", handover as never, "Ví")).toContain(
      "Sảnh A",
    );
    expect(handoverMessage("disputed", handover as never, "Ví")).toBe("");
  });
});
