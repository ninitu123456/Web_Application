import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, errorText, invalidate } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useResource } from "../lib/hooks";
import type { User } from "../lib/types";
import { Button, Input, useToast, Loading, ErrorState } from "../components/ui";
export function ProfilePage() {
  const { user, updateUser } = useAuth();
  const current = useResource<User>("/users/me");
  useEffect(() => {
    if (current.data) {
      setName(current.data.data.fullName);
      updateUser(current.data.data);
    }
  }, [current.data, updateUser]);
  const [name, setName] = useState(user?.fullName || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const toast = useToast();
  async function save(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    if (!name.trim() || Array.from(name.trim()).length > 150) {
      setError("Họ tên cần từ 1 đến 150 ký tự.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api<User>("/users/me", {
        method: "PATCH",
        body: { fullName: name.trim() },
      });
      updateUser(result.data);
      setName(result.data.fullName);
      invalidate();
      toast("Đã cập nhật họ tên.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (current.loading) return <Loading />;
  if (current.error)
    return <ErrorState error={current.error} retry={invalidate} />;
  return (
    <section className="page-section narrow">
      <h1>Hồ sơ cá nhân</h1>
      <form className="panel" onSubmit={save}>
        <Input
          label="Họ và tên"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={busy}
          autoComplete="name"
        />
        <Input label="Email" value={user?.email || ""} readOnly />
        <Input
          label="Vai trò"
          value={user?.role === "ADMIN" ? "Quản trị viên" : "Người dùng"}
          readOnly
        />
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <Button disabled={busy}>{busy ? "Đang lưu…" : "Lưu hồ sơ →"}</Button>
        </div>
      </form>
    </section>
  );
}
