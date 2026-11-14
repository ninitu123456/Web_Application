// Called only by the existing isolated MySQL runner, never against the installed DB.
import { chromium, expect } from "@playwright/test";
import { createServer, request as proxyRequest } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, resolve, sep } from "node:path";
import assert from "node:assert/strict";

export async function browserCheck({
  backendUrl,
  ownerEmail,
  otherEmail,
  password,
  categoryId,
  locationId,
  pool,
  query,
}) {
  assert.ok(process.env.FINDIT_ISOLATED_DATADIR);
  const root = fileURLToPath(new URL("../dist/", import.meta.url));
  const artifacts = fileURLToPath(
    new URL("../../.cache/frontend-browser/", import.meta.url),
  );
  await mkdir(artifacts, { recursive: true });
  const mime = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".png": "image/png",
    ".svg": "image/svg+xml",
  };
  const server = createServer(async (req, res) => {
    if (req.url.startsWith("/api/")) {
      const upstream = proxyRequest(
        backendUrl + req.url,
        {
          method: req.method,
          headers: { ...req.headers, host: new URL(backendUrl).host },
        },
        (response) => {
          res.writeHead(response.statusCode, response.headers);
          response.pipe(res);
        },
      );
      upstream.on("error", () => {
        res.writeHead(502);
        res.end();
      });
      req.pipe(upstream);
      return;
    }
    try {
      const path = new URL(req.url, "http://localhost").pathname;
      const target = resolve(root, "." + path);
      if (target !== resolve(root) && !target.startsWith(resolve(root) + sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const asset = path.startsWith("/assets/")
        ? target
        : resolve(root, "index.html");
      res.writeHead(200, {
        "Content-Type": mime[extname(asset)] || "application/octet-stream",
      });
      res.end(await readFile(asset));
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const url = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({
      channel: process.env.FINDIT_BROWSER_CHANNEL || "chrome",
      headless: true,
    });
    const a = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const b = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    a.setDefaultTimeout(15000);
    b.setDefaultTimeout(15000);
    // Tests are self-contained: use system font fallback and no real Cloudinary/external network.
    await a.route("https://**/*", (route) => route.abort());
    await b.route("https://**/*", (route) => route.abort());
    const pageA = await a.newPage();
    const pageB = await b.newPage();
    const errors = [];
    for (const page of [pageA, pageB])
      page.on("pageerror", (error) => errors.push(error.message));
    async function login(page, email, next = "/bai-dang-cua-toi") {
      await page.goto(`${url}/dang-nhap?next=${encodeURIComponent(next)}`);
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
      await page
        .getByRole("button", { name: "Đăng nhập →", exact: true })
        .click();
      await expect(page).toHaveURL(url + next);
    }
    await pageA.goto(`${url}/kham-pha`);
    assert.notEqual(
      await pageA
        .locator(".skip-link")
        .evaluate((element) => getComputedStyle(element).clipPath),
      "none",
    );
    await pageA.keyboard.press("Tab");
    await expect(pageA.locator(".skip-link")).toBeFocused();
    assert.equal(
      await pageA
        .locator(".skip-link")
        .evaluate((element) => getComputedStyle(element).clipPath),
      "none",
    );
    await pageA.keyboard.press("Tab");
    await expect(
      pageA.getByRole("heading", { name: "Đồ vật gần đây" }),
    ).toBeVisible();
    await pageA.screenshot({
      path: resolve(artifacts, "desktop-explore.png"),
      fullPage: true,
    });
    for (const width of [360, 520, 768, 1024, 1440]) {
      await pageA.setViewportSize({ width, height: 1000 });
      assert.ok(
        await pageA.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `Explore fits ${width}px`,
      );
    }
    await pageA.setViewportSize({ width: 1440, height: 1000 });

    await pageB.goto(url);
    await expect(pageB.locator("h1.home-title")).toBeVisible();
    await expect(pageB.locator(".home-search")).toBeVisible();
    await pageB.screenshot({
      path: resolve(artifacts, "mobile-home.png"),
      fullPage: true,
    });
    assert.ok(
      await pageB.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      "No mobile horizontal overflow",
    );
    // Exercise registration through the UI; registration does not create a session.
    const registrationEmail = `browser-${Date.now()}@example.test`;
    await pageB.goto(
      `${url}/dang-ky?next=${encodeURIComponent("/bai-dang-cua-toi")}`,
    );
    await pageB.getByLabel("Họ và tên").fill("Người dùng kiểm thử");
    await pageB.getByLabel("Email", { exact: true }).fill(registrationEmail);
    await pageB
      .getByLabel("Nhập lại mật khẩu", { exact: true })
      .fill("placeholder123");
    await expect(
      pageB.getByText("Sử dụng ít nhất 8 ký tự.", { exact: true }),
    ).toBeVisible();
    // Check the actual form: Unicode characters and byte limits must remain independent.
    for (const value of ["ắ".repeat(25), "😀".repeat(19), "a".repeat(73)]) {
      await pageB.getByLabel("Mật khẩu", { exact: true }).fill(value);
      await pageB
        .getByRole("button", { name: "Tạo tài khoản →", exact: true })
        .click();
      await expect(pageB.getByRole("alert")).toHaveText(
        "Mật khẩu quá dài. Vui lòng rút ngắn.",
      );
      await expect(pageB).toHaveURL(/dang-ky/);
    }
    await pageB.screenshot({
      path: resolve(artifacts, "mobile-password-error.png"),
      fullPage: true,
    });
    await pageB.getByLabel("Mật khẩu", { exact: true }).fill("😀".repeat(7));
    await pageB
      .getByRole("button", { name: "Tạo tài khoản →", exact: true })
      .click();
    await expect(pageB.getByRole("alert")).toHaveText(
      "Sử dụng ít nhất 8 ký tự cho mật khẩu.",
    );
    await pageB.getByLabel("Mật khẩu", { exact: true }).fill("ắ".repeat(24));
    await pageB
      .getByLabel("Nhập lại mật khẩu", { exact: true })
      .fill("ắ".repeat(24));
    await pageB
      .getByRole("button", { name: "Tạo tài khoản →", exact: true })
      .click();
    await expect(pageB).toHaveURL(/dang-nhap\?next=/);
    assert.equal(
      await pageB.evaluate(() => sessionStorage.getItem("findit.session")),
      null,
    );
    await login(pageA, ownerEmail, "/dang-bai");
    const title = `Browser Found ${Date.now()}`;
    const proof = "PRIVATE_BROWSER_PROOF_unique_mark_inside";
    const htmlText = `<img src=x onerror="document.documentElement.dataset.finditXss='executed'">`;
    await pageA.getByRole("radio", { name: "Tôi nhặt được đồ" }).check();
    let createPosts = 0;
    pageA.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/items"
      )
        createPosts++;
    });
    await pageA.screenshot({
      path: resolve(artifacts, "desktop-wizard-1.png"),
      fullPage: true,
    });
    await pageA
      .getByRole("button", { name: "Tiếp tục →", exact: true })
      .click();
    await pageA
      .getByRole("button", { name: "Xem trước →", exact: true })
      .click();
    await expect(pageA.getByLabel("Tiêu đề", { exact: true })).toBeFocused();
    assert.equal(
      createPosts,
      0,
      "Navigation and invalid fields never create an Item",
    );
    await pageA.getByLabel("Tiêu đề", { exact: true }).fill(title);
    await pageA
      .getByLabel("Danh mục", { exact: true })
      .selectOption(String(categoryId));
    await pageA
      .getByLabel("Địa điểm nhặt được", { exact: true })
      .selectOption(String(locationId));
    await pageA.getByLabel("Ngày nhặt được").fill("2026-10-15");
    for (const value of ["ắ".repeat(21846), "😀".repeat(16384)]) {
      await pageA.getByLabel("Mô tả đồ vật").fill(value);
      await pageA
        .getByRole("button", { name: "Xem trước →", exact: true })
        .click();
      await expect(
        pageA.locator(
          "#" +
            (await pageA
              .getByLabel("Mô tả đồ vật")
              .getAttribute("aria-describedby")),
        ),
      ).toHaveText("Mô tả quá dài. Vui lòng rút ngắn.");
      await expect(pageA).toHaveURL(`${url}/dang-bai`);
    }
    await pageA
      .getByLabel("Mô tả đồ vật")
      .fill("Nhặt được đồ thử nghiệm tại thư viện. " + htmlText);
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=",
      "base64",
    );
    await pageA.screenshot({
      path: resolve(artifacts, "desktop-wizard-2.png"),
      fullPage: true,
    });
    await pageA
      .getByRole("button", { name: "← Quay lại", exact: true })
      .click();
    await pageA
      .getByLabel("Thêm ảnh")
      .setInputFiles({ name: "item.png", mimeType: "image/png", buffer: png });
    await pageA
      .getByRole("button", { name: "Tiếp tục →", exact: true })
      .click();
    await expect(pageA.getByLabel("Tiêu đề", { exact: true })).toHaveValue(
      title,
    );
    await pageA
      .getByRole("button", { name: "Xem trước →", exact: true })
      .click();
    await expect(
      pageA.getByRole("region", { name: "Xem trước bài đăng" }),
    ).toContainText(title);
    await expect(pageA.getByAltText("Ảnh đồ vật 1")).toBeVisible();
    assert.equal(createPosts, 0, "Preview must not create an Item");
    await pageA.screenshot({
      path: resolve(artifacts, "desktop-wizard-3.png"),
      fullPage: true,
    });
    // Fail the first upload before the request reaches the backend; the Item must survive.
    let blocked = false;
    await pageA.route("**/api/items/*/images", async (route) => {
      if (route.request().method() === "POST" && !blocked) {
        blocked = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            message: "Test upload unavailable",
          }),
        });
      } else await route.continue();
    });
    await pageA
      .getByRole("button", { name: "Đăng bài →", exact: true })
      .click();
    await expect(
      pageA.getByRole("alert").filter({ hasText: "FindIt tạm thời gặp sự cố" }),
    ).toBeVisible();
    const createdUrl = pageA.url();
    assert.match(createdUrl, /\/do-vat\/\d+\/sua$/);
    const itemId = Number(createdUrl.match(/do-vat\/(\d+)/)[1]);
    await pageA
      .getByRole("button", { name: "Tải ảnh cho bài đã tạo →" })
      .click();
    await expect(pageA).toHaveURL(`${url}/do-vat/${itemId}`);
    await expect(
      pageA.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(pageA.locator(".description")).toContainText(htmlText);
    assert.equal(
      await pageA.evaluate(() => document.documentElement.dataset.finditXss),
      undefined,
    );
    const [[count]] = await query(
      pool,
      "SELECT COUNT(*) AS total FROM items WHERE title=?",
      [title],
    );
    assert.equal(Number(count.total), 1);
    const [[imageCount]] = await query(
      pool,
      "SELECT COUNT(*) AS total FROM item_images WHERE item_id=?",
      [itemId],
    );
    assert.equal(Number(imageCount.total), 1);
    await pageA.screenshot({
      path: resolve(artifacts, "desktop-detail.png"),
      fullPage: true,
    });
    await pageA.goto(`${url}/do-vat/${itemId}/sua`);
    await pageA
      .getByRole("button", { name: "Xóa ảnh đã lưu", exact: true })
      .click();
    await pageA
      .getByRole("dialog")
      .getByRole("button", { name: "Xác nhận", exact: true })
      .click();
    await expect(
      pageA.getByRole("button", { name: "Xóa ảnh đã lưu", exact: true }),
    ).toHaveCount(0);
    await pageA.getByLabel("Thêm ảnh").setInputFiles({
      name: "replacement.png",
      mimeType: "image/png",
      buffer: png,
    });
    await pageA
      .getByRole("button", { name: "Lưu thay đổi →", exact: true })
      .click();
    await expect(pageA).toHaveURL(`${url}/do-vat/${itemId}`);
    // Inactive values remain visible, and a title-only update retains both references.
    await query(
      pool,
      "UPDATE categories SET is_active=FALSE WHERE category_id=?",
      [categoryId],
    );
    await query(
      pool,
      "UPDATE locations SET is_active=FALSE WHERE location_id=?",
      [locationId],
    );
    await pageA.goto(`${url}/do-vat/${itemId}/sua`);
    await expect(pageA.getByLabel("Danh mục", { exact: true })).toHaveValue(
      String(categoryId),
    );
    await expect(
      pageA.getByLabel("Địa điểm nhặt được", { exact: true }),
    ).toHaveValue(String(locationId));
    await pageA.getByLabel("Tiêu đề", { exact: true }).fill(title + " updated");
    await pageA.getByRole("button", { name: "Lưu thay đổi →" }).click();
    await expect(pageA).toHaveURL(`${url}/do-vat/${itemId}`);
    await query(
      pool,
      "UPDATE categories SET is_active=TRUE WHERE category_id=?",
      [categoryId],
    );
    await query(
      pool,
      "UPDATE locations SET is_active=TRUE WHERE location_id=?",
      [locationId],
    );
    await pageB.setViewportSize({ width: 360, height: 800 });
    await login(pageB, otherEmail, "/dang-bai?type=LOST");
    await expect(
      pageB.getByRole("radio", { name: "Tôi bị mất đồ" }),
    ).toBeChecked();
    await pageB.screenshot({
      path: resolve(artifacts, "mobile-wizard-1.png"),
      fullPage: true,
    });
    await pageB
      .getByRole("button", { name: "Tiếp tục →", exact: true })
      .click();
    await expect(pageB.getByLabel("Ngày bị mất")).toBeVisible();
    await pageB
      .getByLabel("Tiêu đề", { exact: true })
      .fill("Tìm bình nước xanh");
    await pageB
      .getByLabel("Danh mục", { exact: true })
      .selectOption(String(categoryId));
    await pageB
      .getByLabel("Địa điểm bị mất", { exact: true })
      .selectOption(String(locationId));
    await pageB.getByLabel("Ngày bị mất").fill("2026-11-07");
    await pageB
      .getByLabel("Mô tả đồ vật")
      .fill("Để quên bình nước ở thư viện.");

    await pageB.screenshot({
      path: resolve(artifacts, "mobile-wizard-2.png"),
      fullPage: true,
    });
    assert.ok(
      await pageB.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "No wizard overflow at 360px",
    );
    await pageB
      .getByRole("button", { name: "Xem trước →", exact: true })
      .click();
    await expect(
      pageB.getByRole("region", { name: "Xem trước bài đăng" }),
    ).toContainText("Tìm bình nước xanh");
    await pageB.screenshot({
      path: resolve(artifacts, "mobile-wizard-3.png"),
      fullPage: true,
    });
    let ambiguousPosts = 0;
    await pageB.route("**/api/items", async (route) => {
      if (route.request().method() === "POST") {
        ambiguousPosts++;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ success: false }),
        });
      } else await route.continue();
    });
    await pageB
      .getByRole("button", { name: "Đăng bài →", exact: true })
      .click();
    await expect(
      pageB.getByRole("button", { name: "Đăng bài →", exact: true }),
    ).toBeDisabled();
    await expect(
      pageB.getByText("Chưa xác định kết quả lưu.", { exact: false }),
    ).toBeVisible();
    assert.equal(
      ambiguousPosts,
      1,
      "Never automatically repeat an ambiguous Item POST",
    );
    await pageB.unroute("**/api/items");
    await pageB.goto(url);

    const lostTitle = title + " counterpart";
    const otherToken = await pageB.evaluate(() =>
      sessionStorage.getItem("findit.session"),
    );
    const lostResponse = await pageB.request.post(`${url}/api/items`, {
      headers: { Authorization: `Bearer ${otherToken}` },
      data: {
        title: lostTitle,
        type: "LOST",
        categoryId,
        locationId,
        eventDate: "2026-10-15",
        description: "Nhặt được đồ thử nghiệm tại thư viện.",
      },
    });
    assert.equal(lostResponse.status(), 201);
    await pageA.goto(`${url}/do-vat/${itemId}`);
    await expect(
      pageA.getByRole("heading", { name: lostTitle, exact: true }),
    ).toBeVisible();
    await expect(
      pageA.getByText(/\d+\/100 điểm trùng thông tin/, { exact: true }).first(),
    ).toBeVisible();
    assert.ok(!(await pageA.locator("body").innerText()).includes(proof));
    await pageB
      .getByRole("searchbox", { name: "Bạn đang tìm gì?" })
      .fill(title);
    await pageB.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
    await expect(
      pageB.getByRole("heading", { name: title + " updated", exact: true }),
    ).toBeVisible();
    await pageB
      .getByRole("heading", { name: title + " updated", exact: true })
      .getByRole("link")
      .click();
    await expect(
      pageB.getByRole("button", { name: "Đây có thể là đồ của tôi →" }),
    ).toBeVisible();
    await pageB
      .getByRole("link", { name: "← Khám phá đồ vật", exact: true })
      .click();
    assert.equal(
      new URL(pageB.url()).searchParams.get("keyword"),
      title,
      "Detail return preserves search URL",
    );
    await pageB.goto(`${url}/do-vat/${itemId}/sua`);
    await expect(pageB.getByRole("alert")).toContainText(
      "Bạn chỉ có thể sửa bài của mình",
    );
    await pageB.goto(`${url}/do-vat/${itemId}`);
    await pageB
      .getByRole("button", { name: "Đây có thể là đồ của tôi →" })
      .click();
    await expect(pageB.getByRole("dialog")).toBeVisible();
    await pageB.keyboard.press("Tab");
    assert.ok(
      await pageB.evaluate(() =>
        Boolean(document.activeElement?.closest("dialog")),
      ),
    );
    await pageB.keyboard.press("Escape");
    await expect(pageB.getByRole("dialog")).toHaveCount(0);
    await pageB
      .getByRole("button", { name: "Đây có thể là đồ của tôi →" })
      .click();
    await expect(pageB.getByRole("dialog")).toContainText(
      "Bằng chứng chỉ được hiển thị cho bạn, chủ bài và quản trị viên có thẩm quyền.",
    );
    for (const value of ["ắ".repeat(21846), "😀".repeat(16384)]) {
      await pageB.getByLabel("Bằng chứng sở hữu").fill(value);
      await pageB
        .getByRole("button", { name: "Gửi yêu cầu →", exact: true })
        .click();
      await expect(pageB.getByRole("dialog").getByRole("alert")).toHaveText(
        "Bằng chứng quá dài. Vui lòng rút ngắn.",
      );
    }
    await pageB.getByLabel("Bằng chứng sở hữu").fill(proof);
    let claimPosts = 0;
    await pageB.route("**/api/items/*/claims", async (route) => {
      if (route.request().method() === "POST") {
        claimPosts++;
        await new Promise((done) => setTimeout(done, 250));
      }
      await route.continue();
    });
    const firstClaimResponse = pageB.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith(`/api/items/${itemId}/claims`),
    );
    await pageB
      .getByRole("button", { name: "Gửi yêu cầu →", exact: true })
      .dblclick();
    const submitted = await firstClaimResponse;
    const submittedBody = await submitted.json();
    assert.equal(
      submitted.status(),
      201,
      `Claim submission: ${submittedBody.message}`,
    );
    await expect(pageB.getByRole("dialog")).toHaveCount(0);
    assert.equal(
      claimPosts,
      1,
      "Double click must submit only one in-flight Claim",
    );
    const [[claimRow]] = await query(
      pool,
      "SELECT claim_id, status FROM claims WHERE item_id=?",
      [itemId],
    );
    assert.equal(claimRow.status, "PENDING");
    await expect(
      pageB.locator(".detail-info .badge.status-claim_pending"),
    ).toBeVisible();
    // Duplicate is rejected and produces a useful error in the modal.
    await pageB
      .getByRole("button", { name: "Đây có thể là đồ của tôi →" })
      .click();
    await pageB.getByLabel("Bằng chứng sở hữu").fill(proof);
    await pageB
      .getByRole("button", { name: "Gửi yêu cầu →", exact: true })
      .click();
    await expect(pageB.getByRole("alert")).toContainText(
      "Bạn đã gửi yêu cầu nhận đồ cho bài đăng này",
    );
    await pageB.getByRole("button", { name: "Đóng hộp thoại" }).click();
    await pageB.screenshot({
      path: resolve(artifacts, "mobile-detail.png"),
      fullPage: true,
    });
    // A third anonymous context sees no private proof in public Item/Matching DOM.
    const anonymous = await browser.newContext();
    anonymous.setDefaultTimeout(15000);
    await anonymous.route("https://**/*", (route) => route.abort());
    const publicPage = await anonymous.newPage();
    await publicPage.goto(`${url}/do-vat/${itemId}`);
    await expect(
      publicPage.getByRole("heading", {
        name: title + " updated",
        exact: true,
      }),
    ).toBeVisible();
    assert.ok(!(await publicPage.locator("body").innerText()).includes(proof));
    const publicResponse = await publicPage.request.get(
      `${url}/api/items/${itemId}`,
    );
    assert.ok(!(await publicResponse.text()).includes(proof));
    await pageA.goto(`${url}/do-vat/${itemId}?tab=claims`);
    await expect(pageA.getByText(proof, { exact: true })).toBeVisible();
    const pendingGuidance = "Đang chờ chủ bài kiểm tra bằng chứng.";
    await expect(
      pageA.getByText(pendingGuidance, { exact: false }),
    ).toHaveCount(0);
    await pageB.goto(`${url}/yeu-cau-cua-toi`);
    await expect(
      pageB.getByText(pendingGuidance, { exact: false }),
    ).toBeVisible();
    await pageA
      .getByRole("button", { name: "Chấp thuận →", exact: true })
      .click();
    await expect(pageA.getByRole("dialog")).toContainText(
      "Các yêu cầu đang chờ khác sẽ bị từ chối.",
    );
    await pageA.screenshot({
      path: resolve(artifacts, "desktop-approve-warning.png"),
      fullPage: true,
    });
    await pageA
      .getByRole("dialog")
      .getByRole("button", { name: "Xác nhận", exact: true })
      .click();
    await expect(
      pageA.getByText("Chờ bàn giao", { exact: true }),
    ).toBeVisible();
    await pageA
      .getByRole("button", { name: "Xác nhận bàn giao →", exact: true })
      .click();
    await pageA
      .getByRole("dialog")
      .getByRole("button", { name: "Xác nhận", exact: true })
      .click();
    await expect(pageA.getByText("Đã trao lại", { exact: true })).toBeVisible();
    const [[final]] = await query(
      pool,
      "SELECT c.status AS claim_status, i.status AS item_status FROM claims c JOIN items i ON i.item_id=c.item_id WHERE c.claim_id=?",
      [claimRow.claim_id],
    );
    assert.deepEqual(
      { ...final },
      { claim_status: "COMPLETED", item_status: "RETURNED" },
    );
    await pageB.goto(`${url}/yeu-cau-cua-toi`);
    await expect(pageB.getByText("Đã bàn giao", { exact: true })).toBeVisible();
    await pageB.reload();
    await expect(pageB.getByText("Đã bàn giao", { exact: true })).toBeVisible();
    await pageA.locator('summary[aria-label="Menu tài khoản"]').click();
    await pageA.getByRole("button", { name: "Đăng xuất", exact: true }).click();
    assert.equal(
      await pageA.evaluate(() => sessionStorage.getItem("findit.session")),
      null,
    );
    await pageA.goto(`${url}/yeu-cau-cua-toi`);
    await expect(pageA).toHaveURL(/dang-nhap\?next=/);
    // Create isolated fixtures through the real API, then exercise actual UI pagination.
    const pagingKeyword = `BrowserPaging${Date.now()}`;
    for (let index = 0; index < 13; index++) {
      const response = await pageB.request.post(`${url}/api/items`, {
        headers: { Authorization: `Bearer ${otherToken}` },
        data: {
          title: `${pagingKeyword} ${String(index).padStart(2, "0")}`,
          type: "FOUND",
          categoryId,
          locationId,
          eventDate: "2026-10-15",
          description: "Pagination fixture",
        },
      });
      assert.equal(response.status(), 201);
    }
    await pageB.goto(`${url}/?keyword=${pagingKeyword}`);
    await expect(pageB.locator(".item-card")).toHaveCount(12);
    await pageB.getByRole("button", { name: "Sau →", exact: true }).click();
    await expect(pageB.locator(".item-card")).toHaveCount(1);
    assert.equal(new URL(pageB.url()).searchParams.get("page"), "2");
    await pageB
      .getByRole("button", { name: "Đồ nhặt được", exact: true })
      .click();
    assert.ok(!new URL(pageB.url()).searchParams.has("page"));
    await pageB.locator(".filter-toggle").click();
    await pageB.getByLabel("Sắp xếp", { exact: true }).selectOption("oldest");
    await expect(pageB.locator(".item-card h3").first()).toHaveText(
      `${pagingKeyword} 00`,
    );
    assert.ok(
      await pageB.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    // The real JWT middleware rejects a corrupted session; the client must erase it.
    await pageB.evaluate(() =>
      sessionStorage.setItem("findit.session", "invalid-token"),
    );
    await pageB.goto(`${url}/yeu-cau-cua-toi`);
    await expect(pageB).toHaveURL(/dang-nhap\?next=/);
    assert.equal(
      await pageB.evaluate(() => sessionStorage.getItem("findit.session")),
      null,
    );
    assert.ok(!(await pageB.locator("body").innerText()).includes(proof));
    assert.deepEqual(errors, [], "No uncaught browser errors");
    await anonymous.close();
    await a.close();
    await b.close();
    const { extendedBrowserCheck } =
      await import("./extended-browser-check.mjs");
    await extendedBrowserCheck({
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
    });
    console.log(
      "Browser: desktop/mobile, registration, upload recovery, inactive lookup edit, matching, search, modal keyboard, claim duplicate/privacy, handover, nested refresh, logout and invalid JWT cleanup verified.",
    );
    const { aiUiBrowserCheck } = await import("./ai-ui-browser-check.mjs");
    await aiUiBrowserCheck({
      browser,
      url,
      categoryId,
      locationId,
      pool,
      query,
      artifacts,
    });
  } finally {
    await browser?.close();
    await new Promise((done) => {
      server.close(done);
      server.closeAllConnections();
    });
  }
}
