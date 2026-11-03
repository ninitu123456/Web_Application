import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { resolve } from "node:path";

// Test-only fixtures and SQL are guarded by the existing isolated MySQL runner.
export async function extendedBrowserCheck({
  browser,
  url,
  ownerEmail,
  otherEmail,
  password,
  categoryId,
  locationId,
  pool,
  query,
  artifacts,
}) {
  assert.ok(process.env.FINDIT_ISOLATED_DATADIR);
  const userContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const adminContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  userContext.setDefaultTimeout(15000);
  adminContext.setDefaultTimeout(15000);
  await userContext.route("https://**/*", (route) => route.abort());
  await adminContext.route("https://**/*", (route) => route.abort());
  const page = await userContext.newPage();
  const adminPage = await adminContext.newPage();
  const errors = [];
  for (const current of [page, adminPage])
    current.on("pageerror", (error) => errors.push(error.message));
  async function login(current, email, next = "/") {
    await current.goto(`${url}/dang-nhap?next=${encodeURIComponent(next)}`);
    await current.getByLabel("Email", { exact: true }).fill(email);
    await current.getByLabel("Mật khẩu", { exact: true }).fill(password);
    await current
      .getByRole("button", { name: "Đăng nhập →", exact: true })
      .click();
    await expect(current).toHaveURL(url + next);
    return current.evaluate(() => sessionStorage.getItem("findit.session"));
  }
  const request = async (current, token, path, body, method = "POST") => {
    const response = await current.request.fetch(url + "/api" + path, {
      method,
      headers: { Authorization: `Bearer ${token}` },
      ...(body === undefined ? {} : { data: body }),
    });
    return { status: response.status(), json: await response.json() };
  };
  const found = async (token, title) => {
    const result = await request(page, token, "/items", {
      title,
      type: "FOUND",
      categoryId,
      locationId,
      eventDate: "2026-10-15",
      description: `Mô tả kiểm thử ${title}`,
    });
    assert.equal(result.status, 201);
    return result.json.data;
  };
  const createClaim = async (token, item, proof) => {
    const result = await request(page, token, `/items/${item.id}/claims`, {
      proofDescription: proof,
    });
    assert.equal(result.status, 201);
    return result.json.data;
  };
  async function confirm(current) {
    await current
      .getByRole("dialog")
      .getByRole("button", { name: "Xác nhận", exact: true })
      .click();
    await expect(current.getByRole("dialog")).toHaveCount(0);
  }
  async function decide(current, reason) {
    await current.getByRole("dialog").getByLabel("Lý do xử lý").fill(reason);
    await current
      .getByRole("dialog")
      .getByRole("button", { name: "Xác nhận quyết định", exact: true })
      .click();
    await expect(current.getByRole("dialog")).toHaveCount(0);
  }
  async function report(current, button, reason) {
    await current.getByRole("button", { name: button, exact: true }).click();
    await current.getByRole("dialog").getByLabel("Lý do báo cáo").fill(reason);
    await current
      .getByRole("dialog")
      .getByLabel("Mô tả thêm (tùy chọn)")
      .fill("Nội dung kiểm thử riêng trong DB cô lập.");
    await current
      .getByRole("dialog")
      .getByRole("button", { name: "Gửi báo cáo →", exact: true })
      .click();
    await expect(current.getByRole("dialog")).toHaveCount(0);
  }
  try {
    const userToken = await login(page, ownerEmail);
    const adminToken = await login(adminPage, otherEmail, "/quan-tri");
    const [accounts] = await query(
      pool,
      "SELECT user_id AS id, email, role_id FROM users WHERE email IN (?,?)",
      [ownerEmail, otherEmail],
    );
    const owner = accounts.find((row) => row.email === ownerEmail);
    const admin = accounts.find((row) => row.email === otherEmail);
    // Ordinary users cannot mount nested Admin screens or call Admin APIs.
    for (const path of [
      "/quan-tri",
      "/quan-tri/nguoi-dung",
      "/quan-tri/bai-dang",
      "/quan-tri/claims",
      "/quan-tri/bao-cao",
      "/quan-tri/danh-muc-dia-diem",
      "/quan-tri/nhat-ky",
    ]) {
      await page.goto(url + path);
      await expect(page.getByRole("alert")).toContainText(
        "Khu vực này chỉ dành cho quản trị viên",
      );
    }
    assert.equal(
      (await request(page, userToken, "/admin/dashboard", undefined, "GET"))
        .status,
      403,
    );
    await adminPage.goto(url + "/quan-tri");
    await expect(
      adminPage.getByRole("heading", { name: "Tổng quan", exact: true }),
    ).toBeVisible();
    const [[usersCount]] = await query(
      pool,
      "SELECT COUNT(*) AS total FROM users",
    );
    await expect(
      adminPage
        .locator(".stat-card")
        .filter({ hasText: "Người dùng" })
        .locator("strong"),
    ).toHaveText(Number(usersCount.total).toLocaleString("vi-VN"));
    await adminPage.screenshot({
      path: resolve(artifacts, "desktop-admin-dashboard.png"),
      fullPage: true,
    });

    // Full name saves through PATCH /users/me and immediately updates the shared account menu.
    await page.goto(url + "/ho-so");
    await page
      .getByLabel("Họ và tên", { exact: true })
      .fill("Sinh viên đã cập nhật");
    await page
      .getByRole("button", { name: "Lưu hồ sơ →", exact: true })
      .click();
    await expect(page.locator(".account-name")).toHaveText(
      "Sinh viên đã cập nhật",
    );
    await page.reload();
    await expect(page.getByLabel("Họ và tên", { exact: true })).toHaveValue(
      "Sinh viên đã cập nhật",
    );

    // Read-all stays scoped to the current account; unread-count shares a single provider.
    const [[otherUnread]] = await query(
      pool,
      "SELECT COUNT(*) AS total FROM notifications WHERE user_id=? AND is_read=FALSE",
      [admin.id],
    );
    await page.goto(url + "/thong-bao");
    await expect(
      page.getByRole("heading", { name: "Thông báo", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Đánh dấu tất cả đã đọc", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Đánh dấu tất cả đã đọc", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: "Thông báo, 0 chưa đọc", exact: true }),
    ).toBeVisible();
    const [[otherAfter]] = await query(
      pool,
      "SELECT COUNT(*) AS total FROM notifications WHERE user_id=? AND is_read=FALSE",
      [admin.id],
    );
    assert.equal(Number(otherAfter.total), Number(otherUnread.total));
    const [[privateNotification]] = await query(
      pool,
      "SELECT notification_id AS id FROM notifications WHERE user_id=? ORDER BY notification_id DESC LIMIT 1",
      [admin.id],
    );
    if (privateNotification)
      assert.equal(
        (
          await request(
            page,
            userToken,
            `/notifications/${privateNotification.id}/read`,
            undefined,
            "PATCH",
          )
        ).status,
        403,
      );
    const notificationItem = await found(userToken, "Notification focus test");
    await createClaim(adminToken, notificationItem, "Notification claim proof");
    await page.waitForTimeout(1600);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.locator(".notification-count")).toBeVisible();
    await expect(
      page.locator(".notification-row.unread").first(),
    ).toBeVisible();
    const [[beforeSingleRead]] = await query(
      pool,
      "SELECT COUNT(*) AS total FROM notifications WHERE user_id=? AND is_read=FALSE",
      [owner.id],
    );
    await page
      .locator(".notification-row.unread")
      .first()
      .getByRole("button", { name: "Đánh dấu đã đọc", exact: true })
      .click();
    await expect(
      page.getByRole("link", {
        name: `Thông báo, ${Number(beforeSingleRead.total) - 1} chưa đọc`,
        exact: true,
      }),
    ).toBeVisible();
    console.log(
      "Extended browser checkpoint: profile and account-scoped notifications passed.",
    );

    // Reports derive the target from Item/owner/Claim context; duplicate reports are explicit 409s.
    const reportItem = await found(userToken, "Report target item");
    await page.goto(`${url}/do-vat/${reportItem.id}`);
    await report(page, "Báo cáo bài đăng", "Kiểm tra báo cáo bài");
    const [[itemReport]] = await query(
      pool,
      "SELECT report_id AS id,target_type,item_id FROM reports WHERE reporter_id=? AND item_id=?",
      [owner.id, reportItem.id],
    );
    assert.equal(itemReport.target_type, "ITEM");
    assert.equal(Number(itemReport.item_id), reportItem.id);
    await page
      .getByRole("button", { name: "Báo cáo bài đăng", exact: true })
      .click();
    await page.getByLabel("Lý do báo cáo").fill("Báo cáo trùng");
    await page
      .getByRole("button", { name: "Gửi báo cáo →", exact: true })
      .click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "Bạn đã gửi báo cáo cho nội dung hoặc tài khoản này",
    );
    await page
      .getByRole("button", { name: "Đóng hộp thoại", exact: true })
      .click();
    await report(page, "Báo cáo chủ bài", "Kiểm tra báo cáo tài khoản");
    await page.goto(`${url}/do-vat/${notificationItem.id}?tab=claims`);
    await report(page, "Báo cáo yêu cầu này", "Kiểm tra báo cáo Claim");
    await page.goto(url + "/bao-cao-cua-toi");
    await expect(
      page.getByRole("heading", {
        name: `Báo cáo #${itemReport.id}`,
        exact: true,
      }),
    ).toBeVisible();
    const ownReports = await request(
      page,
      userToken,
      "/reports/mine",
      undefined,
      "GET",
    );
    const adminReports = await request(
      adminPage,
      adminToken,
      "/reports/mine",
      undefined,
      "GET",
    );
    assert.ok(
      ownReports.json.data.every((row) => row.reporterId === Number(owner.id)),
    );
    assert.ok(
      adminReports.json.data.every(
        (row) => row.reporterId === Number(admin.id),
      ),
    );
    await expect(page.locator(".badge.status-pending").first()).toHaveText(
      "Chờ xem xét",
    );
    // Mark a report reviewing, then resolved; Item is unchanged by report processing.
    await adminPage.goto(`${url}/quan-tri/bao-cao/${itemReport.id}`);
    await adminPage
      .getByRole("button", { name: "Bắt đầu xem xét", exact: true })
      .click();
    await confirm(adminPage);
    await expect(
      adminPage.getByText("Đang xem xét", { exact: true }),
    ).toBeVisible();
    await adminPage
      .getByRole("button", { name: "Đánh dấu đã giải quyết", exact: true })
      .click();
    await confirm(adminPage);
    await expect(
      adminPage.getByText("Đã giải quyết", { exact: true }),
    ).toBeVisible();
    const [[unchanged]] = await query(
      pool,
      "SELECT status FROM items WHERE item_id=?",
      [reportItem.id],
    );
    assert.equal(unchanged.status, "OPEN");
    const [[userReport]] = await query(
      pool,
      "SELECT report_id AS id FROM reports WHERE reporter_id=? AND target_type='USER' ORDER BY report_id DESC LIMIT 1",
      [owner.id],
    );
    await adminPage.goto(`${url}/quan-tri/bao-cao/${userReport.id}`);
    await adminPage
      .getByRole("button", { name: "Bắt đầu xem xét", exact: true })
      .click();
    await confirm(adminPage);
    await adminPage
      .getByRole("button", { name: "Bác bỏ báo cáo", exact: true })
      .click();
    await confirm(adminPage);
    await expect(
      adminPage.getByText("Đã bác bỏ", { exact: true }),
    ).toBeVisible();

    // Both lookup tabs use the same create/update/toggle implementation.
    for (const kind of ["categories", "locations"]) {
      const noun = kind === "categories" ? "danh mục" : "địa điểm";
      const label = kind === "categories" ? "Tên danh mục" : "Tên địa điểm";
      const name = `${noun} browser ${Date.now()}`;
      await adminPage.goto(`${url}/quan-tri/danh-muc-dia-diem?tab=${kind}`);
      await adminPage
        .getByRole("button", { name: `Thêm ${noun}`, exact: true })
        .click();
      await adminPage.getByLabel(label).fill(name);
      await adminPage
        .getByRole("dialog")
        .getByRole("button", { name: "Lưu thay đổi", exact: true })
        .click();
      await expect(adminPage.getByRole("dialog")).toHaveCount(0);
      let row = adminPage.getByRole("row").filter({ hasText: name });
      await expect(row).toBeVisible();
      await row.getByRole("button", { name: "Đổi tên", exact: true }).click();
      await adminPage.getByLabel(label).fill(name + " mới");
      await adminPage
        .getByRole("dialog")
        .getByRole("button", { name: "Lưu thay đổi", exact: true })
        .click();
      await expect(adminPage.getByRole("dialog")).toHaveCount(0);
      row = adminPage.getByRole("row").filter({ hasText: name + " mới" });
      await row
        .getByRole("button", { name: "Ngừng hoạt động", exact: true })
        .click();
      await confirm(adminPage);
      await expect(
        row.getByRole("button", { name: "Bật hoạt động", exact: true }),
      ).toBeVisible();
      const publicLookup = await page.request.get(`${url}/api/${kind}`);
      assert.ok(
        !(await publicLookup.json()).data.some(
          (lookup) => lookup.name === name + " mới",
        ),
      );
      await row
        .getByRole("button", { name: "Bật hoạt động", exact: true })
        .click();
      await confirm(adminPage);
      await adminPage
        .getByRole("button", { name: `Thêm ${noun}`, exact: true })
        .click();
      await adminPage.getByLabel(label).fill(name + " mới");
      await adminPage
        .getByRole("dialog")
        .getByRole("button", { name: "Lưu thay đổi", exact: true })
        .click();
      await expect(
        adminPage.getByRole("dialog").getByRole("alert"),
      ).toContainText("Tên này đã được sử dụng. Vui lòng chọn tên khác.");
      await adminPage
        .getByRole("button", { name: "Đóng hộp thoại", exact: true })
        .click();
    }

    // Canonical moderation includes a mandatory audit reason and does not use the legacy endpoint.
    const moderationReason = "Canonical moderation browser reason";
    const closeItem = await found(userToken, "Canonical close target");
    await adminPage.goto(`${url}/quan-tri/bai-dang/${closeItem.id}`);
    await adminPage
      .getByRole("button", { name: "Đóng bài có lý do", exact: true })
      .click();
    await decide(adminPage, moderationReason);
    await expect(adminPage.getByText("Đã đóng", { exact: true })).toBeVisible();
    const publicClosed = await page.request.get(
      `${url}/api/items/${closeItem.id}`,
    );
    assert.equal(publicClosed.status(), 200);
    assert.ok(!(await publicClosed.text()).includes(moderationReason));

    // A third USER claimant leaves the administrator unrelated to the dispute.
    const thirdEmail = `third-${Date.now()}@example.test`;
    assert.equal(
      (
        await request(page, userToken, "/auth/register", {
          fullName: "Người nhận kiểm thử",
          email: thirdEmail,
          password,
        })
      ).status,
      201,
    );
    const thirdLogin = await request(page, userToken, "/auth/login", {
      email: thirdEmail,
      password,
    });
    const thirdToken = thirdLogin.json.data.token;
    const thirdId = thirdLogin.json.data.user.id;
    const approveItem = await found(userToken, "Admin approve target");
    const approveClaim = await createClaim(
      thirdToken,
      approveItem,
      "Admin proof approve",
    );
    await adminPage.goto(`${url}/quan-tri/claims?itemId=${approveItem.id}`);
    await adminPage
      .getByRole("button", { name: "Duyệt tranh chấp", exact: true })
      .click();
    await expect(adminPage.getByRole("dialog")).toContainText(
      "Các yêu cầu đang chờ khác sẽ bị từ chối.",
    );
    await adminPage.getByLabel("Lý do xử lý").fill("😀".repeat(1001));
    await adminPage
      .getByRole("button", { name: "Xác nhận quyết định", exact: true })
      .click();
    await expect(
      adminPage.getByRole("dialog").getByRole("alert"),
    ).toContainText("Lý do quá dài");
    await adminPage.setViewportSize({ width: 390, height: 844 });
    await adminPage.screenshot({
      path: resolve(artifacts, "mobile-admin-decision.png"),
      fullPage: true,
    });
    await adminPage.setViewportSize({ width: 1440, height: 1000 });
    // The unchanged upper limit also accepts exactly 1,000 emoji (4,000 bytes).
    await decide(adminPage, "😀".repeat(1000));
    await expect(adminPage.locator(".badge.status-approved")).toBeVisible();
    const [[approved]] = await query(
      pool,
      "SELECT status FROM items WHERE item_id=?",
      [approveItem.id],
    );
    assert.equal(approved.status, "CLAIMED");
    assert.equal(
      await adminPage
        .getByRole("button", { name: "Xác nhận bàn giao →", exact: true })
        .count(),
      0,
    );
    const rejectItem = await found(userToken, "Admin reject target");
    const rejectedClaim = await createClaim(
      thirdToken,
      rejectItem,
      "Admin proof reject",
    );
    await adminPage.goto(`${url}/quan-tri/claims?itemId=${rejectItem.id}`);
    await adminPage
      .getByRole("button", { name: "Từ chối tranh chấp", exact: true })
      .click();
    await decide(adminPage, "Bằng chứng không phù hợp");
    await expect(adminPage.locator(".badge.status-rejected")).toBeVisible();
    const [[rejected]] = await query(
      pool,
      "SELECT status FROM items WHERE item_id=?",
      [rejectItem.id],
    );
    assert.equal(rejected.status, "OPEN");
    assert.equal(
      (
        await request(page, thirdToken, `/items/${rejectItem.id}/claims`, {
          proofDescription: "Retry after rejection",
        })
      ).status,
      409,
    );
    const pendingCloseItem = await found(
      userToken,
      "Pending moderation target",
    );
    const pendingCloseClaim = await createClaim(
      thirdToken,
      pendingCloseItem,
      "Pending close proof",
    );
    await adminPage.goto(`${url}/quan-tri/bai-dang/${pendingCloseItem.id}`);
    await adminPage
      .getByRole("button", { name: "Đóng bài có lý do", exact: true })
      .click();
    await decide(adminPage, "Đóng bài đang có yêu cầu");
    await expect(adminPage.getByText("Đã đóng", { exact: true })).toBeVisible();
    const [[closedClaim]] = await query(
      pool,
      "SELECT status FROM claims WHERE claim_id=?",
      [pendingCloseClaim.id],
    );
    assert.equal(closedClaim.status, "REJECTED");

    // 103 claims: target evidence and the administrator's rejected history are beyond page one.
    const historyItem = await found(
      userToken,
      "Multi-page private proof target",
    );
    const targetProof = "PRIVATE_MULTI_PAGE_PROOF_103";
    const target = await createClaim(thirdToken, historyItem, targetProof);
    await query(
      pool,
      "UPDATE claims SET submitted_at='2020-01-01 00:00:00' WHERE claim_id=?",
      [target.id],
    );
    for (let index = 0; index < 101; index++) {
      const [inserted] = await query(
        pool,
        "INSERT INTO users(role_id,full_name,email,password_hash,account_status,created_at,updated_at) SELECT role_id,?,?,password_hash,'ACTIVE',UTC_TIMESTAMP(),UTC_TIMESTAMP() FROM users WHERE user_id=?",
        [
          `History ${index}`,
          `history-${historyItem.id}-${index}@example.test`,
          owner.id,
        ],
      );
      await query(
        pool,
        "INSERT INTO claims(claimant_id,item_id,proof_description,status,submitted_at,reviewed_at) VALUES(?,?,?,'REJECTED',UTC_TIMESTAMP(),UTC_TIMESTAMP())",
        [inserted.insertId, historyItem.id, `Other private proof ${index}`],
      );
    }
    await query(
      pool,
      "INSERT INTO claims(claimant_id,item_id,proof_description,status,submitted_at,reviewed_at) VALUES(?,?,?,'REJECTED','2019-01-01 00:00:00',UTC_TIMESTAMP())",
      [admin.id, historyItem.id, "Administrator historical claim"],
    );
    let pageTwoRead = false;
    adminPage.on("request", (incoming) => {
      const parsed = new URL(incoming.url());
      if (
        parsed.pathname === `/api/items/${historyItem.id}/claims` &&
        parsed.searchParams.get("page") === "2"
      )
        pageTwoRead = true;
    });
    await adminPage.goto(
      `${url}/quan-tri/claims?itemId=${historyItem.id}&status=PENDING`,
    );
    await adminPage
      .getByRole("button", { name: "Xem bằng chứng", exact: true })
      .click();
    await expect(
      adminPage.getByRole("dialog").getByText(targetProof, { exact: true }),
    ).toBeVisible();
    assert.equal(pageTwoRead, true);
    await adminPage
      .getByRole("button", { name: "Đóng hộp thoại", exact: true })
      .click();
    await adminPage
      .getByRole("button", { name: "Duyệt tranh chấp", exact: true })
      .click();
    await expect(
      adminPage
        .getByRole("dialog")
        .getByText(
          "Bạn là chủ bài hoặc đã gửi yêu cầu nhận đồ cho bài này. Cần quản trị viên khác xử lý.",
          { exact: true },
        ),
    ).toBeVisible();
    await expect(
      adminPage.getByRole("button", {
        name: "Xác nhận quyết định",
        exact: true,
      }),
    ).toBeDisabled();
    await adminPage
      .getByRole("button", { name: "Đóng hộp thoại", exact: true })
      .click();
    // If preflight fails, do not claim certainty: backend still returns the authoritative 403.
    await adminPage.route("**/api/admin/claims?**", async (route) => {
      const parsed = new URL(route.request().url());
      if (
        parsed.searchParams.get("claimantId") === String(admin.id) &&
        parsed.searchParams.get("itemId") === String(historyItem.id)
      )
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            message: "Preflight unavailable",
          }),
        });
      else await route.continue();
    });
    await adminPage
      .getByRole("button", { name: "Duyệt tranh chấp", exact: true })
      .click();
    await expect(
      adminPage
        .getByRole("dialog")
        .getByText(
          /Chưa kiểm tra được bạn có liên quan đến bài đăng này hay không/,
        ),
    ).toBeVisible();
    await adminPage
      .getByLabel("Lý do xử lý")
      .fill("Backend must enforce recusal");
    await adminPage
      .getByRole("button", { name: "Xác nhận quyết định", exact: true })
      .click();
    await expect(
      adminPage.getByRole("dialog").getByRole("alert"),
    ).toContainText("Vui lòng nhờ quản trị viên khác xử lý");
    await adminPage
      .getByRole("button", { name: "Đóng hộp thoại", exact: true })
      .click();
    await adminPage.unroute("**/api/admin/claims?**");
    await adminPage.goto(`${url}/quan-tri/bai-dang/${historyItem.id}`);
    await expect(
      adminPage.getByRole("button", { name: "Đóng bài có lý do", exact: true }),
    ).toBeDisabled();

    // Activity log has canonical reasons, no private evidence or internal image journal.
    await adminPage.goto(
      url + "/quan-tri/nhat-ky?action=ITEM_MODERATED_CLOSED",
    );
    await expect(
      adminPage.getByText(moderationReason, { exact: true }),
    ).toBeVisible();
    assert.ok(
      !(await adminPage.locator("main").innerText()).includes(targetProof),
    );
    assert.ok(
      !(await adminPage.locator("main").innerText()).includes(
        "IMAGE_OPERATION_STARTED",
      ),
    );
    assert.doesNotMatch(
      (await adminPage.locator(".log-details").allTextContents()).join(" "),
      /ADMIN_MODERATION|ADMIN_RESOLVE|\bOPEN\b|\bCLOSED\b/,
    );
    await adminPage.screenshot({
      path: resolve(artifacts, "desktop-admin-activity.png"),
      fullPage: true,
    });

    // Suspension immediately affects JWT access; reactivation restores login. Self-change stays disabled.
    // Keep the signed-in page mounted to exercise the existing focus refresh,
    // rather than racing it against a new document's initial identity request.
    await page.goto(url + "/ho-so");
    await expect(page.getByLabel("Họ và tên", { exact: true })).toBeVisible();
    await adminPage.goto(`${url}/quan-tri/nguoi-dung/${admin.id}`);
    await expect(
      adminPage.getByRole("button", {
        name: "Đình chỉ tài khoản",
        exact: true,
      }),
    ).toBeDisabled();
    await adminPage.goto(`${url}/quan-tri/nguoi-dung/${owner.id}`);
    await adminPage
      .getByRole("button", { name: "Đình chỉ tài khoản", exact: true })
      .click();
    await confirm(adminPage);
    await expect(
      adminPage.getByText("Đã đình chỉ", { exact: true }),
    ).toBeVisible();
    // Respect the existing one-second identity refresh throttle.
    await expect
      .poll(
        async () => {
          if (new URL(page.url()).pathname !== "/dang-nhap")
            await page.evaluate(() => window.dispatchEvent(new Event("focus")));
          return new URL(page.url()).pathname;
        },
        { timeout: 10000, intervals: [200, 1000, 1000] },
      )
      .toBe("/dang-nhap");
    await expect(page).toHaveURL(/dang-nhap\?next=/);
    assert.equal(
      await page.evaluate(() => sessionStorage.getItem("findit.session")),
      null,
    );
    await adminPage
      .getByRole("button", { name: "Kích hoạt tài khoản", exact: true })
      .click();
    await confirm(adminPage);
    await login(page, ownerEmail, "/ho-so");
    for (const path of [
      "/quan-tri",
      "/quan-tri/nguoi-dung",
      "/quan-tri/bai-dang",
      "/quan-tri/claims",
      "/quan-tri/bao-cao",
      "/quan-tri/danh-muc-dia-diem",
      "/quan-tri/nhat-ky",
    ]) {
      await adminPage.setViewportSize({ width: 390, height: 844 });
      await adminPage.goto(url + path);
      await expect(
        adminPage.getByRole("navigation", { name: "Quản trị", exact: true }),
      ).toBeVisible();
      assert.ok(
        await adminPage.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        `No horizontal page overflow at ${path}`,
      );
    }
    await adminPage.screenshot({
      path: resolve(artifacts, "mobile-admin-activity.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ["/ho-so", "/thong-bao", "/bao-cao-cua-toi"]) {
      await page.goto(url + path);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      );
    }
    await page.screenshot({
      path: resolve(artifacts, "mobile-my-reports.png"),
      fullPage: true,
    });
    // A role change is seen by the actual JWT middleware and the frontend guard.
    await query(pool, "UPDATE users SET role_id=? WHERE user_id=?", [
      owner.role_id,
      admin.id,
    ]);
    await adminPage.goto(url + "/quan-tri");
    await expect(adminPage.getByRole("alert")).toContainText(
      "Khu vực này chỉ dành cho quản trị viên",
    );
    await query(pool, "UPDATE users SET role_id=? WHERE user_id=?", [
      admin.role_id,
      admin.id,
    ]);
    // Return statuses and ownership invariants remain intact after Admin operations.
    const [[approvedStill]] = await query(
      pool,
      "SELECT status FROM claims WHERE claim_id=?",
      [approveClaim.id],
    );
    assert.equal(approvedStill.status, "APPROVED");
    const [[rejectedStill]] = await query(
      pool,
      "SELECT status FROM claims WHERE claim_id=?",
      [rejectedClaim.id],
    );
    assert.equal(rejectedStill.status, "REJECTED");
    assert.ok(Number(thirdId) > 0);
    assert.deepEqual(errors, []);
    console.log(
      "Extended browser: notifications/ownership/focus, profile/menu, contextual reports/workflow, Admin RBAC/dashboard/users/lookups/moderation/resolve/activity, 103-Claim evidence/recusal, backend 403 and desktop/mobile verified.",
    );
  } catch (error) {
    await page
      .screenshot({
        path: resolve(artifacts, "extended-user-failure.png"),
        fullPage: true,
      })
      .catch(() => {});
    await adminPage
      .screenshot({
        path: resolve(artifacts, "extended-admin-failure.png"),
        fullPage: true,
      })
      .catch(() => {});
    throw error;
  } finally {
    await userContext.close();
    await adminContext.close();
  }
}
