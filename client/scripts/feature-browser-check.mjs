import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
export async function featureBrowserCheck({
  url,
  emailA,
  emailB,
  passwordA,
  passwordB,
  conversation,
  reset,
  pool,
  query,
  sent,
}) {
  assert.ok(process.env.FINDIT_ISOLATED_DATADIR);
  const browser = await chromium.launch({
    channel: process.env.FINDIT_BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  const artifacts = fileURLToPath(
    new URL("../../.cache/feature-browser/", import.meta.url),
  );
  await mkdir(artifacts, { recursive: true });
  try {
    const desktop = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const a = await desktop.newPage(),
      b = await mobile.newPage();
    const errors = [];
    for (const page of [a, b]) {
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("https://**/*", (route) => route.abort());
      page.setDefaultTimeout(10000);
    }
    await b.goto(url + "/dang-ky");
    await b.getByLabel("Họ và tên").fill("Người kiểm thử");
    await b
      .getByLabel("Email", { exact: true })
      .fill("browser-confirm@example.test");
    await b.getByLabel("Mật khẩu", { exact: true }).fill("password123");
    await b
      .getByLabel("Nhập lại mật khẩu", { exact: true })
      .fill("different123");
    await b
      .getByRole("button", { name: "Tạo tài khoản →", exact: true })
      .click();
    await expect(b.getByRole("alert")).toHaveText(
      "Mật khẩu xác nhận không khớp.",
    );
    await b.getByRole("button", { name: "Hiện mật khẩu", exact: true }).click();
    await expect(b.getByLabel("Mật khẩu", { exact: true })).toHaveAttribute(
      "type",
      "text",
    );
    await b
      .getByLabel("Nhập lại mật khẩu", { exact: true })
      .fill("password123");
    await b.screenshot({
      path: artifacts + "/mobile-registration.png",
      fullPage: true,
    });
    await b
      .getByRole("button", { name: "Tạo tài khoản →", exact: true })
      .click();
    await expect(b).toHaveURL(/dang-nhap/);
    const login = async (page, email, password) => {
      await page.goto(url + "/dang-nhap");
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
      await page
        .getByRole("button", { name: "Đăng nhập →", exact: true })
        .click();
      await expect(page).toHaveURL(url + "/");
    };
    await login(a, emailA, passwordA);
    await login(b, emailB, passwordB);
    await a.goto(`${url}/tin-nhan?hoi-thoai=${conversation}`);
    await b.goto(`${url}/tin-nhan?hoi-thoai=${conversation}`);
    await expect(a.getByText("Đã kết nối", { exact: true })).toBeVisible();
    await expect(b.getByText("Đã kết nối", { exact: true })).toBeVisible();
    await a.getByLabel("Tin nhắn", { exact: true }).fill("Xin chào từ desktop");
    await a.getByRole("button", { name: "Gửi", exact: true }).click();
    await expect(
      b.locator(".chat-bubble p", { hasText: "Xin chào từ desktop" }),
    ).toBeVisible();
    await b
      .getByLabel("Tin nhắn", { exact: true })
      .fill("<img src=x onerror=alert(1)>");
    await b.getByRole("button", { name: "Gửi", exact: true }).click();
    await expect(
      b.locator(".chat-bubble.mine p", {
        hasText: "<img src=x onerror=alert(1)>",
      }),
    ).toBeVisible();
    assert.equal(await a.locator(".chat-bubble img").count(), 0);
    assert.equal(
      await b.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await a.screenshot({
      path: artifacts + "/desktop-chat.png",
      fullPage: true,
    });
    await b.screenshot({
      path: artifacts + "/mobile-chat.png",
      fullPage: true,
    });
    const { chatLayoutCheck } = await import("./chat-layout-check.mjs");
    await chatLayoutCheck({
      page: b,
      url,
      conversation,
      pool,
      query,
      artifacts,
    });
    await b.goto(url + "/quen-mat-khau");
    await expect(
      b.getByRole("heading", { name: "Quên mật khẩu?" }),
    ).toBeVisible();
    // Fresh token from test mail transport, never real SMTP or production data.
    await query(
      pool,
      "DELETE FROM password_reset_tokens WHERE user_id=(SELECT user_id FROM users WHERE email=?)",
      [emailB],
    );
    await reset.forgot({ email: emailB });
    const token = sent.at(-1).text.match(/#token=([a-f0-9]{64})/)[1];
    await b.goto(`${url}/dat-lai-mat-khau#token=${token}`);
    await expect(b).toHaveURL(url + "/dat-lai-mat-khau");
    await b
      .getByLabel("Mật khẩu mới", { exact: true })
      .fill("Browser-new-password123");
    await b
      .getByLabel("Nhập lại mật khẩu mới", { exact: true })
      .fill("Browser-new-password123");
    await b
      .getByRole("button", { name: "Lưu mật khẩu mới", exact: true })
      .click();
    await expect(b).toHaveURL(url + "/dang-nhap");
    assert.equal(
      await b.evaluate(() => sessionStorage.getItem("findit.session")),
      null,
    );
    assert.deepEqual(errors, []);
    console.log(
      "Feature browser PASS: confirmation, visibility toggle, realtime text/XSS, mobile overflow, fragment removal and reset logout.",
    );
  } finally {
    await browser.close();
  }
}
