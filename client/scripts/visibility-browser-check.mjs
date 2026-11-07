import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { resolve } from "node:path";

export async function visibilityBrowserCheck({
  browser,
  page,
  adminPage,
  url,
  artifacts,
  found,
  request,
  userToken,
  adminToken,
}) {
  assert.ok(process.env.FINDIT_ISOLATED_DATADIR);
  const item = await found(userToken, `VisibilityBrowser${Date.now()}`);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await context.route("https://**/*", (route) => route.abort());
  const outside = await context.newPage();
  const errors = [];
  outside.on("pageerror", (error) => errors.push(error.message));
  try {
    await adminPage.goto(`${url}/quan-tri/bai-dang/${item.id}`);
    const hide = adminPage.getByRole("button", {
      name: "Gỡ khỏi công khai",
      exact: true,
    });
    await expect(hide).toBeEnabled();
    await hide.click();
    const dialog = adminPage.getByRole("dialog");
    await expect(dialog).toContainText(
      "Người ngoài sẽ không tìm thấy hoặc mở được bài",
    );
    await dialog
      .getByRole("button", { name: "Xác nhận quyết định", exact: true })
      .click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Lý do xử lý")).toHaveValue("");
    await dialog.getByLabel("Lý do xử lý").fill("Gỡ nội dung kiểm thử vi phạm");
    await adminPage.setViewportSize({ width: 360, height: 800 });
    assert.ok(
      await adminPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await adminPage.screenshot({
      path: resolve(artifacts, "mobile-admin-hide-confirm.png"),
      fullPage: true,
    });
    await dialog
      .getByRole("button", { name: "Xác nhận quyết định", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(
      adminPage.getByRole("button", {
        name: "Khôi phục hiển thị",
        exact: true,
      }),
    ).toBeEnabled();
    await expect(
      adminPage.getByRole("link", { name: "Xem công khai ↗", exact: true }),
    ).toHaveCount(0);
    await adminPage.reload();
    await expect(
      adminPage.getByRole("button", {
        name: "Khôi phục hiển thị",
        exact: true,
      }),
    ).toBeEnabled();
    await outside.goto(`${url}/?keyword=${item.title}`);
    await expect(outside.locator(".item-card")).toHaveCount(0);
    await expect(outside.locator(".state.empty")).toBeVisible();
    await outside.goto(`${url}/do-vat/${item.id}`);
    await expect(outside.getByRole("alert")).toBeVisible();
    assert.ok(
      !(await outside.locator("body").innerText()).includes(item.title),
    );
    await page.goto(`${url}/do-vat/${item.id}`);
    await expect(
      page.getByRole("heading", { name: item.title, exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Bài đã được quản trị viên gỡ" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Chỉnh sửa bài ↗", exact: true }),
    ).toHaveCount(0);
    await page.goto(`${url}/bai-dang-cua-toi`);
    await expect(
      page.locator(".item-card").filter({ hasText: item.title }),
    ).toContainText("Đã gỡ khỏi công khai");
    await adminPage.goto(`${url}/quan-tri/bai-dang?visibility=HIDDEN`);
    await expect(adminPage.getByLabel("Hiển thị", { exact: true })).toHaveValue(
      "HIDDEN",
    );
    await expect(adminPage.locator("tbody")).toContainText(item.title);
    await adminPage.goto(`${url}/quan-tri/bai-dang/${item.id}`);
    await adminPage
      .getByRole("button", { name: "Khôi phục hiển thị", exact: true })
      .click();
    await dialog
      .getByLabel("Lý do xử lý")
      .fill("Đã kiểm tra và cho phép hiển thị");
    const target = `**/api/admin/items/${item.id}/visibility`;
    await adminPage.route(target, (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ success: false }),
      }),
    );
    await dialog
      .getByRole("button", { name: "Xác nhận quyết định", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(dialog.getByLabel("Lý do xử lý")).toHaveValue(
      "Đã kiểm tra và cho phép hiển thị",
    );
    assert.equal(
      (
        await request(
          page,
          adminToken,
          `/admin/items/${item.id}`,
          undefined,
          "GET",
        )
      ).json.data.visibility,
      "HIDDEN",
    );
    await adminPage.unroute(target);
    // The server commits, but the response is lost. Refresh must not turn a
    // restore confirmation into a hide command on a subsequent click.
    await adminPage.route(target, async (route) => {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ success: false }),
      });
    });
    await dialog
      .getByRole("button", { name: "Xác nhận quyết định", exact: true })
      .click();
    await expect(
      dialog.getByRole("heading", {
        name: "Xác nhận khôi phục hiển thị",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Xác nhận quyết định", exact: true }),
    ).toBeDisabled();
    await expect(dialog).toContainText(
      "Bài hiện đã ở chế độ hiển thị được yêu cầu",
    );
    await adminPage.unroute(target);
    await dialog
      .getByRole("button", { name: "Đóng hộp thoại", exact: true })
      .click();
    await expect(
      adminPage.getByRole("button", { name: "Gỡ khỏi công khai", exact: true }),
    ).toBeEnabled();
    await outside.goto(`${url}/do-vat/${item.id}`);
    await expect(
      outside.getByRole("heading", { name: item.title, exact: true }),
    ).toBeVisible();
    await adminPage.goto(
      `${url}/quan-tri/nhat-ky?entityType=ITEM&entityId=${item.id}`,
    );
    await expect(adminPage.locator("tbody")).toContainText(
      "Gỡ bài khỏi công khai",
    );
    await expect(adminPage.locator("tbody")).toContainText(
      "Khôi phục hiển thị bài",
    );
    await expect(adminPage.locator("tbody")).toContainText(
      "Gỡ nội dung kiểm thử vi phạm",
    );
    await adminPage.screenshot({
      path: resolve(artifacts, "mobile-admin-visibility-history.png"),
      fullPage: true,
    });
    const own = await found(adminToken, "Admin own visibility fixture");
    await adminPage.goto(`${url}/quan-tri/bai-dang/${own.id}`);
    await expect(
      adminPage.getByRole("button", { name: "Gỡ khỏi công khai", exact: true }),
    ).toBeDisabled();
    assert.equal(errors.length, 0);
  } finally {
    await context.close();
    await adminPage.setViewportSize({ width: 1440, height: 1000 });
  }
}
