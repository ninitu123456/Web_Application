import { describe, it, expect } from "vitest";
import { notificationRoute } from "./notification-navigation";
describe("notification navigation uses structured allowlisted targets", () => {
  it("routes both matching directions to the recipient own Item suggestions", () => {
    expect(notificationRoute({ kind: "SUGGESTIONS", itemId: 12 }, 7)).toBe(
      "/do-vat/12?tab=matches&notification=7#suggestions-title",
    );
  });
  it("routes approved claims to the FOUND contact action and other states to exact own history page", () => {
    expect(
      notificationRoute({ kind: "CLAIM_CONTACT", itemId: 40, claimId: 9 }, 8),
    ).toContain("/do-vat/40?");
    expect(
      notificationRoute({ kind: "CLAIM_CONTACT", itemId: 40, claimId: 9 }, 8),
    ).toContain("#contact-action");
    expect(
      notificationRoute({ kind: "CLAIM_HISTORY", claimId: 9, page: 3 }, 8),
    ).toBe("/yeu-cau-cua-toi?page=3&notification=8#claim-9");
  });
  it("does not create unsafe routes from invalid IDs", () => {
    expect(() =>
      notificationRoute({ kind: "SUGGESTIONS", itemId: NaN }, 7),
    ).toThrow();
    expect(() =>
      notificationRoute({ kind: "CLAIM_HISTORY", claimId: 9, page: 0 }, 8),
    ).toThrow();
  });
});
