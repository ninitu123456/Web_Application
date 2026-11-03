import { api, ApiError } from "./api";
import type { Claim, Envelope } from "./types";
import type { AdminClaim } from "./extended-types";

type ClaimPageLoader = (
  itemId: number,
  page: number,
  signal?: AbortSignal,
) => Promise<Envelope<Claim[]>>;
// Search every authorized page, not just the first. An interrupted/failed scan is never "not found".
export async function findClaimEvidence(
  itemId: number,
  claimId: number,
  signal?: AbortSignal,
  load: ClaimPageLoader = (item, page, abort) =>
    api<Claim[]>(`/items/${item}/claims`, {
      query: { page, limit: 100 },
      signal: abort,
    }),
): Promise<Claim> {
  for (let page = 1; ; page++) {
    const result = await load(itemId, page, signal);
    const found = result.data.find((claim) => claim.id === claimId);
    if (found) return found;
    if (!result.pagination)
      throw new ApiError(
        503,
        "Chưa tải đủ thông tin để tìm bằng chứng. Vui lòng thử lại sau.",
      );
    if (page >= result.pagination.totalPages)
      throw new ApiError(
        404,
        "Không tìm thấy yêu cầu nhận đồ. Dữ liệu có thể vừa thay đổi; hãy tải lại danh sách.",
      );
    if (page * result.pagination.limit > 100000)
      throw new ApiError(
        503,
        "Chưa tải đủ thông tin để tìm bằng chứng. Vui lòng thử lại sau.",
      );
  }
}
export async function adminHasClaim(
  itemId: number,
  adminId: number,
  signal?: AbortSignal,
): Promise<boolean> {
  // The server filters to this exact item AND claimant. Total covers all statuses/pages, including rejected history.
  const result = await api<AdminClaim[]>("/admin/claims", {
    query: { itemId, claimantId: adminId, page: 1, limit: 1 },
    signal,
  });
  if (!result.pagination || !Number.isSafeInteger(result.pagination.total))
    throw new ApiError(
      503,
      "Chưa kiểm tra được bạn có liên quan đến bài đăng này hay không. Vui lòng thử lại.",
    );
  return result.pagination.total > 0;
}
