import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { VisualSuggestions } from "./VisualSuggestions";
import type { Suggestion } from "../lib/types";
const resource = vi.hoisted(() => vi.fn());
vi.mock("../lib/hooks", () => ({ useResource: resource }));
vi.mock("../lib/api", () => ({
  invalidate: vi.fn(),
  errorText: () => "Không thể tải nội dung.",
}));
const entry: Suggestion = {
  item: {
    id: 11,
    userId: 2,
    categoryId: 1,
    locationId: 1,
    title: "FOUND 11",
    description: "Near library",
    type: "FOUND",
    status: "OPEN",
    eventDate: "2026-11-01",
    color: null,
    images: [],
    createdAt: "2026-11-01",
    updatedAt: "2026-11-01",
  },
  reasons: ["IMAGE", "INFORMATION"],
  similarityBand: "VERY_HIGH",
  informationScore: 80,
  informationReasons: ["Cùng danh mục"],
};
const render = (props: { enabled?: boolean; previewFixture?: boolean } = {}) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <VisualSuggestions itemId={5} {...props} />
    </MemoryRouter>,
  );
const ready = () =>
  resource.mockReturnValue({
    loading: false,
    data: {
      success: true,
      visualState: "ready",
      data: { visual: [entry], information: [], totalUnique: 1 },
    },
  });
describe("unified suggestions", () => {
  beforeEach(() => resource.mockReset());
  it("uses one section and shared ItemCard with both reasons, no raw cosine/probability", () => {
    ready();
    const html = render();
    expect(html).toContain("Gợi ý cho bạn");
    expect(html).toContain("Giống về hình ảnh");
    expect(html).toContain("Trùng thông tin");
    expect(html).toContain("Rất giống");
    expect(html.match(/class="item-card"/g)).toHaveLength(1);
    expect(html).toContain("Gợi ý không phải là xác nhận quyền sở hữu.");
    expect(html).not.toMatch(/cosine|0.867|%/i);
    expect(html).toContain("/do-vat/11");
  });
  it("labels synthetic previews explicitly and keeps normal renders free of fixture labels", () => {
    ready();
    expect(render()).not.toContain("Dữ liệu minh họa");
    expect(render({ previewFixture: true })).toContain(
      "không phải kết quả CLIP thực tế",
    );
  });
  it("renders card-sized loading skeletons", () => {
    resource.mockReturnValue({ loading: true });
    const html = render();
    expect(html).toContain('role="status"');
    expect(html).toContain("suggestion-skeleton");
  });
  it("keeps processing and failure states distinct from empty", () => {
    for (const state of ["processing", "error"]) {
      resource.mockReturnValue({
        loading: false,
        data: {
          visualState: state,
          data: { visual: [], information: [], totalUnique: 0 },
        },
      });
      const html = render();
      expect(html).toContain(
        state === "processing"
          ? "Ảnh đang được phân tích"
          : "Chưa thể phân tích ảnh",
      );
      expect(html).toContain(
        state === "processing" ? 'role="status"' : 'role="alert"',
      );
    }
  });
  it("renders an error and Retry", () => {
    resource.mockReturnValue({ loading: false, error: new Error("network") });
    expect(render()).toContain('role="alert"');
    expect(render()).toContain("Thử tải lại");
  });
  it("keeps information suggestions when AI is disabled and sends the opt-out", () => {
    ready();
    expect(render({ enabled: false })).not.toContain(
      'id="visual-suggestions-title"',
    );
    expect(resource).toHaveBeenCalledWith(
      "/items/5/suggestions",
      { page: 1, limit: 6, visual: "false" },
      0,
    );
  });
  it("renders empty without inventing confidence", () => {
    resource.mockReturnValue({
      loading: false,
      data: {
        visualState: "ready",
        data: { visual: [], information: [], totalUnique: 0 },
      },
    });
    expect(render()).toContain("Chưa có gợi ý hình ảnh phù hợp");
    expect(render()).toContain("Chưa có gợi ý đồ vật phù hợp");
  });
});
