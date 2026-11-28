// Synthetic UI fixtures. Only Playwright intercepts these; never shipped to users.
export const date = "2026-11-28T08:00:00.000Z";
export const user = {
  id: 1,
  fullName: "Sinh viên kiểm thử",
  email: "demo@example.test",
  role: "ADMIN",
  accountStatus: "ACTIVE",
  createdAt: date,
  updatedAt: date,
};
const photo = (color, label) =>
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="${color}"/><rect x="250" y="170" width="300" height="240" rx="55" fill="white"/><circle cx="340" cy="270" r="22" fill="#1d6bff"/><circle cx="460" cy="270" r="22" fill="#1d6bff"/><text x="400" y="500" text-anchor="middle" fill="#0f1b3d" font-size="32">${label}</text></svg>`,
  );
export const items = [1, 2, 3, 4].map((id) => ({
  id,
  userId: id === 1 || id === 3 ? 1 : 2,
  title:
    id === 1
      ? "Tai nghe không dây bị mất tại thư viện"
      : `Tai nghe và hộp sạc màu trắng – tin thử ${id}`,
  description: "Dữ liệu giả lập để kiểm tra giao diện. ".repeat(5),
  type: id === 1 ? "LOST" : "FOUND",
  categoryId: 1,
  locationId: 1,
  category: { id: 1, name: "Thiết bị điện tử" },
  location: { id: 1, name: "Thư viện tầng 2, khu tự học sinh viên" },
  color: "Trắng",
  eventDate: "2026-11-27",
  status: "OPEN",
  visibility: "PUBLIC",
  images: [1, 2, 3, 4, 5].map((n) => ({
    id: n,
    url: photo(n % 2 ? "#dce8ff" : "#d1fadf", `Ảnh thử ${n}`),
  })),
  verificationQuestions: [
    { id: 1, position: 1, question: "Đặc điểm riêng của hộp sạc?" },
  ],
  owner: { id: 2, fullName: "Thành viên thử nghiệm", returnedCount: 3 },
  ownerName: "Thành viên thử nghiệm",
  stats: { views: 12, reports: 0 },
  createdAt: date,
  updatedAt: date,
}));
export const claims = ["PENDING", "APPROVED"].map((status, i) => ({
  id: i + 1,
  claimantId: 2,
  itemId: 3,
  status,
  proofDescription: "Bằng chứng giả lập để kiểm tra xuống dòng. ".repeat(8),
  submittedAt: date,
  reviewedAt: null,
  completedAt: null,
  claimant: { id: 2, fullName: "Người nhận thử nghiệm" },
  answers: [
    {
      questionId: 1,
      question: "Đặc điểm riêng?",
      answer: "Câu trả lời giả lập",
      position: 1,
    },
  ],
  item: { ...items[2], category: "Điện tử", location: "Thư viện" },
}));
export const handover = {
  claimId: 2,
  claimStatus: "APPROVED",
  ownerId: 1,
  claimantId: 2,
  appointment: {
    at: "2026-12-01T08:00:00.000Z",
    place: "Sảnh thư viện – địa điểm hẹn thử nghiệm",
    proposedBy: 2,
    status: "PROPOSED",
  },
  ownerConfirmedAt: null,
  claimantConfirmedAt: null,
  dispute: null,
};
export const dashboard = {
  users: { total: 128, active: 126, suspended: 2 },
  items: {
    total: 260,
    lost: 160,
    found: 100,
    returned: 46,
    byStatus: {
      OPEN: 200,
      CLAIM_PENDING: 10,
      CLAIMED: 4,
      RETURNED: 46,
      CLOSED: 0,
    },
  },
  claims: {
    total: 64,
    byStatus: { PENDING: 10, APPROVED: 8, COMPLETED: 46, REJECTED: 0 },
  },
  matches: { total: 80 },
  reports: {
    total: 3,
    byStatus: { PENDING: 2, REVIEWING: 1, RESOLVED: 0, DISMISSED: 0 },
  },
  categories: [
    { id: 1, name: "Điện tử", count: 180 },
    { id: 2, name: "Đồ cá nhân", count: 80 },
  ],
  recentActivity: [{ date: "2026-11-28", count: 12 }],
  monthlyItems: Array.from({ length: 12 }, (_, i) => ({
    month: `2026-${String(i + 1).padStart(2, "0")}`,
    lost: 8 + i * 3,
    found: 5 + i * 2,
  })),
  growth: {
    newUsers30: 12,
    newItems30: 45,
    newItemsPrevious30: 32,
    returned30: 16,
  },
  queue: { reports: 2, disputes: 1, contacts: 3, overdueReports: 0 },
  recentLogs: [
    {
      id: 1,
      action: "ITEM_CREATED",
      entityType: "ITEM",
      entityId: 1,
      actorName: "Tài khoản thử nghiệm",
      createdAt: date,
    },
  ],
};
export async function installFixtures(
  context,
  { mode = "ready", authenticated = true } = {},
) {
  await context.addInitScript(
    ({ authenticated }) => {
      if (authenticated)
        sessionStorage.setItem(
          "findit.session",
          "fixture." + btoa(JSON.stringify({ exp: 4102444800 })) + ".fixture",
        );
    },
    { authenticated },
  );
  const requests = [];
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, "");
    requests.push({
      path,
      method: request.method(),
      query: url.search,
      body: request.postData(),
    });
    let data = [],
      extra = {};
    const list = (rows) => {
      data = rows;
      extra.pagination = {
        page: 1,
        limit: 12,
        total: rows.length,
        totalPages: 1,
      };
    };
    if (path === "/users/me") data = user;
    else if (path.endsWith("unread-count")) data = { unreadCount: 2 };
    else if (
      path === "/categories" ||
      path === "/locations" ||
      path.startsWith("/admin/categories") ||
      path.startsWith("/admin/locations")
    )
      list([
        {
          id: 1,
          name: path.includes("categor") ? "Thiết bị điện tử" : "Thư viện",
          isActive: true,
        },
      ]);
    else if (path === "/users/me/stats")
      data = {
        posts: { total: 4, lost: 1, found: 3, active: 4, returned: 0 },
        claims: { sent: 2, pending: 1, approved: 1, completed: 0 },
        incomingPendingClaims: 1,
        totalViews: 12,
        savedItems: 2,
      };
    else if (path === "/admin/dashboard") data = dashboard;
    else if (path === "/admin/queue") data = dashboard.queue;
    else if (path === "/admin/users")
      list([
        user,
        { ...user, id: 2, fullName: "Người dùng thử nghiệm", role: "USER" },
      ]);
    else if (/^\/admin\/users\/\d+$/.test(path))
      data = {
        ...user,
        id: 2,
        role: "USER",
        stats: { items: 4, claims: 2, reports: 0 },
      };
    else if (path === "/admin/items") list(items);
    else if (/^\/admin\/items\/\d+$/.test(path))
      data = items[Number(path.split("/").at(-1)) - 1];
    else if (path === "/admin/claims")
      list(claims.map((c) => ({ ...c, item: items[2] })));
    else if (path === "/admin/reports/1")
      data = {
        id: 1,
        reporterId: 1,
        targetType: "ITEM",
        targetId: 2,
        reason: "Báo cáo thử nghiệm",
        description: "Nội dung dài dùng để kiểm tra giao diện. ".repeat(10),
        status: "PENDING",
        createdAt: date,
        reviewedAt: null,
        reviewedBy: null,
      };
    else if (path === "/admin/activity-logs")
      list([
        {
          id: 1,
          actorId: 1,
          action: "ITEM_CREATED",
          entityType: "ITEM",
          entityId: 2,
          createdAt: date,
          details: { note: "Dữ liệu thử nghiệm" },
        },
      ]);
    else if (path === "/conversations")
      list([
        {
          id: "1",
          peer: { id: "2", fullName: "Thành viên thử nghiệm" },
          lastMessage: "Mình có thể hẹn tại thư viện để trao lại đồ nhé.",
          lastMessageAt: date,
          unreadCount: 2,
        },
      ]);
    else if (path === "/conversations/1/context")
      data = {
        peer: { id: "2", fullName: "Thành viên thử nghiệm" },
        threads: [
          {
            item: {
              ...items[2],
              imageUrl: items[2].images[0].url,
              category: "Điện tử",
              location: "Thư viện",
            },
            role: "OWNER",
            claim: claims[1],
            handover,
          },
        ],
      };
    else if (path === "/conversations/1/messages") {
      if (request.method() === "POST")
        data = {
          id: "99",
          senderId: "1",
          createdAt: date,
          ...request.postDataJSON(),
        };
      else
        list([
          {
            id: "1",
            senderId: "2",
            content:
              "Xin chào! ".repeat(12) + "ChuỗiDàiKhôngCóKhoảngTrắng".repeat(12),
            createdAt: date,
          },
        ]);
    } else if (path.endsWith("/handover")) data = handover;
    else if (
      path === "/claims/mine" ||
      path === "/claims/received" ||
      /^\/items\/\d+\/claims$/.test(path)
    )
      list(claims);
    else if (path.endsWith("/suggestions")) {
      data = {
        visual:
          mode === "empty"
            ? []
            : [
                {
                  item: items[1],
                  reasons: ["IMAGE", "INFORMATION"],
                  similarityBand: "VERY_HIGH",
                  informationScore: 92,
                  informationReasons: [
                    "Cùng danh mục và địa điểm",
                    "Thời gian gần nhau",
                  ],
                },
              ],
        information: [],
        totalUnique: mode === "empty" ? 0 : 1,
      };
      extra.visualState = mode === "processing" ? "processing" : "ready";
    } else if (path.endsWith("/stats"))
      data = { views: 12, saves: 3, claims: 2, pendingClaims: 1 };
    else if (/^\/items\/\d+$/.test(path))
      data = items[Number(path.split("/").at(-1)) - 1] ?? items[0];
    else if (
      path === "/items" ||
      path === "/items/mine" ||
      path === "/saved-items"
    )
      list(
        mode === "empty"
          ? []
          : items.filter(
              (item) =>
                !url.searchParams.get("type") ||
                item.type === url.searchParams.get("type"),
            ),
      );
    else if (path === "/notifications")
      list([
        {
          id: 1,
          type: "SYSTEM",
          message: "Thông báo thử nghiệm có nội dung dài. ".repeat(8),
          isRead: false,
          createdAt: date,
        },
      ]);
    else if (path === "/reports/mine" || path === "/admin/reports")
      list([
        {
          id: 1,
          reporterId: 1,
          targetType: "ITEM",
          targetId: 2,
          reason: "OTHER",
          description: "Nội dung báo cáo giả lập. ".repeat(10),
          status: "PENDING",
          reviewedAt: null,
          reviewedBy: null,
          createdAt: date,
        },
      ]);
    if (mode === "loading" && path === "/items")
      await new Promise((done) => setTimeout(done, 1500));
    if (
      mode === "error" &&
      (path === "/items" || path.endsWith("/suggestions"))
    )
      return route.fulfill({
        status: 503,
        json: { success: false, message: "Dịch vụ tạm thời gián đoạn" },
      });
    await route.fulfill({ json: { success: true, data, ...extra } });
  });
  return requests;
}
