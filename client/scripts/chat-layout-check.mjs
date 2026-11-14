import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

export async function chatLayoutCheck({
  page,
  url,
  conversation,
  pool,
  query,
  artifacts,
}) {
  const [[sender]] = await query(
    pool,
    "SELECT user_low id FROM conversations WHERE conversation_id=?",
    [conversation],
  );
  const text =
    "Lịch sử dài: " +
    "Nội dung tin nhắn để kiểm tra cuộn và bố cục. ".repeat(20);
  for (let i = 0; i < 65; i++)
    await query(
      pool,
      "INSERT INTO messages(conversation_id,sender_id,client_id,content,created_at) VALUES(?,?,?,?,UTC_TIMESTAMP())",
      [conversation, sender.id, randomUUID(), text + i],
    );
  await page.goto(url + "/tin-nhan?hoi-thoai=" + conversation);
  await expect(
    page.locator(".chat-bubble p").filter({ hasText: "Lịch sử dài:" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tin nhắn cũ hơn", exact: true }),
  ).toBeVisible();
  for (const [width, height] of [
    [360, 844],
    [390, 844],
    [390, 480],
    [768, 900],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page
      .getByLabel("Tin nhắn", { exact: true })
      .fill("Bản nháp kiểm tra bố cục");
    if (width <= 760) await page.evaluate(() => scrollTo(0, 0));
    else await page.locator(".chat-compose").scrollIntoViewIfNeeded();
    for (const end of [false, true]) {
      await page
        .locator(".chat-history")
        .evaluate(
          (element, end) =>
            (element.scrollTop = end ? element.scrollHeight : 0),
          end,
        );
      await expect
        .poll(
          () =>
            page.locator(".chat-compose").evaluate((form) =>
              Array.from(form.querySelectorAll("textarea,button")).every(
                (element) => {
                  const b = element.getBoundingClientRect(),
                    x = b.x + b.width / 2,
                    y = b.y + b.height / 2,
                    hit = document.elementFromPoint(x, y);
                  return (
                    x >= 0 &&
                    x < innerWidth &&
                    y >= 0 &&
                    y < innerHeight &&
                    (hit === element || element.contains(hit))
                  );
                },
              ),
            ),
          {
            message:
              "Chat composer hit targets remain unobscured at " +
              width +
              "x" +
              height,
          },
        )
        .toBe(true);
    }
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: resolve(
        artifacts,
        "chat-hit-test-" + width + "x" + height + ".png",
      ),
    });
  }
  await page.getByLabel("Tin nhắn", { exact: true }).fill("");
  await page.setViewportSize({ width: 390, height: 844 });
  console.log(
    "Chat layout PASS: long history/text, focus, history scroll, resize/short viewport and composer hit tests at 360/390/768/1440px. Physical keyboard/safe-area devices remain unverified.",
  );
}
