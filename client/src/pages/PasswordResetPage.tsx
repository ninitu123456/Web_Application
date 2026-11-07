import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, errorText } from "../lib/api";
import { useAuth } from "../lib/auth";
import { validEmail } from "../lib/validation";
import { Button, Input, useToast } from "../components/ui";
import { PasswordInput } from "../components/PasswordInput";

// Remove the fragment before any API call and retain it only in component memory.
let resetToken =
  new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
if (window.location.pathname === "/dat-lai-mat-khau" && window.location.hash)
  window.history.replaceState(null, "", window.location.pathname);
export function PasswordResetPage({ reset = false }: { reset?: boolean }) {
  const [token] = useState(() => {
    const value = resetToken;
    return value;
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const auth = useAuth(),
    navigate = useNavigate(),
    toast = useToast();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    setError("");
    setMessage("");
    if (!reset && !validEmail(email)) {
      setError("Vui lòng nhập email hợp lệ.");
      return;
    }
    if (reset && !/^[a-f0-9]{64}$/.test(token)) {
      setError(
        "Liên kết không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu liên kết mới.",
      );
      return;
    }
    if (
      reset &&
      (Array.from(password).length < 8 ||
        new TextEncoder().encode(password).length > 72)
    ) {
      setError("Mật khẩu cần ít nhất 8 ký tự và tối đa 72 byte.");
      return;
    }
    if (reset && password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const response = await api(
        reset ? "/auth/reset-password" : "/auth/forgot-password",
        {
          method: "POST",
          auth: false,
          body: reset
            ? { token, password, confirmPassword }
            : { email: email.trim().toLowerCase() },
        },
      );
      if (reset) {
        resetToken = "";
        auth.logout();
        toast("Đã đặt lại mật khẩu. Vui lòng đăng nhập lại.");
        navigate("/dang-nhap", { replace: true });
      } else
        setMessage(response.message || "Yêu cầu khôi phục đã được tiếp nhận.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="panel auth-panel reset-panel">
      <span className="eyebrow">FINDIT · TÀI KHOẢN</span>
      <h1>{reset ? "Đặt lại mật khẩu" : "Quên mật khẩu?"}</h1>
      <p className="muted">
        {reset
          ? "Tạo mật khẩu mới để tiếp tục kết nối."
          : "Nhập email của bạn để yêu cầu liên kết khôi phục có hiệu lực 15 phút."}
      </p>
      <form onSubmit={submit}>
        {reset ? (
          <>
            <PasswordInput
              label="Mật khẩu mới"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            <PasswordInput
              label="Nhập lại mật khẩu mới"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </>
        ) : (
          <Input
            label="Email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
        <Button className="full" disabled={busy}>
          {busy
            ? "Đang xử lý…"
            : reset
              ? "Lưu mật khẩu mới"
              : message
                ? "Yêu cầu gửi lại liên kết"
                : "Gửi yêu cầu khôi phục"}
        </Button>
      </form>
      {reset && (
        <p>
          <Link to="/quen-mat-khau">Yêu cầu liên kết mới</Link>
        </p>
      )}
      <p>
        <Link to="/dang-nhap">← Về trang đăng nhập</Link>
      </p>
    </section>
  );
}
