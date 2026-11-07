import { PasswordInput } from "../components/PasswordInput";
import { useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth, safeNext } from "../lib/auth";
import { api, errorText } from "../lib/api";
import { validEmail } from "../lib/validation";
import { Button, Input, useToast } from "../components/ui";
export function AuthPage({ register = false }: { register?: boolean }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  if (auth.user) return <Navigate to={next} replace />;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    if (!validEmail(email)) {
      setError("Vui lòng nhập email hợp lệ, tối đa 255 ký tự.");
      return;
    }
    if (new TextEncoder().encode(password).length > 72) {
      setError("Mật khẩu quá dài. Vui lòng rút ngắn.");
      return;
    }
    if (Array.from(password).length < (register ? 8 : 1)) {
      setError(
        register
          ? "Sử dụng ít nhất 8 ký tự cho mật khẩu."
          : "Vui lòng nhập mật khẩu.",
      );
      return;
    }
    if (register && (!name.trim() || Array.from(name.trim()).length > 150)) {
      setError("Họ tên cần từ 1 đến 150 ký tự.");
      return;
    }
    if (register && password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (register) {
        await api("/auth/register", {
          method: "POST",
          body: {
            fullName: name.trim(),
            email: email.trim().toLowerCase(),
            password,
            confirmPassword,
          },
          auth: false,
        });
        toast("Đăng ký thành công. Bạn có thể đăng nhập.");
        navigate(`/dang-nhap?next=${encodeURIComponent(next)}`, {
          replace: true,
        });
      } else {
        await auth.login(email.trim().toLowerCase(), password);
        navigate(next, { replace: true });
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="panel auth-panel">
        <h1>{register ? "Tạo tài khoản" : "Đăng nhập"}</h1>
        <form onSubmit={submit}>
          {register && (
            <Input
              label="Họ và tên"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
            />
          )}
          <Input
            label="Email"
            type="text"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <PasswordInput
            label="Mật khẩu"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={register ? "new-password" : "current-password"}
            required
          />
          {register && (
            <PasswordInput
              label="Nhập lại mật khẩu"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          )}
          {!register && (
            <p>
              <Link to="/quen-mat-khau">Quên mật khẩu?</Link>
            </p>
          )}
          {register && (
            <small className="muted">Sử dụng ít nhất 8 ký tự.</small>
          )}
          {(error || auth.error) && (
            <p className="inline-error" role="alert">
              {error || auth.error}
            </p>
          )}
          <Button className="full" disabled={busy}>
            {busy
              ? "Đang xử lý…"
              : register
                ? "Tạo tài khoản →"
                : "Đăng nhập →"}
          </Button>
        </form>
        <p className="auth-switch">
          {register ? "Đã có tài khoản?" : "Chưa có tài khoản?"}{" "}
          <Link
            to={`${register ? "/dang-nhap" : "/dang-ky"}?next=${encodeURIComponent(next)}`}
          >
            {register ? "Đăng nhập" : "Đăng ký ngay"}
          </Link>
        </p>
      </section>
    </div>
  );
}
