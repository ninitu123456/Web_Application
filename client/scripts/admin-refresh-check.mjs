import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { resolve } from "node:path";

// Fault/empty fixtures are confined to the isolated browser test, never app code.
export async function adminRefreshCheck({ page, url, artifacts, reportId }) {
  assert.ok(process.env.FINDIT_ISOLATED_DATADIR);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${url}/quan-tri`);
  await expect(
    page.getByRole("heading", { name: "Tổng quan", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".admin-donut")).toBeVisible();
  assert.equal(
    await page.locator(".header").count(),
    0,
    "Public header is absent in admin",
  );
  await expect(
    page.getByRole("link", { name: /báo cáo đang xem xét/ }),
  ).toHaveAttribute("href", "/quan-tri/bao-cao?status=REVIEWING");
  await page.locator(".admin-chart-point").first().focus();
  await expect(page.locator(".admin-chart-point").first()).toHaveAttribute(
    "data-tooltip",
    /thao tác/,
  );
  await page
    .getByText("Xem bảng số liệu", { exact: true })
    .click();
  await expect(page.locator(".admin-data-table table")).toBeVisible();
  await page.screenshot({
    path: resolve(artifacts, "desktop-admin-dashboard.png"),
    fullPage: true,
  });
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Dashboard fits ${width}px`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: resolve(artifacts, "mobile-admin-dashboard.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${url}/quan-tri/bao-cao?status=RESOLVED&page=1`);
  const record = page.locator(
    `a[href="/quan-tri/bao-cao/${reportId}?status=RESOLVED&page=1"]`,
  );
  await record.click();
  await expect(
    page
      .locator(".admin-report-detail")
      .getByRole("heading", { name: `Báo cáo #${reportId}`, exact: true }),
  ).toBeVisible();
  await expect(page.locator(".admin-report-detail h2").first()).toBeFocused();
  await page.screenshot({
    path: resolve(artifacts, "desktop-admin-reports.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(
    page
      .locator(".admin-report-detail .badge")
      .filter({ hasText: "Đã giải quyết" }),
  ).toBeVisible();
  assert.equal(
    await page
      .getByRole("button", { name: "Bắt đầu xem xét", exact: true })
      .count(),
    0,
    "Terminal report cannot be reopened",
  );
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({
    path: resolve(artifacts, "mobile-admin-reports.png"),
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "← Báo cáo vi phạm", exact: true })
    .click();
  await expect(
    page.getByLabel("Trạng thái báo cáo", { exact: true }),
  ).toHaveValue("RESOLVED");
  await expect(page.locator(".admin-report-list")).toBeFocused();
  assert.equal(new URL(page.url()).searchParams.get("page"), "1");
  await page.goBack();
  await expect(
    page
      .locator(".admin-report-detail")
      .getByRole("heading", { name: `Báo cáo #${reportId}`, exact: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(
    page.getByLabel("Trạng thái báo cáo", { exact: true }),
  ).toHaveValue("RESOLVED");

  await page.goto(`${url}/quan-tri/bao-cao/${reportId}?status=RESOLVED&page=2`);
  await expect(
    page
      .locator(".admin-report-detail")
      .getByRole("heading", { name: `Báo cáo #${reportId}`, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "← Báo cáo vi phạm", exact: true })
    .click();
  assert.equal(
    new URL(page.url()).searchParams.get("page"),
    "2",
    "Record return retains later list pages",
  );
  await page
    .getByLabel("Trạng thái báo cáo", { exact: true })
    .selectOption("PENDING");
  assert.equal(
    new URL(page.url()).searchParams.get("page"),
    null,
    "Changing the status resets pagination",
  );
  await page.route("**/api/admin/dashboard", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ success: false }),
    }),
  );
  await page.goto(`${url}/quan-tri`);
  await expect(
    page.getByRole("alert").filter({ hasText: "Chưa thể tải nội dung" }),
  ).toBeVisible();
  await page.unroute("**/api/admin/dashboard");
  await page.getByRole("button", { name: "Thử tải lại", exact: true }).click();
  await expect(page.locator(".admin-donut")).toBeVisible();
  await page.route("**/api/admin/dashboard", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const data = body.data;
    data.users = { total: 0, active: 0, suspended: 0 };
    for (const key of ["items", "claims", "reports"]) {
      for (const field of Object.keys(data[key])) {
        if (field !== "byStatus") data[key][field] = 0;
      }
      for (const status of Object.keys(data[key].byStatus))
        data[key].byStatus[status] = 0;
    }
    data.matches.total = 0;
    data.categories = [];
    data.recentActivity = [];
    await route.fulfill({ response, json: body });
  });
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Chưa có hoạt động trong khoảng dữ liệu này",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".admin-donut strong")).toHaveText("0");
  assert.doesNotMatch(await page.locator("main").innerText(), /NaN|Infinity/);
  await expect(
    page.getByRole("heading", {
      name: "Chưa có dữ liệu danh mục",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: resolve(artifacts, "mobile-admin-dashboard-empty.png"),
    fullPage: true,
  });
  await page.unroute("**/api/admin/dashboard");
  await page.setViewportSize({ width: 1440, height: 1000 });
}
