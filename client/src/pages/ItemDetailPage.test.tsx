import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Item, User, Suggestion } from "../lib/types";
import { ItemDetailPage } from "./ItemDetailPage";

const mocks = vi.hoisted(() => ({
  resource: vi.fn(),
  user: null as User | null,
}));
vi.mock("../lib/hooks", () => ({ useResource: mocks.resource }));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("../lib/api", () => ({
  api: vi.fn(),
  itemDetail: vi.fn(),
  invalidate: vi.fn(),
  errorText: () => "Không thể tải nội dung.",
}));

const item: Item = {
  id: 5,
  userId: 7,
  title: "LOST local backpack",
  description: "Synthetic item",
  type: "LOST",
  status: "OPEN",
  categoryId: 1,
  locationId: 1,
  color: "Blue",
  eventDate: "2026-11-07",
  images: [],
  createdAt: "2026-11-07",
  updatedAt: "2026-11-07",
};
const suggestion: Suggestion = {
  item: {
    ...item,
    id: 6,
    userId: 9,
    type: "FOUND",
    title: "FOUND local backpack",
  },
  reasons: ["IMAGE"],
  similarityBand: "VERY_HIGH",
  /*
  itemId: 6,
  title: "FOUND local backpack",
  description: "Synthetic suggestion",
  category: "Bags",
  location: "Library",
  color: null,
  eventDate: "2026-11-07",
  thumbnailUrl: null,
  cosineScore: 0.9739, */
};
let current: Item;
let panel: Record<string, unknown>;
function render() {
  return renderToStaticMarkup(
    <MemoryRouter
      initialEntries={[
        {
          pathname: "/do-vat/5",
          state: { exploreFrom: "/kham-pha?type=LOST" },
        },
      ]}
    >
      <Routes>
        <Route path="/do-vat/:id" element={<ItemDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.stubEnv("VITE_AI_VISUAL_SUGGESTIONS_ENABLED", "true");
  mocks.user = {
    id: 7,
    fullName: "Synthetic owner",
    email: "owner@example.test",
    role: "USER",
  };
  current = { ...item };
  panel = {
    loading: false,
    data: {
      success: true,
      visualState: "ready",
      data: { visual: [suggestion], information: [], totalUnique: 1 },
    },
  };
  mocks.resource.mockImplementation((path: string) =>
    path === "/items/5"
      ? { loading: false, data: { success: true, data: current } }
      : path.endsWith("/suggestions")
        ? panel
        : { loading: false, data: { success: true, data: [] } },
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  mocks.resource.mockReset();
});

describe("redesigned item detail with AI integration", () => {
  it("keeps owner AI suggestions, official matches tab, detail link and explore navigation together", () => {
    const html = render();
    expect(html).toContain("Giống về hình ảnh");
    expect(html).toContain("FOUND local backpack");
    expect(html).toContain("Rất giống");
    expect(html).not.toContain("0.974");
    expect(html).toContain('href="/do-vat/6"');
    expect(html).toContain('href="/kham-pha?type=LOST"');
    expect(html).toContain("Gợi ý cho bạn");
    expect(mocks.resource).toHaveBeenCalledWith(
      "/items/5/suggestions",
      { page: 1, limit: 6, visual: "true" },
      0,
    );
  });
  it("keeps the feature flag and owner/privacy gate after the redesign", () => {
    vi.stubEnv("VITE_AI_VISUAL_SUGGESTIONS_ENABLED", "false");
    expect(render()).not.toContain("visual-suggestions-title");
    vi.stubEnv("VITE_AI_VISUAL_SUGGESTIONS_ENABLED", "true");
    mocks.user = { ...mocks.user!, id: 9 };
    expect(render()).not.toContain("visual-suggestions-title");
  });
  it("keeps FOUND recovery, Claim and chat actions without showing LOST-only AI", () => {
    current = { ...item, type: "FOUND" };
    mocks.user = { ...mocks.user!, id: 9 };
    const html = render();
    expect(html).toContain("Nhận lại đồ như thế nào?");
    expect(html).toContain("Đây có thể là đồ của tôi");
    expect(html).toContain("Nhắn tin");
    expect(html).not.toContain("visual-suggestions-title");
  });
  it("hides AI suggestions for an owner when moderation hides the LOST item", () => {
    current = { ...item, visibility: "HIDDEN" };
    expect(render()).not.toContain("visual-suggestions-title");
    expect(mocks.resource).not.toHaveBeenCalledWith("/items/5/suggestions");
  });
  it.each(["loading", "empty", "error"] as const)(
    "keeps the AI %s state inside the redesigned LOST page",
    (state) => {
      panel =
        state === "loading"
          ? { loading: true }
          : state === "error"
            ? { loading: false, error: new Error("network") }
            : {
                loading: false,
                data: {
                  success: true,
                  visualState: "ready",
                  data: { visual: [], information: [], totalUnique: 0 },
                },
              };
      const html = render();
      expect(html).toContain('id="suggestions-title"');
      expect(html).toContain(
        state === "loading"
          ? 'role="status"'
          : state === "error"
            ? "Thử tải lại"
            : "Chưa có gợi ý hình ảnh phù hợp",
      );
    },
  );
});
