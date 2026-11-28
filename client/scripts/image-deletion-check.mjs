import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
const gate = () => {
  let release;
  const promise = new Promise((done) => {
    release = done;
  });
  return { promise, release };
};
export async function imageDeletionCheck({
  browser,
  url,
  ownerEmail,
  password,
  categoryId,
  locationId,
  pool,
  query,
}) {
  assert.ok(process.env.FINDIT_ISOLATED_DATADIR);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const png = await sharp({
    create: { width: 64, height: 64, channels: 3, background: "#8cad64" },
  })
    .png()
    .toBuffer();
  await context.route("https://mock.invalid/**", (r) =>
    r.fulfill({ status: 200, contentType: "image/png", body: png }),
  );
  await context.route("https://fonts.**/**", (r) =>
    r.fulfill({ status: 200, contentType: "text/css", body: "" }),
  );
  const failure = (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        message: "Injected image operation failure",
      }),
    });
  let deletes = 0;
  page.on("request", (r) => {
    if (r.method() === "DELETE" && /\/images\//.test(r.url())) deletes++;
  });
  try {
    const email = "delete-" + randomUUID() + "@example.test";
    const registered = await page.request.post(url + "/api/auth/register", {
      data: {
        fullName: "Deletion fixture",
        email,
        password,
        confirmPassword: password,
      },
    });
    assert.equal(registered.status(), 201);
    await page.goto(url + "/dang-nhap");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Đăng nhập →", exact: true })
      .click();
    await expect(page).toHaveURL(url + "/");
    const token = await page.evaluate(() =>
      sessionStorage.getItem("findit.session"),
    );
    async function request(path, body, method = "POST") {
      const response = await page.request.fetch(url + "/api" + path, {
        method,
        headers: { Authorization: "Bearer " + token },
        ...(body ? { data: body } : {}),
      });
      assert.ok(response.ok());
      return (await response.json()).data;
    }
    const item = await request("/items", {
      type: "LOST",
      title: "Deletion regression " + randomUUID(),
      categoryId,
      locationId,
      eventDate: "2026-11-14",
      description: "Synthetic deletion fixture",
    });
    const detail = url + "/api/items/" + item.id;
    const edit = url + "/do-vat/" + item.id + "/sua";
    const imagePattern = detail + "/images/*";
    const dbIds = async () =>
      (
        await query(
          pool,
          "SELECT image_id FROM item_images WHERE item_id=? ORDER BY image_id",
          [item.id],
        )
      )[0].map((r) => Number(r.image_id));
    const savedButtons = () =>
      page.getByRole("button", { name: "Xóa ảnh đã lưu", exact: true });
    const confirm = async (double = false) => {
      const button = page
        .getByRole("dialog")
        .getByRole("button", { name: "Xác nhận", exact: true });
      if (double)
        await button.evaluate((node) => {
          node.click();
          node.click();
        });
      else await button.click();
    };
    const beginDelete = async () => savedButtons().first().click();
    const idle = async () => expect(page.getByRole("dialog")).toHaveCount(0);
    const matchesDb = async () => {
      const ids = await dbIds();
      await expect(savedButtons()).toHaveCount(ids.length);
      const visible = await page
        .locator(".image-previews [data-image-id]")
        .evaluateAll((nodes) =>
          nodes.map((n) => Number(n.dataset.imageId)).sort((a, b) => a - b),
        );
      assert.deepEqual(
        visible,
        ids,
        "Each verified backend ID appears exactly once",
      );
      return ids;
    };
    await page.goto(edit);
    await expect(
      page.getByRole("heading", { name: "Sửa tin đăng", exact: true }),
    ).toBeVisible();
    await page.evaluate(() => {
      const create = URL.createObjectURL,
        revoke = URL.revokeObjectURL;
      window.deletionUrls = { created: [], revoked: [] };
      URL.createObjectURL = (...args) => {
        const value = create(...args);
        window.deletionUrls.created.push(value);
        return value;
      };
      URL.revokeObjectURL = (value) => {
        window.deletionUrls.revoked.push(value);
        revoke(value);
      };
    });
    const names = [
      "kept-a.png",
      "kept-b.png",
      "kept-c.png",
      "kept-d.png",
      "failed.png",
    ];
    const held = names.slice(0, 4).map(() => gate());
    let accepted = 0;
    await page.route(detail + "/images", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const index = names.findIndex((n) =>
        route
          .request()
          .postDataBuffer()
          ?.includes(Buffer.from('filename="' + n + '"')),
      );
      if (index === 4) return failure(route);
      assert.ok(index >= 0);
      const response = await route.fetch();
      assert.equal(response.status(), 201);
      accepted++;
      await held[index].promise;
      await route.fulfill({ response });
    });
    await page
      .getByLabel("Thêm ảnh", { exact: true })
      .setInputFiles(
        names.map((name) => ({ name, mimeType: "image/png", buffer: png })),
      );
    await page
      .getByRole("button", { name: "Lưu thay đổi →", exact: true })
      .click();
    await expect.poll(() => accepted).toBe(4);
    held[0].release();
    await expect(page.locator('[data-upload-status="saved"]')).toHaveCount(1);
    await expect(savedButtons().first()).toBeDisabled();
    await savedButtons()
      .first()
      .evaluate((node) => node.click());
    assert.equal(deletes, 0, "Cannot delete while other uploads are in flight");
    for (const wait of held.slice(1)) wait.release();
    await expect(page.locator('[data-upload-status="saved"]')).toHaveCount(4);
    await expect(page.locator('[data-upload-status="failed"]')).toHaveCount(1);
    await expect(savedButtons().first()).toBeEnabled();
    const failedKey = await page
      .locator('[data-upload-status="failed"]')
      .getAttribute("data-upload-key");
    const removedUrls = [];
    async function interceptDelete(mode, wait) {
      await page.unroute(imagePattern);
      await page.route(imagePattern, async (route) => {
        if (route.request().method() !== "DELETE") return route.continue();
        if (wait) await wait.promise;
        if (mode === "retained") return failure(route);
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        if (mode === "committed") return failure(route);
        return route.fulfill({ response });
      });
    }
    async function rememberRemoved() {
      removedUrls.push(
        await page
          .locator('[data-upload-status="saved"]')
          .first()
          .locator("img")
          .getAttribute("src"),
      );
    }
    // Before the fix this fails: DELETE committed, GET returns 3, queue still renders 4.
    await interceptDelete("committed");
    await rememberRemoved();
    await beginDelete();
    await confirm();
    await idle();
    await expect(savedButtons()).toHaveCount(3);
    await matchesDb();
    await expect(
      page.locator('[data-upload-key="' + failedKey + '"]').first(),
    ).toHaveAttribute("data-upload-status", "failed");
    // A 503 that did not delete must retain the exact image and offer a normal retry.
    await interceptDelete("retained");
    const retained = await dbIds();
    let confirmedReads = 0;
    await page.route(detail, (route) => {
      if (route.request().method() !== "GET") return route.continue();
      return ++confirmedReads === 1 ? route.continue() : failure(route);
    });
    await beginDelete();
    await confirm();
    await idle();
    await page.waitForLoadState("networkidle");
    assert.deepEqual(await matchesDb(), retained);
    await expect(
      page.locator('[data-upload-key="' + failedKey + '"]'),
    ).toHaveAttribute("data-upload-status", "failed");
    await page.unroute(detail);
    await expect(savedButtons().first()).toBeEnabled();
    await expect(
      page.getByRole("alert").filter({ hasText: "Ảnh vẫn còn" }),
    ).toBeVisible();
    // Two near-simultaneous confirmations issue one DELETE; retry then succeeds.
    const wait = gate();
    await interceptDelete("success", wait);
    await rememberRemoved();
    const before = deletes;
    await beginDelete();
    await confirm(true);
    await expect.poll(() => deletes).toBe(before + 1);
    await expect(savedButtons().first()).toBeDisabled();
    assert.deepEqual(await dbIds(), retained);
    wait.release();
    await idle();
    await matchesDb();
    assert.equal(deletes, before + 1);
    // A second, distinct delete receives a normal 2xx and cannot remove its neighbor.
    await interceptDelete("success");
    await rememberRemoved();
    await beginDelete();
    await confirm();
    await idle();
    assert.equal((await matchesDb()).length, 1);
    await page
      .getByLabel("Thêm ảnh", { exact: true })
      .setInputFiles([
        { name: "pending-local.png", mimeType: "image/png", buffer: png },
      ]);
    const localKey = await page
      .locator('[data-upload-status="pending"]')
      .getAttribute("data-upload-key");
    const localUrl = await page
      .locator('[data-upload-status="pending"] img')
      .getAttribute("src");
    // Both DELETE and reconciliation fail: explicit unknown state, no blind retry/write.
    await interceptDelete("committed");
    let readFails = true,
      reads = 0;
    await page.route(detail, (route) => {
      if (route.request().method() !== "GET") return route.continue();
      reads++;
      return readFails ? failure(route) : route.continue();
    });
    await rememberRemoved();
    await beginDelete();
    await confirm();
    await idle();
    assert.equal((await dbIds()).length, 0);
    await expect(
      page.getByRole("button", { name: "Thử đồng bộ lại ảnh", exact: true }),
    ).toBeVisible();
    await expect(savedButtons().first()).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Lưu thay đổi →", exact: true }),
    ).toBeDisabled();
    await expect(
      page
        .locator(".image-previews")
        .getByText("Chưa xác định kết quả xóa", { exact: true }),
    ).toHaveCount(1);
    await expect(
      page.locator('[data-upload-key="' + localKey + '"]'),
    ).toHaveAttribute("data-upload-status", "pending");
    await expect(
      page.locator('[data-upload-key="' + failedKey + '"]'),
    ).toHaveAttribute("data-upload-status", "failed");
    const deleteCount = deletes;
    await page
      .getByRole("button", { name: "Thử đồng bộ lại ảnh", exact: true })
      .click();
    await expect.poll(() => reads).toBeGreaterThan(1);
    await expect(
      page.getByRole("button", { name: "Thử đồng bộ lại ảnh", exact: true }),
    ).toBeEnabled();
    assert.equal(deletes, deleteCount);
    readFails = false;
    await page
      .getByRole("button", { name: "Thử đồng bộ lại ảnh", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Thử đồng bộ lại ảnh", exact: true }),
    ).toHaveCount(0);
    await matchesDb();
    await expect(
      page.locator('[data-upload-key="' + localKey + '"] img'),
    ).toHaveAttribute("src", localUrl);
    await expect(
      page.locator('[data-upload-key="' + failedKey + '"]'),
    ).toHaveAttribute("data-upload-status", "failed");
    const urls = await page.evaluate(() => window.deletionUrls);
    for (const value of removedUrls)
      assert.equal(
        urls.revoked.filter((u) => u === value).length,
        1,
        "Deleted object URL revoked exactly once",
      );
    assert.ok(
      !urls.revoked.includes(localUrl),
      "Pending local preview remains alive",
    );
    await page.unroute(detail);
    await page.reload();
    await expect(savedButtons()).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Sửa tin đăng", exact: true }),
    ).toBeVisible();
    // Stale GET from an abandoned form cannot overwrite a different Item form.
    const upload = await page.request.post(detail + "/images", {
      headers: { Authorization: "Bearer " + token },
      multipart: {
        images: { name: "stale.png", mimeType: "image/png", buffer: png },
      },
    });
    assert.equal(upload.status(), 201);
    const other = await request("/items", {
      type: "LOST",
      title: "Other deletion form " + randomUUID(),
      categoryId,
      locationId,
      eventDate: "2026-11-14",
      description: "Independent Item",
    });
    await page.reload();
    await expect(savedButtons()).toHaveCount(1);
    await interceptDelete("retained");
    const stale = gate();
    let readStarted = false;
    await page.route(detail, async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      const response = await route.fetch();
      readStarted = true;
      await stale.promise;
      await route.fulfill({ response }).catch(() => {});
    });
    await beginDelete();
    await confirm();
    await expect.poll(() => readStarted).toBe(true);
    await page.evaluate(
      (path) => {
        history.pushState(null, "", path);
        dispatchEvent(new PopStateEvent("popstate"));
      },
      "/do-vat/" + other.id + "/sua",
    );
    await expect(page.getByLabel("Tiêu đề", { exact: true })).toHaveValue(
      other.title,
    );
    stale.release();
    await expect(savedButtons()).toHaveCount(0);
    await expect(page.getByLabel("Tiêu đề", { exact: true })).toHaveValue(
      other.title,
    );
    assert.deepEqual(errors, []);
    console.log(
      "IMAGE_DELETION_BROWSER_PASS " +
        JSON.stringify({
          committed503: true,
          retained503: true,
          normal2xx: true,
          unknownGetFailure: true,
          syncRetry: true,
          serializedUploadDelete: true,
          doubleConfirmSingleDelete: true,
          localFilesPreserved: true,
          objectUrlsRevoked: true,
          reload: true,
          staleReadIgnored: true,
        }),
    );
  } finally {
    await context.close();
  }
}
