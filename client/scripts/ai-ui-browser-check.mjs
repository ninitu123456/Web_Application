import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import {
  CLIP_MODEL_ID,
  CLIP_MODEL_REVISION,
} from "../../server/ai-visual/config.js";
import { encodeEmbedding } from "../../server/ai-visual/embeddings.js";
import { createAiVisualSnapshotService } from "../../server/ai-visual/snapshot-service.js";

// Browser/API integration uses labelled fixture vectors, not real CLIP inference.
// Every write stays in the database created by the disposable MySQL runner.
export async function aiUiBrowserCheck({
  browser,
  url,
  categoryId,
  locationId,
  pool,
  query,
  artifacts,
}) {
  const [[identity]] = await query(
    pool,
    "SELECT DATABASE() AS db,@@datadir AS datadir,@@port AS port",
  );
  assert.match(identity.db, /^findit_test_[a-f0-9]{24}$/);
  assert.equal(
    resolve(identity.datadir),
    resolve(process.env.FINDIT_ISOLATED_DATADIR),
  );
  assert.equal(Number(identity.port), Number(process.env.DB_PORT));
  assert.ok(![3306, 3311].includes(Number(identity.port)));
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  context.setDefaultTimeout(15000);
  await context.route("https://**/*", (route) => route.abort());
  await context.route("**/__ai-ui-fixture.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#eaf3d6"/><rect x="110" y="50" width="180" height="210" rx="40" fill="#184c3b"/><rect x="145" y="150" width="110" height="70" rx="15" fill="#a3bc84"/></svg>',
    }),
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const password = "Synthetic-local-AI-UI123!";
  const run = randomUUID();
  const api = async (path, { token, method = "GET", body } = {}) => {
    const response = await fetch(url + "/api" + path, {
      method,
      headers: {
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };
  try {
    const accounts = [];
    for (const name of ["owner", "finder"]) {
      const email = `ai-ui-${name}-${run}@example.test`;
      assert.equal(
        (
          await api("/auth/register", {
            method: "POST",
            body: {
              fullName: "Synthetic " + name,
              email,
              password,
              confirmPassword: password,
            },
          })
        ).status,
        201,
      );
      const login = await api("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      assert.equal(login.status, 200);
      accounts.push({ email, ...login.body.data });
    }
    const [owner, finder] = accounts;
    const items = [];
    for (const [index, account] of accounts.entries()) {
      const created = await api("/items", {
        method: "POST",
        token: account.token,
        body: {
          title: index
            ? "AI UI synthetic FOUND backpack"
            : "AI UI synthetic LOST backpack",
          description: "Fixture for redesigned UI integration only",
          type: index ? "FOUND" : "LOST",
          categoryId,
          locationId,
          eventDate: "2026-11-07",
          color: "Green",
        },
      });
      assert.equal(created.status, 201, created.body.message);
      items.push(created.body.data);
      await query(
        pool,
        "UPDATE items SET private_identifiers=? WHERE item_id=?",
        ["PRIVATE-AI-UI-DO-NOT-EXPOSE", created.body.data.id],
      );
      const [image] = await query(
        pool,
        "INSERT INTO item_images(item_id,image_url,cloudinary_public_id,created_at) VALUES(?,?,?,UTC_TIMESTAMP())",
        [
          created.body.data.id,
          url + "/__ai-ui-fixture.svg",
          "local-fixture/" + run + "/" + index,
        ],
      );
      await query(
        pool,
        "INSERT INTO item_image_embeddings(image_id,model_id,model_revision,dimensions,embedding_data,created_at) VALUES(?,?,?,512,?,UTC_TIMESTAMP())",
        [
          image.insertId,
          CLIP_MODEL_ID,
          CLIP_MODEL_REVISION,
          encodeEmbedding([1, ...Array(511).fill(0)]),
        ],
      );
      await query(
        pool,
        "INSERT INTO ai_visual_jobs(image_id,model_id,model_revision,status,attempts,available_at,created_at,updated_at) VALUES(?,?,?,'COMPLETED',1,UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())",
        [image.insertId, CLIP_MODEL_ID, CLIP_MODEL_REVISION],
      );
    }
    const [lost, found] = items;
    const insertCandidate = () =>
      query(
        pool,
        "INSERT INTO ai_visual_candidates(lost_item_id,found_item_id,model_id,model_revision,cosine_score,updated_at) VALUES(?,?,?,?,0.98,UTC_TIMESTAMP())",
        [lost.id, found.id, CLIP_MODEL_ID, CLIP_MODEL_REVISION],
      );
    await insertCandidate();
    assert.equal(
      (await api(`/items/${lost.id}/visual-suggestions`)).status,
      401,
    );
    assert.equal(
      (
        await api(`/items/${lost.id}/visual-suggestions`, {
          token: finder.token,
        })
      ).status,
      404,
    );
    const suggestions = await api(`/items/${lost.id}/visual-suggestions`, {
      token: owner.token,
    });
    assert.equal(suggestions.status, 200);
    assert.equal(suggestions.body.data[0].itemId, found.id);
    assert.ok(!JSON.stringify(suggestions.body).includes("PRIVATE-AI-UI"));
    await page.goto(url + `/dang-nhap?next=/do-vat/${lost.id}`);
    await page.screenshot({
      path: resolve(artifacts, "ai-ui-login.png"),
      fullPage: true,
    });
    await page.getByLabel("Email", { exact: true }).fill(owner.email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Đăng nhập →", exact: true })
      .click();
    const panel = page.locator(".visual-suggestions");
    await expect(
      panel.getByRole("heading", { name: "Vật phẩm có thể tương tự" }),
    ).toBeVisible();
    await expect(panel.getByText("0.980", { exact: true })).toBeVisible();
    await expect(panel.getByRole("note")).toContainText("Dữ liệu minh họa");
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `AI detail fits ${width}px`,
      );
      await expect(
        panel.getByRole("link", { name: "Xem bài đăng", exact: true }),
      ).toBeVisible();
      if (width === 390 || width === 1440)
        await panel.screenshot({
          path: resolve(artifacts, `ai-ui-panel-${width}.png`),
        });
      if (width === 390 || width === 1440)
        await page.screenshot({
          path: resolve(artifacts, `ai-ui-lost-${width}.png`),
          fullPage: true,
        });
    }
    await panel
      .getByRole("link", { name: "Xem bài đăng", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Nhận lại đồ như thế nào?" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Đây có thể là đồ của tôi →" }),
    ).toBeVisible();
    await expect(panel).toHaveCount(0);
    await page.screenshot({
      path: resolve(artifacts, "ai-ui-found-desktop.png"),
      fullPage: true,
    });
    const pattern = `**/api/items/${lost.id}/visual-suggestions`;
    let release;
    const gate = new Promise((done) => {
      release = done;
    });
    await page.route(
      pattern,
      async (route) => {
        await gate;
        await route.continue();
      },
      { times: 1 },
    );
    await page.goto(url + `/do-vat/${lost.id}`);
    await expect(panel.getByRole("status")).toBeVisible();
    await page.screenshot({
      path: resolve(artifacts, "ai-ui-loading.png"),
      fullPage: true,
    });
    release();
    await expect(panel.getByText("0.980", { exact: true })).toBeVisible();
    await query(pool, "DELETE FROM ai_visual_candidates WHERE lost_item_id=?", [
      lost.id,
    ]);
    await page.reload();
    await expect(
      panel.getByText("Chưa có gợi ý hình ảnh phù hợp", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: resolve(artifacts, "ai-ui-empty.png"),
      fullPage: true,
    });
    await insertCandidate();
    await page.route(
      pattern,
      (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            message: "Synthetic unavailable service",
          }),
        }),
      { times: 1 },
    );
    await page.reload();
    await expect(panel.getByRole("alert")).toBeVisible();
    await page.screenshot({
      path: resolve(artifacts, "ai-ui-error.png"),
      fullPage: true,
    });
    await panel.getByRole("button", { name: "Thử tải lại" }).click();
    await expect(panel.getByText("0.980", { exact: true })).toBeVisible();
    await query(
      pool,
      "INSERT INTO ai_visual_notification_preferences(user_id,enabled,updated_at) VALUES(?,TRUE,UTC_TIMESTAMP())",
      [owner.user.id],
    );
    for (const [role, userId, itemId] of [
      ["LOST_OWNER", owner.user.id, null],
      ["FOUND_OWNER", finder.user.id, null],
      ["LOST_ITEM", owner.user.id, lost.id],
      ["FOUND_ITEM", finder.user.id, found.id],
    ]) {
      await query(
        pool,
        "INSERT INTO ai_visual_demo_entities(run_id,user_id,item_id,entity_role,created_at) VALUES(?,?,?,?,UTC_TIMESTAMP())",
        [run, userId, itemId, role],
      );
    }
    const demo = createAiVisualSnapshotService(pool, {
      processingEnabled: true,
      demoNotificationsEnabled: true,
      demoMinCosine: 0.95,
    });
    assert.equal(await demo.processNext(), true);
    const shadow = createAiVisualSnapshotService(pool, {
      processingEnabled: true,
      shadowMode: true,
      demoNotificationsEnabled: true,
    });
    assert.equal(await shadow.deliverNextDemo(), false);
    assert.equal(await demo.deliverNextDemo(), true);
    assert.equal(await demo.deliverNextDemo(), false);
    const notifications = await api("/notifications", { token: owner.token });
    assert.equal(
      notifications.body.data.filter(
        (row) => row.type === "AI_VISUAL_SIMILAR_ITEM",
      ).length,
      1,
    );
    const [[delivered]] = await query(
      pool,
      "SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND type='AI_VISUAL_SIMILAR_ITEM'",
      [owner.user.id],
    );
    assert.equal(Number(delivered.n), 1);
    await page.goto(url + "/thong-bao");
    await expect(
      page.getByText(
        "Có vật phẩm có hình ảnh tương tự với bài đăng của bạn. Hãy kiểm tra thông tin để xác minh.",
        { exact: true },
      ),
    ).toBeVisible();
    await page.screenshot({
      path: resolve(artifacts, "ai-ui-notifications-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: resolve(artifacts, "ai-ui-notifications-mobile.png"),
      fullPage: true,
    });
    assert.deepEqual(errors, [], "No uncaught browser errors in integrated UI");
    console.log(
      "AI/UI browser PASS: real authenticated owner API, redesigned LOST/FOUND, 360–1440px, loading/empty/error/retry, private fixture vectors, safe demo notification and dedup. CLIP/Cloudinary are not rerun in this UI test.",
    );
  } catch (error) {
    await page
      .screenshot({
        path: resolve(artifacts, "ai-ui-failure.png"),
        fullPage: true,
      })
      .catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}
