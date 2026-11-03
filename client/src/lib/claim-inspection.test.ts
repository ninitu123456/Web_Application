import { describe, expect, it, vi, afterEach } from "vitest";
import { findClaimEvidence, adminHasClaim } from "./claim-inspection";
import type { Claim, Envelope } from "./types";
afterEach(() => vi.unstubAllGlobals());
const claim = (id: number) =>
  ({ id, proofDescription: `private-${id}` }) as Claim;
describe("authorized paginated Claim inspection", () => {
  it("finds a claim on a later page without using a missing first-page entry as absence", async () => {
    const load = vi.fn(
      async (_item: number, page: number): Promise<Envelope<Claim[]>> => ({
        success: true,
        data: page === 1 ? [claim(3)] : [claim(42)],
        pagination: { page, limit: 1, total: 2, totalPages: 2 },
      }),
    );
    expect(
      (await findClaimEvidence(7, 42, undefined, load)).proofDescription,
    ).toBe("private-42");
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("does not translate a failed or incomplete scan into not found", async () => {
    const load = vi.fn(
      async (_item: number, page: number): Promise<Envelope<Claim[]>> => {
        if (page === 2) throw new Error("network unavailable");
        return {
          success: true,
          data: [claim(1)],
          pagination: { page, limit: 1, total: 2, totalPages: 2 },
        };
      },
    );
    await expect(findClaimEvidence(7, 42, undefined, load)).rejects.toThrow(
      "network unavailable",
    );
    await expect(
      findClaimEvidence(7, 42, undefined, async () => ({
        success: true,
        data: [],
      })),
    ).rejects.toThrow("Chưa tải đủ thông tin để tìm bằng chứng");
  });
  it("reports absence only after checking all available pages", async () => {
    const load = vi.fn(
      async (_item: number, page: number): Promise<Envelope<Claim[]>> => ({
        success: true,
        data: [],
        pagination: { page, limit: 1, total: 2, totalPages: 2 },
      }),
    );
    await expect(
      findClaimEvidence(7, 42, undefined, load),
    ).rejects.toMatchObject({ status: 404 });
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("uses total for the exact item/claimant filter across all historical statuses", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: [],
          pagination: { page: 1, limit: 1, total: 1, totalPages: 1 },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    expect(await adminHasClaim(17, 29)).toBe(true);
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.searchParams.get("itemId")).toBe("17");
    expect(url.searchParams.get("claimantId")).toBe("29");
    expect(url.searchParams.has("status")).toBe(false);
  });
  it("keeps unknown recusal distinct from an unrelated administrator", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ success: false, message: "Unavailable" }),
            { status: 503 },
          ),
        ),
    );
    await expect(adminHasClaim(17, 29)).rejects.toMatchObject({ status: 503 });
  });
});
