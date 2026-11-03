import { describe, expect, it } from "vitest";
import { characters, utf8Bytes, validDate, validEmail } from "./validation";
describe("validation parity with backend", () => {
  it("counts Unicode code points separately from UTF-8 password bytes", () => {
    expect(characters("😀".repeat(150))).toBe(150);
    expect(utf8Bytes("ắ".repeat(24))).toBe(72);
    expect(utf8Bytes("😀".repeat(19))).toBe(76);
  });
  it("accepts the backend email syntax without restricting the university domain", () => {
    expect(validEmail("  USER@example.test ")).toBe(true);
    expect(validEmail("tên@example.test")).toBe(true);
    for (const value of [
      "user@uit",
      "a b@example.test",
      "a".repeat(250) + "@x.test",
    ])
      expect(validEmail(value)).toBe(false);
  });
  it("rejects calendar rollovers and years outside the backend range", () => {
    expect(validDate("2024-02-29")).toBe(true);
    for (const value of ["2026-02-29", "2026-04-31", "0999-01-01", "2026-1-01"])
      expect(validDate(value)).toBe(false);
  });
});
