import { describe, expect, it } from "vitest";
import { canShowVisualSuggestions } from "./visual-suggestions";

describe("visual suggestion visibility", () => {
  it("is disabled by default and only renders for the owner of an active LOST or FOUND item", () => {
    const base = {
      enabled: true,
      owner: true,
      type: "LOST",
      status: "OPEN" as const,
    };
    expect(canShowVisualSuggestions({ ...base, enabled: false })).toBe(false);
    expect(canShowVisualSuggestions({ ...base, owner: false })).toBe(false);
    expect(canShowVisualSuggestions({ ...base, type: "FOUND" })).toBe(true);
    for (const status of ["OPEN", "CLAIM_PENDING", "CLAIMED"] as const)
      expect(canShowVisualSuggestions({ ...base, status })).toBe(true);
    for (const status of ["RETURNED", "CLOSED"] as const)
      expect(canShowVisualSuggestions({ ...base, status })).toBe(false);
  });
});
