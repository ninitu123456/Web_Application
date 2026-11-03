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
      <section className="auth-story">
        <span className="eyebrow">KẾT NỐI ĐỂ TRAO LẠI</span>
        <h1>
          Đồ vật đi lạc.
          <br />
          <span>Niềm tin ở lại.</span>
        </h1>
        <p>
          Một bài đăng nhỏ có thể giúp ai đó tìm lại thứ quan trọng với mình.
        </p>
        <div className="story-note">
          <span aria-hidden="true">↗</span>
          <p>
            Cùng xây dựng một khuôn viên
            <br />
            tử tế và gắn kết hơn.
          </p>
        </div>
      </section>
      <section className="panel auth-panel">
        <span className="eyebrow">CHÀO MỪNG ĐẾN FINDIT</span>
        <h2>{register ? "Tạo tài khoản" : "Đăng nhập"}</h2>
        <p className="muted">
          {register
            ? "Bắt đầu kết nối với cộng đồng trong trường."
            : "Đăng nhập để đăng bài và nhận lại đồ vật."}
        </p>
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
          <Input
            label="Mật khẩu"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={register ? "new-password" : "current-password"}
            required
          />
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
