import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  const storage = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());
describe("API contract and session boundaries", () => {
  it("keeps login failures and action permissions distinct from session expiry", async () => {
    const { api, errorText, setSession, sessionToken, onSessionExpired } =
      await import("./api");
    const expired = vi.fn();
    onSessionExpired(expired);
    setSession("current-account");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            message: "Thông tin đăng nhập không hợp lệ",
          }),
          { status: 401 },
        ),
      ),
    );
    const loginFailure = await api("/auth/login", {
      method: "POST",
      auth: false,
      body: { email: "test@example.test", password: "wrong" },
    }).catch((error: unknown) => error);
    expect(errorText(loginFailure)).toContain("kiểm tra email và mật khẩu");
    expect(sessionToken()).toBe("current-account");
    expect(expired).not.toHaveBeenCalled();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            message: "Không có quyền truy cập",
          }),
          { status: 403 },
        ),
      ),
    );
    const forbidden = await api("/claims/1/approve", { method: "PATCH" }).catch(
      (error: unknown) => error,
    );
    expect(errorText(forbidden)).toBe(
      "Bạn không có quyền thực hiện thao tác này.",
    );
    expect(sessionToken()).toBe("current-account");
    expect(expired).not.toHaveBeenCalled();
  });

  it("retains write context when the response is lost or is not JSON", async () => {
    const { api, errorText } = await import("./api");
    for (const fetcher of [
      vi.fn().mockRejectedValue(new Error("network secret")),
      vi.fn().mockResolvedValue(new Response("SQL secret", { status: 502 })),
    ]) {
      vi.stubGlobal("fetch", fetcher);
      const error = await api("/items", { method: "POST", body: {} }).catch(
        (error: unknown) => error,
      );
      expect(errorText(error)).toContain("kiểm tra kết quả trước khi gửi lại");
      expect(errorText(error)).not.toMatch(/SQL|secret/);
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });

  it("coalesces concurrent reads but refreshes after invalidation", async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    const { readResource, invalidate } = await import("./api");
    const first = readResource("/notifications/unread-count");
    const second = readResource("/notifications/unread-count");
    expect(fetcher).toHaveBeenCalledTimes(1);
    finish(
      new Response(JSON.stringify({ success: true, data: { unreadCount: 2 } })),
    );
    expect(await first).toEqual(await second);
    invalidate();
    const next = readResource("/notifications/unread-count");
    expect(fetcher).toHaveBeenCalledTimes(2);
    finish(
      new Response(JSON.stringify({ success: true, data: { unreadCount: 0 } })),
    );
    await next;
  });
  it("does not let an old account failure expire the next account", async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    const { api, setSession, sessionToken, onAccessDenied } =
      await import("./api");
    const denied = vi.fn();
    onAccessDenied(denied);
    setSession("A");
    const old = api("/users/me");
    setSession("B");
    finish(
      new Response(JSON.stringify({ success: false, message: "Suspended" }), {
        status: 403,
      }),
    );
    await expect(old).rejects.toMatchObject({ name: "AbortError" });
    expect(sessionToken()).toBe("B");
    expect(denied).not.toHaveBeenCalled();
  });
  it("omits empty query parameters while retaining numeric pagination", async () => {
    const { queryString } = await import("./api");
    expect(
      queryString({
        keyword: "",
        category: undefined,
        page: 2,
        limit: 10,
        type: "FOUND",
      }),
    ).toBe("?page=2&limit=10&type=FOUND");
  });
  it("does not set multipart Content-Type or replay failed mutations", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          message: "Dịch vụ ảnh chưa sẵn sàng",
        }),
        { status: 503 },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    const { api, setSession } = await import("./api");
    setSession("test-token");
    const body = new FormData();
    body.append(
      "images",
      new Blob(["image"], { type: "image/png" }),
      "image.png",
    );
    await expect(
      api("/items/1/images", { method: "POST", body }),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1].headers).toEqual({
      Authorization: "Bearer test-token",
    });
    expect(fetcher.mock.calls[0][1].body).toBe(body);
  });
  it("expires authenticated sessions on 401 and clears cached details", async () => {
    const { api, itemDetail, sessionToken, setSession, onSessionExpired } =
      await import("./api");
    setSession("old-token");
    const expired = vi.fn();
    onSessionExpired(expired);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { id: 1 } })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false, message: "Hết hạn" }), {
          status: 401,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { id: 1 } })),
      );
    vi.stubGlobal("fetch", fetcher);
    await itemDetail(1);
    await itemDetail(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(api("/users/me")).rejects.toMatchObject({ status: 401 });
    expect(sessionToken()).toBeNull();
    expect(expired).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("findit.session")).toBeNull();
    await itemDetail(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("ignores responses started by a previous account", async () => {
    let complete!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            complete = resolve;
          }),
      ),
    );
    const { api, setSession } = await import("./api");
    setSession("A");
    const request = api("/claims/mine");
    setSession("B");
    complete(
      new Response(JSON.stringify({ success: true, data: ["private-A"] })),
    );
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
});
