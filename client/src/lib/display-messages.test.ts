import { describe, expect, it } from "vitest";
import { ApiError, errorText } from "./api";
import { apiErrorText } from "./error-messages";
import {
  activityDetailLabel,
  statusGroups,
  statusLabel,
} from "./display-labels";

describe("safe, actionable error messages", () => {
  it("distinguishes login, missing authentication and invalid sessions", () => {
    expect(apiErrorText(401, "Thông tin đăng nhập không hợp lệ")).toContain(
      "kiểm tra email và mật khẩu",
    );
    expect(
      apiErrorText(401, "Unauthorized", {
        path: "/auth/login",
        authenticated: false,
        method: "POST",
      }),
    ).toContain("kiểm tra email và mật khẩu");
    expect(
      apiErrorText(401, "Chưa xác thực hoặc token không hợp lệ", {
        path: "/claims/mine",
        authenticated: true,
        method: "GET",
      }),
    ).toBe("Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.");
    expect(apiErrorText(401, "Unauthorized")).toBe(
      "Vui lòng đăng nhập để thực hiện thao tác này.",
    );
  });
  it.each([
    [
      403,
      "Không có quyền truy cập",
      "Bạn không có quyền thực hiện thao tác này.",
    ],
    [
      403,
      "Tài khoản không được phép truy cập",
      "Tài khoản này hiện không được phép truy cập FindIt.",
    ],
    [
      403,
      "ADMIN liên quan phải nhờ quản trị viên khác xử lý",
      "Bạn là chủ bài hoặc đã gửi yêu cầu nhận đồ cho bài này. Vui lòng nhờ quản trị viên khác xử lý.",
    ],
    [
      409,
      "Bạn đã tạo Claim cho Item này",
      "Bạn đã gửi yêu cầu nhận đồ cho bài đăng này. Vui lòng kiểm tra trong Yêu cầu đã gửi.",
    ],
    [
      409,
      "Địa chỉ email đã tồn tại trong hệ thống",
      "Email này đã được đăng ký. Vui lòng đăng nhập hoặc dùng email khác.",
    ],
    [
      409,
      "Hệ thống phải duy trì ít nhất một ADMIN đang hoạt động",
      "Không thể đình chỉ quản trị viên đang hoạt động cuối cùng.",
    ],
    [
      400,
      "Thao tác chỉ hợp lệ khi Item đang mở",
      "Bạn chỉ có thể thực hiện thao tác này khi bài đăng đang mở.",
    ],
    [
      503,
      "Hệ thống xử lý ảnh đang bận",
      "Hệ thống xử lý ảnh đang bận. Vui lòng chờ rồi thử lại.",
    ],
  ])(
    "preserves the business reason for %s / %s",
    (status, message, expected) => {
      expect(errorText(new ApiError(status, message))).toBe(expected);
    },
  );
  it.each([400, 401, 403, 404, 409, 413, 422, 429, 500, 502, 503, 418])(
    "never echoes unknown server details (%s)",
    (status) => {
      for (const message of [
        "SELECT password_hash FROM users; secret=abc",
        "Error: stack\n at /server/index.js:20",
        "JWT expired",
        "Thông tin đăng nhập không hợp lệ secret=abc",
        "__proto__",
        "constructor",
      ]) {
        const output = errorText(new ApiError(status, message));
        expect(output).not.toContain(message);
        expect(output).not.toMatch(
          /SQL|SELECT|stack|secret|JWT|token|\/server/,
        );
      }
    },
  );
  it("does not mislabel a server failure even if its message resembles a known input error", () => {
    expect(apiErrorText(500, "Dữ liệu yêu cầu không hợp lệ")).toContain(
      "FindIt tạm thời gặp sự cố",
    );
    expect(errorText(new Error("secret=abc"))).toBe(
      "Đã xảy ra lỗi. Vui lòng thử lại.",
    );
    expect(errorText(null)).toBe("Đã xảy ra lỗi. Vui lòng thử lại.");
  });
  it("warns about uncertain writes without suggesting an input correction", () => {
    for (const status of [0, 500, 502, 503]) {
      const context = { path: "/items", authenticated: true, method: "POST" };
      expect(apiErrorText(status, "Unknown", context)).toContain(
        "kiểm tra kết quả trước khi gửi lại",
      );
      expect(
        apiErrorText(status, "Unknown", { ...context, method: "GET" }),
      ).not.toContain("gửi lại");
    }
    expect(
      apiErrorText(
        503,
        "Chưa thể hoàn tất xóa ảnh; tác vụ đã được lưu để thử lại",
      ),
    ).toContain("bạn không cần gửi lại");
  });
});

describe("labels retain their entity context", () => {
  it("distinguishes pending reports from pending claims and post types from post status", () => {
    expect(statusLabel("PENDING", "report")).toBe("Chờ xem xét");
    expect(statusLabel("PENDING", "claim")).toBe("Chờ duyệt");
    expect(statusLabel("FOUND", "itemType")).toBe("Đồ nhặt được");
    expect(statusLabel("FOUND", "item")).toBe("Chưa xác định");
    for (const [group, labels] of Object.entries(statusGroups)) {
      for (const value of Object.keys(labels)) {
        expect(
          statusLabel(value, group as keyof typeof statusGroups),
        ).not.toMatch(/^[A-Z_]+$/);
      }
    }
    expect(statusLabel("FUTURE_STATUS", "item")).toBe("Chưa xác định");
    expect(statusLabel("__proto__", "claim")).toBe("Chưa xác định");
  });
  it("translates audit state and decisions without changing entered reasons or references", () => {
    expect(activityDetailLabel("previousStatus", "PENDING", "REPORT")).toBe(
      "Chờ xem xét",
    );
    expect(activityDetailLabel("status", "APPROVED", "CLAIM")).toBe(
      "Đã chấp thuận",
    );
    expect(activityDetailLabel("decision", "APPROVE", "CLAIM")).toBe(
      "Chấp thuận",
    );
    expect(activityDetailLabel("source", "ADMIN_RESOLVE", "CLAIM")).toBe(
      "Quản trị viên giải quyết tranh chấp",
    );
    expect(
      activityDetailLabel(
        "reason",
        "Giữ nguyên OPEN, Claim và emoji 😀",
        "ITEM",
      ),
    ).toBe("Giữ nguyên OPEN, Claim và emoji 😀");
    expect(activityDetailLabel("itemId", "123", "CLAIM")).toBe("#123");
    expect(activityDetailLabel("autoRejectedClaimCount", 2, "CLAIM")).toBe("2");
    expect(activityDetailLabel("automatic", true, "CLAIM")).toBe("Có");
    expect(activityDetailLabel("source", "SELECT secret", "CLAIM")).toBe(
      "Chưa xác định",
    );
    expect(activityDetailLabel("itemId", { sql: "internal" }, "CLAIM")).toBe(
      "Chưa xác định",
    );
  });
});
