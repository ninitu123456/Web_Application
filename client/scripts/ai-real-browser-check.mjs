import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { resolve } from "node:path";

export async function realAiBrowser({ url, email, password, artifacts }) {
  const browser = await chromium.launch({
    channel: process.env.FINDIT_BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    context.setDefaultTimeout(15000);
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === url
        ? route.continue()
        : route.abort(),
    );
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url + "/dang-nhap");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Đăng nhập →", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: "Bài của tôi", exact: true }).first(),
    ).toBeVisible();
    return {
      async upload(itemId, images) {
        await page.goto(url + `/do-vat/${itemId}/sua`);
        await expect(
          page.getByRole("heading", {
            name: "Chỉnh sửa bài đăng",
            exact: true,
          }),
        ).toBeVisible();
        await page.locator('input[type="file"]').setInputFiles(images);
        const uploaded = page.waitForResponse(
          (response) =>
            response.url().endsWith(`/api/items/${itemId}/images`) &&
            response.request().method() === "POST",
        );
        await page
          .getByRole("button", { name: "Lưu thay đổi →", exact: true })
          .click();
        assert.equal((await uploaded).status(), 201);
        await expect(page).toHaveURL(url + `/do-vat/${itemId}`);
      },
      async suggestions(itemId, expected, screenshot) {
        await page.goto(url + `/do-vat/${itemId}`);
        const panel = page.locator(".visual-suggestions");
        await expect(
          panel.getByRole("heading", { name: "Giống về hình ảnh" }),
        ).toBeVisible();
        await expect(panel.locator(".visual-suggestion-card")).toHaveCount(
          expected.length,
        );
        for (const [index, item] of expected.entries()) {
          const card = panel.locator(".visual-suggestion-card").nth(index);
          await expect(card.locator("h3")).toHaveText(item.title);
          await expect(card.locator(".similarity-band")).toHaveText(
            item.cosineScore >= 0.85
              ? "Rất giống"
              : item.cosineScore >= 0.7
                ? "Khá giống"
                : "Có thể liên quan",
          );
          await expect(card).not.toContainText(item.cosineScore.toFixed(3));
          await expect(card.getByRole("img")).toBeVisible();
          await card.getByRole("img").scrollIntoViewIfNeeded();
          await expect
            .poll(() =>
              card
                .getByRole("img")
                .evaluate((image) => image.complete && image.naturalWidth > 0),
            )
            .toBe(true);
        }
        await expect(panel.getByText(/Dữ liệu minh họa/)).toHaveCount(0);
        if (!expected.length)
          await expect(
            panel.getByText("Chưa có gợi ý hình ảnh phù hợp", { exact: true }),
          ).toBeVisible();
        if (screenshot)
          for (const width of [390, 1440]) {
            await page.setViewportSize({ width, height: 1000 });
            assert.ok(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
            );
            await page.screenshot({
              path: resolve(artifacts, `real-clip-${width}.png`),
              fullPage: true,
            });
          }
      },
      async close() {
        try {
          assert.deepEqual(errors, []);
        } finally {
          await browser.close();
        }
      },
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}
