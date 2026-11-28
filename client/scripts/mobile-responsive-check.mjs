import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { Server } from "socket.io";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { installFixtures } from "./mobile-fixtures.mjs";

const baseline = process.argv.includes("--baseline");
const audit = process.argv.includes("--audit");
const client = fileURLToPath(new URL("../", import.meta.url));
const artifacts = fileURLToPath(
  new URL("../../presentation/screenshots/mobile-responsive/", import.meta.url),
);
await mkdir(artifacts, { recursive: true });
process.env.VITE_API_BASE_URL = "/api";
process.env.VITE_AI_VISUAL_SUGGESTIONS_ENABLED = "true";
const originals = new Map();
if (baseline) {
  for (const file of [
    "main.tsx",
    "components/Layout.tsx",
    "pages/ItemDetailPage.tsx",
    "pages/MessagesPage.tsx",
  ])
    originals.set(
      resolve(client, "src", file).replaceAll("\\", "/"),
      execFileSync("git", ["show", `origin/main:client/src/${file}`], {
        cwd: client,
        encoding: "utf8",
      }),
    );
}
const server = await createServer({
  root: client,
  plugins: [
    {
      name: "responsive-baseline",
      enforce: "pre",
      load(id) {
        return originals.get(id.split("?")[0]);
      },
    },
  ],
  server: { host: "127.0.0.1", port: 5174, strictPort: true },
});
const sockets = new Server(server.httpServer);
await server.listen();
const browser = await chromium.launch({
  channel: process.env.FINDIT_BROWSER_CHANNEL || "chrome",
  headless: true,
});
const results = [],
  errors = [];
const sizes = [
  [320, 700],
  [360, 800],
  [375, 812],
  [390, 844],
  [414, 896],
  [768, 1024],
  [1024, 768],
  [1440, 900],
];
const routes = [
  ["home", "/"],
  ["explore", "/kham-pha"],
  ["detail", "/do-vat/2"],
  ["ai-matching", "/do-vat/1"],
  ["item-form", "/dang-bai"],
  ["item-edit", "/do-vat/1/sua"],
  ["my-items", "/bai-dang-cua-toi"],
  ["saved", "/da-luu"],
  ["profile", "/ho-so"],
  ["claims", "/yeu-cau-cua-toi"],
  ["claim-review", "/do-vat/3?tab=claims"],
  ["chat-list", "/tin-nhan"],
  ["chat", "/tin-nhan?hoi-thoai=1"],
  ["notifications", "/thong-bao"],
  ["reports", "/bao-cao-cua-toi"],
  ["login", "/dang-nhap"],
  ["register", "/dang-ky"],
  ["reset", "/quen-mat-khau"],
  ["reset-token", "/dat-lai-mat-khau"],
  ["about", "/gioi-thieu"],
  ["contact", "/lien-he"],
  ["search-first", "/dang-bai/tim-truoc"],
  ["not-found", "/khong-ton-tai"],
  ["admin", "/quan-tri"],
  ["admin-items", "/quan-tri/bai-dang"],
  ["admin-item-detail", "/quan-tri/bai-dang/2"],
  ["admin-users", "/quan-tri/nguoi-dung"],
  ["admin-user-detail", "/quan-tri/nguoi-dung/2"],
  ["admin-claims", "/quan-tri/claims"],
  ["admin-reports", "/quan-tri/bao-cao"],
  ["admin-report-detail", "/quan-tri/bao-cao/1"],
  ["admin-activity", "/quan-tri/nhat-ky"],
  ["admin-lookups", "/quan-tri/danh-muc-dia-diem"],
  ["admin-contacts", "/quan-tri/lien-he"],
  ["admin-disputes", "/quan-tri/khieu-nai"],
];
try {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    hasTouch: true,
  });
  const requests = await installFixtures(context);
  let page = await context.newPage();
  const signedPage = page;
  const publicContext = await browser.newContext({
    reducedMotion: "reduce",
    hasTouch: true,
  });
  await installFixtures(publicContext, { authenticated: false });
  const publicPage = await publicContext.newPage();
  publicPage.on("pageerror", (error) => errors.push(error.message));
  publicPage.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  for (const [width, height] of process.argv.includes("--interactions-only")
    ? []
    : baseline || process.argv.includes("--quick")
      ? [
          [390, 844],
          [320, 700],
          [1440, 900],
        ]
      : sizes) {
    await page.setViewportSize({ width, height });
    for (const [name, path] of routes) {
      if (
        baseline &&
        ![
          "home",
          "explore",
          "detail",
          "ai-matching",
          "item-form",
          "claim-review",
          "chat",
          "admin",
        ].includes(name)
      )
        continue;
      page = [
        "home",
        "explore",
        "detail",
        "login",
        "register",
        "reset",
        "reset-token",
        "about",
        "contact",
        "search-first",
        "not-found",
      ].includes(name)
        ? publicPage
        : signedPage;
      await page.setViewportSize({ width, height });
      await page.goto("http://127.0.0.1:5174" + path);
      await page
        .locator("h1")
        .first()
        .waitFor({ state: "attached", timeout: 15000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(100);
      const geometry = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        offenders: [...document.querySelectorAll("body *")]
          .filter((el) => {
            if (!(el instanceof HTMLElement)) return false;
            const box = el.getBoundingClientRect();
            if (!box.width || box.right <= innerWidth + 1) return false;
            for (
              let parent = el.parentElement;
              parent;
              parent = parent.parentElement
            ) {
              if (
                ["auto", "scroll"].includes(
                  getComputedStyle(parent).overflowX,
                ) &&
                parent.scrollWidth > parent.clientWidth
              )
                return false;
            }
            return true;
          })
          .slice(0, 8)
          .map((el) => ({
            tag: el.tagName,
            class: el.className?.baseVal ?? el.className,
          })),
      }));
      results.push({ name, width, height, ...geometry });
      const shot =
        [
          "home",
          "explore",
          "detail",
          "ai-matching",
          "item-form",
          "claim-review",
          "chat",
          "admin",
        ].includes(name) && [320, 390, 1440].includes(width);
      if (shot) {
        await page.locator("img").evaluateAll((images) =>
          Promise.all(
            images.map((img) => {
              img.loading = "eager";
              return img.decode().catch(() => {});
            }),
          ),
        );
        await page.screenshot({
          path: resolve(
            artifacts,
            `${baseline ? "before" : "after"}-${name}-${width}.png`,
          ),
          fullPage: name !== "chat",
        });
      }
      if (geometry.scroll > width + 1)
        console.log("OVERFLOW", name, width, JSON.stringify(geometry));
      if (!baseline && !audit)
        expect(
          geometry.scroll,
          `${name} @ ${width}: ${JSON.stringify(geometry.offenders)}`,
        ).toBeLessThanOrEqual(width + 1);
    }
  }
  console.log(`Geometry PASS: ${results.length} route/viewport checks`);
  page = signedPage;
  if (!baseline && !audit) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("http://127.0.0.1:5174/kham-pha");
    await page
      .getByRole("button", { name: "Mở điều hướng", exact: true })
      .click();
    await expect(
      page.getByRole("navigation", { name: "Điều hướng chính" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("navigation", { name: "Điều hướng chính" }),
    ).toBeHidden();
    await page.getByRole("button", { name: /Mở bộ lọc/ }).click();
    await page.getByLabel("Danh mục", { exact: true }).selectOption("1");
    await expect(page).toHaveURL(/category=1/);
    await page.getByRole("button", { name: "Thu gọn", exact: true }).click();
    await page.getByLabel("Bạn đang tìm gì?").fill("Tai nghe");
    await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
    await expect(page).toHaveURL(/keyword=Tai/);
    await page.locator(".item-card .card-image").first().click();
    await expect(page).toHaveURL(/\/do-vat\//);
    for (const [width, height] of [
      [320, 700],
      [390, 844],
      [768, 1024],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto("http://127.0.0.1:5174/do-vat/2");
      await page
        .getByRole("button", { name: "Xem ảnh 2", exact: true })
        .click();
      await expect(page.locator(".gallery-count")).toHaveText("2 / 5");
      await page.locator(".gallery-main").focus();
      await page.keyboard.press("ArrowRight");
      await expect(page.locator(".gallery-count")).toHaveText("3 / 5");
      await page.locator(".gallery-main").dispatchEvent("touchstart", {
        touches: [{ identifier: 0, clientX: 240, clientY: 200 }],
      });
      await page.locator(".gallery-main").dispatchEvent("touchend", {
        changedTouches: [{ identifier: 0, clientX: 100, clientY: 210 }],
      });
      await expect(page.locator(".gallery-count")).toHaveText("4 / 5");
      await page.getByRole("button", { name: /Gửi yêu cầu nhận lại/ }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
      await page
        .getByLabel("Bằng chứng sở hữu", { exact: true })
        .fill("Bằng chứng giả lập, không chứa dữ liệu cá nhân.");
      await page.screenshot({
        path: resolve(artifacts, `after-claim-modal-${width}.png`),
      });
      await page.getByRole("button", { name: "Hủy", exact: true }).click();
      await page.goto("http://127.0.0.1:5174/do-vat/3?tab=claims");
      await page
        .getByRole("button", { name: "Chấp thuận →", exact: true })
        .first()
        .click();
      await expect(dialog).toBeVisible();
      await page.getByRole("button", { name: "Hủy", exact: true }).click();
      await page
        .getByRole("button", { name: "Đổi lịch hẹn", exact: true })
        .click();
      await expect(page.getByLabel("Thời gian", { exact: true })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width + 1);
      await page.goto("http://127.0.0.1:5174/dang-bai");
      await page
        .getByRole("button", { name: "Tiếp tục →", exact: true })
        .click();
      await expect(page.getByLabel("Tiêu đề", { exact: true })).toBeVisible();
      await page
        .getByRole("button", { name: "Xem trước →", exact: true })
        .click();
      await expect(page.getByLabel("Tiêu đề", { exact: true })).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width + 1);
      if (width <= 390)
        await page.screenshot({
          path: resolve(artifacts, `after-item-form-validation-${width}.png`),
          fullPage: true,
        });
      await page.goto("http://127.0.0.1:5174/tin-nhan?hoi-thoai=1");
      await page
        .getByLabel("Tin nhắn", { exact: true })
        .fill("Tin nhắn thử nghiệm");
      if (width > 760)
        await page.locator(".chat-compose").scrollIntoViewIfNeeded();
      await expect
        .poll(
          () =>
            page.locator(".chat-compose").evaluate(
              (form, width) =>
                [...form.querySelectorAll("textarea,button")].every((el) => {
                  const b = el.getBoundingClientRect(),
                    hit = document.elementFromPoint(
                      b.x + b.width / 2,
                      b.y + b.height / 2,
                    );
                  return (
                    b.width >= (width <= 760 ? 44 : 1) &&
                    b.height >= (width <= 760 ? 44 : 1) &&
                    b.y >= 0 &&
                    b.bottom <= innerHeight &&
                    !!hit &&
                    (el === hit || el.contains(hit))
                  );
                }),
              width,
            ),
          { message: `Composer usable at ${width}x${height}` },
        )
        .toBe(true);
      await page
        .getByRole("button", { name: "Gửi tin nhắn", exact: true })
        .click();
      await expect(page.getByLabel("Tin nhắn", { exact: true })).toHaveValue(
        "",
      );
      await expect(
        page.locator(".chat-bubble").filter({ hasText: "Tin nhắn thử nghiệm" }),
      ).toBeVisible();
      if (width <= 1100) {
        await page
          .getByRole("button", { name: "Mở thông tin trao đổi", exact: true })
          .click();
        await expect(
          page.getByRole("complementary", { name: "Thông tin trao đổi" }),
        ).toBeVisible();
        await page
          .getByRole("button", { name: "Đóng thông tin trao đổi", exact: true })
          .click();
      }
      if (width <= 760) {
        await page
          .getByRole("link", { name: "← Hội thoại", exact: true })
          .click();
        await expect(page.locator(".chat-list")).toBeVisible();
        await expect(page.locator(".chat-main")).toBeHidden();
      }
    }
    await page.setViewportSize({ width: 390, height: 480 });
    await page.goto("http://127.0.0.1:5174/tin-nhan?hoi-thoai=1");
    await page
      .getByLabel("Tin nhắn", { exact: true })
      .fill("Kiểm tra chiều cao khi bàn phím mở");
    await expect(
      page.getByRole("button", { name: "Gửi tin nhắn", exact: true }),
    ).toBeInViewport();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("http://127.0.0.1:5174/quan-tri");
    await page.getByRole("button", { name: "Mở điều hướng quản trị" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.goto("http://127.0.0.1:5174/quan-tri/bai-dang");
    const table = page.locator(".table-scroll").first();
    await expect(table.locator("tbody tr").first()).toBeVisible();
    expect(await table.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
      true,
    );
    expect(
      await table
        .locator("th")
        .evaluateAll((cells) =>
          cells.every((cell) => getComputedStyle(cell).display !== "none"),
        ),
    ).toBe(true);
    await table.focus();
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => table.evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(0);
    for (const mode of ["loading", "empty", "error", "processing"]) {
      const stateContext = await browser.newContext({
        viewport: { width: 320, height: 700 },
        reducedMotion: "reduce",
      });
      await installFixtures(stateContext, { mode });
      const statePage = await stateContext.newPage();
      statePage.on("pageerror", (error) => errors.push(error.message));
      await statePage.goto(
        "http://127.0.0.1:5174" +
          (mode === "processing" ? "/do-vat/1" : "/kham-pha"),
      );
      if (mode === "loading")
        await expect(
          statePage.getByRole("status", { name: "Đang tải đồ vật" }),
        ).toBeVisible();
      if (mode === "empty")
        await expect(
          statePage.getByText("Chưa tìm thấy đồ vật phù hợp", { exact: true }),
        ).toBeVisible();
      if (mode === "error")
        await expect(
          statePage
            .getByRole("button", { name: /Thử lại|Thử tải lại/ })
            .first(),
        ).toBeVisible();
      if (mode === "processing")
        await expect(
          statePage.getByText(/Ảnh đang được phân tích/),
        ).toBeVisible();
      expect(
        await statePage.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(321);
      await statePage.screenshot({
        path: resolve(artifacts, `after-state-${mode}-320.png`),
        fullPage: true,
      });
      await stateContext.close();
    }
    expect(
      requests.some(
        (r) => r.path === "/conversations/1/messages" && r.method === "POST",
      ),
    ).toBe(true);
  }
  console.log(
    JSON.stringify(
      {
        baseline,
        checks: results.length,
        overflows: results.filter((r) => r.scroll > r.width + 1),
        errors,
      },
      null,
      2,
    ),
  );
  await writeFile(
    resolve(artifacts, baseline ? "baseline.json" : "results.json"),
    JSON.stringify(
      { fixtures: true, results, errors, requests: requests.length },
      null,
      2,
    ),
  );
  if (!baseline) expect(errors).toEqual([]);
} finally {
  await browser.close();
  await new Promise((done) => sockets.close(done));
  await server.close();
}
