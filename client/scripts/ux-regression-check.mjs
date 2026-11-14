import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
const gate = () => {
  let release;
  const promise = new Promise((done) => {
    release = done;
  });
  return { promise, release };
};
export async function uxRegressionCheck({
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
  const directory = resolve(artifacts, "ux-regression");
  await mkdir(directory, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    hasTouch: true,
  });
  const peerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const adminContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage(),
    peer = await peerContext.newPage(),
    admin = await adminContext.newPage();
  const errors = [],
    httpErrors = [],
    socketErrors = [];
  const expectedFailures = new Set();
  const expectedFailureUrls = new Set();
  const png = await sharp({
    create: { width: 600, height: 360, channels: 3, background: "#d4f36b" },
  })
    .png()
    .toBuffer();
  for (const ctx of [context, peerContext, adminContext]) {
    ctx.setDefaultTimeout(15000);
    await ctx.route("https://mock.invalid/**", (route) =>
      route.fulfill({ status: 200, contentType: "image/png", body: png }),
    );
    await ctx.route("https://fonts.**/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/css", body: "" }),
    );
  }
  for (const current of [page, peer, admin]) {
    current.on("pageerror", (error) => errors.push(error.message));
    current.on("response", (response) => {
      if (
        response.status() >= 400 &&
        new URL(response.url()).pathname.startsWith("/socket.io/")
      ) {
        socketErrors.push("Partial harness has no Socket.IO transport");
        return;
      }
      if (
        response.status() >= 400 &&
        !expectedFailures.has(
          response.status() + ":" + new URL(response.url()).pathname,
        )
      )
        httpErrors.push({
          status: response.status(),
          path: new URL(response.url()).pathname,
        });
    });
    current.on("console", (message) => {
      if (message.type() === "error") {
        if (/WebSocket|socket\.io/.test(message.text()))
          socketErrors.push(message.text());
        else if (
          !expectedFailureUrls.has(message.location().url) &&
          !/fonts\./.test(message.location().url ?? "")
        )
          errors.push(message.text());
      }
    });
  }
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
  async function request(token, path, data, method = "POST") {
    const response = await page.request.fetch(url + "/api" + path, {
      method,
      headers: { Authorization: "Bearer " + token },
      ...(data === undefined ? {} : { data }),
    });
    const body = await response.json();
    assert.ok(response.ok(), `${method} ${path}: ${response.status()}`);
    return body.data;
  }
  const entry = (name) => ({ name, mimeType: "image/png", buffer: png });
  const next1 = () =>
    page.getByRole("button", { name: "Tiếp tục →", exact: true }).click();
  const next2 = () =>
    page.getByRole("button", { name: "Xem trước →", exact: true }).click();
  const back = () =>
    page.getByRole("button", { name: "← Quay lại", exact: true }).click();
  const noOverflow = async (current) =>
    assert.ok(
      await current.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  const notice = async (token, type, key) => {
    const [rows] = await query(
      pool,
      "SELECT notification_id,created_at FROM notifications WHERE user_id=(SELECT user_id FROM users WHERE email=?) AND type=? AND event_key=?",
      [token, type, key],
    );
    assert.equal(rows.length, 1);
    return rows[0];
  };
  async function openNotice(current, email, type, key) {
    const row = await notice(email, type, key);
    const [[position]] = await query(
      pool,
      "SELECT COUNT(*) total FROM notifications WHERE user_id=(SELECT user_id FROM users WHERE email=?) AND (created_at>? OR (created_at=? AND notification_id>?))",
      [email, row.created_at, row.created_at, row.notification_id],
    );
    await current.goto(
      `${url}/thong-bao?page=${Math.floor(Number(position.total) / 10) + 1}`,
    );
    const card = current.locator(
      `[data-notification-id="${row.notification_id}"]`,
    );
    await expect(card).toBeVisible();
    await card.locator(".notification-open").focus();
    await card.locator(".notification-open").press("Enter");
    return Number(row.notification_id);
  }
  async function readState(id, value) {
    await expect
      .poll(async () => {
        const [[row]] = await query(
          pool,
          "SELECT is_read FROM notifications WHERE notification_id=?",
          [id],
        );
        return Number(row.is_read);
      })
      .toBe(value);
  }
  try {
    const ownerToken = await login(page, ownerEmail);
    const peerEmail = `ux-${randomUUID()}@example.test`;
    const registered = await page.request.post(url + "/api/auth/register", {
      data: {
        fullName: "UX finder",
        email: peerEmail,
        password,
        confirmPassword: password,
      },
    });
    assert.equal(registered.status(), 201);
    const peerToken = await login(peer, peerEmail),
      adminToken = await login(admin, otherEmail);
    await page.goto(url + "/dang-bai");
    await page.evaluate(() => {
      const create = URL.createObjectURL,
        revoke = URL.revokeObjectURL;
      window.uxUrls = { created: [], revoked: [] };
      URL.createObjectURL = function (...args) {
        const url = create.apply(this, args);
        window.uxUrls.created.push(url);
        return url;
      };
      URL.revokeObjectURL = function (url) {
        window.uxUrls.revoked.push(url);
        return revoke.call(this, url);
      };
    });
    await page
      .getByLabel("Thêm ảnh", { exact: true })
      .setInputFiles([entry("a.png"), entry("b.png"), entry("c.png")]);
    await expect(page.locator('[data-upload-status="pending"]')).toHaveCount(3);
    await next1();
    await next2();
    const place = page.getByLabel("Địa điểm bị mất", { exact: true });
    await expect(place).toHaveAttribute("aria-invalid", "true");
    await place.focus();
    await place.press("Home");
    await place.press("ArrowDown");
    await place.press("Enter");
    await place.blur();
    const chosen = await place.inputValue();
    assert.ok(Number(chosen) > 0);
    await expect(place).toHaveAttribute("aria-invalid", "false");
    await page
      .getByLabel("Tiêu đề", { exact: true })
      .fill("UX green wallet " + randomUUID());
    const title = await page
      .getByLabel("Tiêu đề", { exact: true })
      .inputValue();
    await page
      .getByLabel("Danh mục", { exact: true })
      .selectOption(String(categoryId));
    await page.getByLabel("Ngày bị mất", { exact: true }).fill("2026-11-14");
    await page
      .getByLabel("Màu sắc (tùy chọn)", { exact: true })
      .fill("Xanh biển");
    await page
      .getByLabel("Mô tả đồ vật", { exact: true })
      .fill("Có case hình Stitch");
    await next2();
    const gallery = page.getByRole("region", {
      name: "Ảnh xem trước",
      exact: true,
    });
    await expect(gallery.getByRole("status")).toHaveText("1 / 3");
    await gallery
      .getByRole("button", { name: "Ảnh tiếp theo", exact: true })
      .click();
    await expect(gallery.getByRole("status")).toHaveText("2 / 3");
    await gallery.focus();
    await gallery.press("ArrowRight");
    await expect(gallery.getByRole("status")).toHaveText("3 / 3");
    await expect(page.locator(".preview-facts dt")).toHaveText([
      "Danh mục",
      "Màu sắc",
      "Địa điểm",
      "Ngày bị mất",
      "Mô tả đồ vật",
    ]);
    await expect(page.locator(".preview-facts dd").nth(1)).toHaveText(
      "Xanh biển",
    );
    await expect(page.locator(".preview-facts dd").last()).toHaveText(
      "Có case hình Stitch",
    );
    for (const width of [1440, 390, 360]) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      await noOverflow(page);
      await page.screenshot({
        path: resolve(directory, `preview-${width}.png`),
        fullPage: true,
      });
    }
    await gallery.evaluate((node) => {
      const first = new Touch({
        identifier: 0,
        target: node,
        clientX: 250,
        clientY: 100,
      });
      node.dispatchEvent(
        new TouchEvent("touchstart", { bubbles: true, touches: [first] }),
      );
      const last = new Touch({
        identifier: 0,
        target: node,
        clientX: 100,
        clientY: 105,
      });
      node.dispatchEvent(
        new TouchEvent("touchend", { bubbles: true, changedTouches: [last] }),
      );
    });
    await expect(gallery.getByRole("status")).toHaveText("1 / 3");
    await back();
    await expect(place).toHaveValue(chosen);
    await back();
    await page
      .getByRole("button", { name: "Bỏ ảnh chờ tải 3", exact: true })
      .click();
    await next1();
    await next2();
    await expect(gallery.getByRole("status")).toHaveText("1 / 2");
    await back();
    await back();
    await page
      .getByRole("button", { name: "Bỏ ảnh chờ tải 2", exact: true })
      .click();
    await next1();
    await next2();
    await expect(gallery.getByRole("button")).toHaveCount(0);
    await expect(gallery.getByAltText("Ảnh đồ vật 1")).toBeVisible();
    await back();
    await back();
    await page
      .getByRole("button", { name: "Bỏ ảnh chờ tải 1", exact: true })
      .click();
    const names = Array.from({ length: 5 }, (_, i) => `final-${i}.png`);
    await page
      .getByLabel("Thêm ảnh", { exact: true })
      .setInputFiles(names.map(entry));
    await next1();
    await next2();
    for (let i = 1; i <= 5; i++) {
      await expect(gallery.getByRole("status")).toHaveText(`${i} / 5`);
      await gallery
        .getByRole("button", { name: "Ảnh tiếp theo", exact: true })
        .click();
    }
    console.log("UX checkpoint: location and 1/2/3/5-image preview passed");
    let creates = 0,
      rejected = false;
    const held = new Map(names.map((name) => [name, gate()])),
      accepted = new Set();
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/items"
      )
        creates++;
    });
    await page.route("**/api/items/*/images", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const name = names.find((name) =>
        route
          .request()
          .postDataBuffer()
          ?.includes(Buffer.from(`filename="${name}"`)),
      );
      assert.ok(name);
      if (name === names[1] && !rejected) {
        rejected = true;
        expectedFailures.add("503:" + new URL(route.request().url()).pathname);
        expectedFailureUrls.add(route.request().url());
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            message: "Injected admission refusal",
          }),
        });
      }
      const response = await route.fetch();
      assert.equal(response.status(), 201);
      accepted.add(name);
      await held.get(name).promise;
      await route.fulfill({ response });
    });

    await page.getByRole("button", { name: "Đăng bài →", exact: true }).click();
    await expect.poll(() => accepted.size).toBe(4);
    await expect(page.locator('[data-upload-status="uploading"]')).toHaveCount(
      4,
    );
    // The server has accepted images; a held HTTP response must still show uploading.
    for (const index of [4, 2, 0, 3]) {
      held.get(names[index]).release();
      await expect(
        page.locator("[data-upload-status]").nth(index),
      ).toHaveAttribute("data-upload-status", "saved");
    }
    await expect(page.locator('[data-upload-status="failed"]')).toHaveCount(1);
    await page.screenshot({
      path: resolve(directory, "upload-partial-retry-360.png"),
      fullPage: true,
    });
    const itemId = Number(page.url().match(/do-vat\/(\d+)/)[1]);
    const [[beforeRetry]] = await query(
      pool,
      "SELECT COUNT(*) total FROM item_images WHERE item_id=?",
      [itemId],
    );
    assert.equal(Number(beforeRetry.total), 4);
    held.get(names[1]).release();
    await page
      .getByRole("button", { name: "Thử lại ảnh lỗi", exact: true })
      .click();
    await expect(page).toHaveURL(url + "/do-vat/" + itemId);

    const [[afterRetry]] = await query(
      pool,
      "SELECT COUNT(*) total FROM item_images WHERE item_id=?",
      [itemId],
    );
    assert.equal(Number(afterRetry.total), 5);
    assert.equal(creates, 1);
    const urls = await page.evaluate(() => window.uxUrls);
    assert.equal(
      new Set(urls.created).size,
      new Set(urls.revoked).size,
      "Every removed/unmounted object URL is revoked",
    );
    console.log(
      "UX checkpoint: out-of-order upload, retry, no duplicate Item/images and URL cleanup passed",
    );
    const own = await request(ownerToken, "/items/" + itemId, undefined, "GET");
    assert.equal(own.locationId, Number(chosen));
    const found = await request(peerToken, "/items", {
      type: "FOUND",
      title,
      categoryId,
      locationId: Number(chosen),
      eventDate: "2026-11-14",
      color: "Xanh biển",
      description: "Có case hình Stitch",
    });
    const [[pair]] = await query(
      pool,
      "SELECT match_id FROM matches WHERE lost_item_id=? AND found_item_id=?",
      [itemId, found.id],
    );
    assert.ok(pair);
    const suggestionsGate = gate();
    await page.route(`**/api/items/${itemId}/suggestions?*`, async (route) => {
      await suggestionsGate.promise;
      await route.continue();
    });
    const matchNotice = await openNotice(
      page,
      ownerEmail,
      "NEW_MATCH",
      "NEW_MATCH:" + pair.match_id,
    );
    await expect(page).toHaveURL(new RegExp(`/do-vat/${itemId}\\?`));
    await readState(matchNotice, 0);
    suggestionsGate.release();
    await readState(matchNotice, 1);
    await page.unroute(`**/api/items/${itemId}/suggestions?*`);
    await expect(page.locator("#suggestions-title")).toBeFocused();
    for (const width of [1440, 390, 360]) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      await noOverflow(page);
      await page.screenshot({
        path: resolve(directory, `matching-arrival-${width}.png`),
        fullPage: true,
      });
    }
    const peerMatch = await openNotice(
      peer,
      peerEmail,
      "NEW_MATCH",
      "NEW_MATCH:" + pair.match_id,
    );
    await readState(peerMatch, 1);
    await expect(peer).toHaveURL(new RegExp(`/do-vat/${found.id}\\?`));
    // A valid link whose destination fails must remain unread until a successful reload.
    await query(
      pool,
      "UPDATE notifications SET is_read=FALSE WHERE notification_id=?",
      [matchNotice],
    );
    const itemPattern = url + "/api/items/" + itemId;
    await page.route(itemPattern, async (route) => {
      expectedFailures.add("503:/api/items/" + itemId);
      expectedFailureUrls.add(route.request().url());
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          message: "Injected destination load failure",
        }),
      });
    });
    await openNotice(
      page,
      ownerEmail,
      "NEW_MATCH",
      "NEW_MATCH:" + pair.match_id,
    );
    await expect(
      page.getByRole("heading", { name: "Chưa thể tải nội dung", exact: true }),
    ).toBeVisible();
    await readState(matchNotice, 0);
    await page.unroute(itemPattern);
    await page.reload();
    await readState(matchNotice, 1);
    const [legacy] = await query(
      pool,
      "INSERT INTO notifications(user_id,type,message,is_read,created_at) VALUES(?,'NEW_MATCH','Legacy missing metadata',FALSE,UTC_TIMESTAMP())",
      [own.userId],
    );
    const legacyPath = "/api/notifications/" + legacy.insertId + "/target";
    expectedFailures.add("404:" + legacyPath);
    expectedFailureUrls.add(url + legacyPath);
    await page.goto(url + "/thong-bao");
    const legacyRow = page.locator(
      '[data-notification-id="' + legacy.insertId + '"]',
    );
    await legacyRow.locator(".notification-open").click();
    await expect(page.getByRole("alert")).toBeVisible();
    assert.ok(new URL(page.url()).pathname === "/thong-bao");
    await readState(legacy.insertId, 0);
    const calls = [];
    page.on("request", (r) => {
      if (/\/suggestions(?:\?|$)/.test(r.url())) calls.push(r.url());
    });
    await page.goto(url + "/do-vat/" + found.id);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Gợi ý cho bạn", exact: true }),
    ).toHaveCount(0);
    assert.equal(calls.length, 0);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      await noOverflow(page);
      await page.screenshot({
        path: resolve(directory, `non-owner-found-${width}.png`),
        fullPage: true,
      });
    }
    await admin.goto(url + "/do-vat/" + itemId);
    await expect(
      admin.getByRole("tab", { name: "Gợi ý cho bạn", exact: true }),
    ).toHaveCount(0);
    for (const token of [peerToken, adminToken])
      for (const endpoint of ["suggestions", "matches", "visual-suggestions"]) {
        const denied = await page.request.get(
          url + "/api/items/" + itemId + "/" + endpoint,
          { headers: { Authorization: "Bearer " + token } },
        );
        assert.equal(denied.status(), 404);
      }
    const claim = await request(ownerToken, `/items/${found.id}/claims`, {
      proofDescription: "Private UX proof " + randomUUID(),
    });
    const incoming = await openNotice(
      peer,
      peerEmail,
      "NEW_CLAIM",
      "NEW_CLAIM:" + claim.id,
    );
    await readState(incoming, 1);
    await peer
      .getByRole("button", { name: "Chấp thuận →", exact: true })
      .click();
    await peer
      .getByRole("dialog")
      .getByRole("button", { name: "Xác nhận", exact: true })
      .click();
    await expect(peer.getByRole("dialog")).toHaveCount(0);
    const approved = await openNotice(
      page,
      ownerEmail,
      "CLAIM_APPROVED",
      "CLAIM_APPROVED:" + claim.id,
    );
    await expect(page).toHaveURL(new RegExp(`/do-vat/${found.id}\\?`));
    await readState(approved, 1);
    await expect(
      page.getByRole("button", { name: "Liên hệ người nhặt", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Gợi ý cho bạn", exact: true }),
    ).toHaveCount(0);
    for (const width of [1440, 390, 360]) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      const contact = page.getByRole("button", {
        name: "Liên hệ người nhặt",
        exact: true,
      });
      await contact.evaluate((node) =>
        node.scrollIntoView({ block: "center" }),
      );
      assert.ok(
        await contact.evaluate((node) => {
          const box = node.getBoundingClientRect();
          const hit = document.elementFromPoint(
            box.x + box.width / 2,
            box.y + box.height / 2,
          );
          return node.contains(hit) && box.height >= 44;
        }),
        "Contact CTA hit-test and touch size",
      );
      await noOverflow(page);
      await page.screenshot({
        path: resolve(directory, `claim-contact-${width}.png`),
        fullPage: true,
      });
    }
    await page
      .getByRole("button", { name: "Liên hệ người nhặt", exact: true })
      .click();
    await expect(page).toHaveURL(/\/tin-nhan\?hoi-thoai=/);
    await expect(
      page.getByRole("heading", { name: "UX finder", exact: true }),
    ).toBeVisible();
    await request(peerToken, "/claims/" + claim.id + "/complete", {}, "PATCH");
    const completed = await openNotice(
      page,
      ownerEmail,
      "CLAIM_COMPLETED",
      "CLAIM_COMPLETED:" + claim.id,
    );
    await readState(completed, 1);
    await expect(page.locator("#claim-" + claim.id)).toBeFocused();
    // One browser context switches accounts: previously fetched private suggestions cannot persist.
    await page.locator('summary[aria-label="Menu tài khoản"]').click();
    await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
    await page.goto(url + "/do-vat/" + itemId);
    await expect(page.locator(".unified-suggestions")).toHaveCount(0);
    await login(page, peerEmail, "/do-vat/" + itemId);
    await expect(page.locator(".unified-suggestions")).toHaveCount(0);
    await expect(
      page.getByRole("tab", { name: "Gợi ý cho bạn", exact: true }),
    ).toHaveCount(0);
    await noOverflow(page);
    assert.deepEqual(httpErrors, [], "No unexpected application HTTP errors");
    assert.deepEqual(
      errors,
      [],
      "No unexpected application page/console errors",
    );
    console.log(
      "UX_BROWSER_PASS " +
        JSON.stringify({
          viewports: [1440, 390, 360],
          uploadImages: 5,
          createdItems: creates,
          objectUrlsRevoked: true,
          matchingBothOwners: true,
          approvedClaimFoundContact: true,
          history: true,
          nonOwnerAdminGuestDenied: true,
          unexpectedHttp: 0,
          unexpectedConsole: 0,
          excludedHarnessSocketErrors: socketErrors.length,
        }),
    );
  } finally {
    await context.close();
    await peerContext.close();
    await adminContext.close();
  }
}
