import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { Navigate, useLocation } from "react-router-dom";
import {
  api,
  ApiError,
  onAccessDenied,
  errorText,
  onSessionExpired,
  sessionToken,
  setSession,
} from "./api";
import type { User } from "./types";

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  check: () => void;
  updateUser: (user: User) => void;
}
const Context = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(sessionToken()));
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const refreshing = useRef(false);
  const lastCheck = useRef(0);
  const refreshIdentity = useCallback(async () => {
    if (
      !sessionToken() ||
      refreshing.current ||
      Date.now() - lastCheck.current < 1000
    )
      return;
    refreshing.current = true;
    lastCheck.current = Date.now();
    try {
      const result = await api<User>("/users/me");
      setUser(result.data);
      setError("");
    } catch (e) {
      if (e instanceof ApiError && [401, 403].includes(e.status)) {
        setSession(null);
        setUser(null);
        setError(errorText(e));
      }
    } finally {
      refreshing.current = false;
    }
  }, []);
  useEffect(() => {
    onAccessDenied(() => {
      void refreshIdentity();
    });
    window.addEventListener("focus", refreshIdentity);
    return () => {
      window.removeEventListener("focus", refreshIdentity);
      onAccessDenied(() => {});
    };
  }, [refreshIdentity]);
  useEffect(() => {
    onSessionExpired(() => {
      setUser(null);
      setError("Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.");
      setLoading(false);
    });
    if (!sessionToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    api<User>("/users/me", { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setUser(result.data);
          setError("");
        }
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) {
          setUser(null);
          setError(errorText(e));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt]);
  // No refresh token exists. Expire the local session at the JWT expiry too.
  useEffect(() => {
    if (!user || !sessionToken()) return;
    try {
      const payload = JSON.parse(
        atob(
          sessionToken()!.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"),
        ),
      ) as { exp: number };
      const expireNow = () => {
        setSession(null);
        setUser(null);
        setError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
      };
      if (!Number.isFinite(payload.exp)) {
        expireNow();
        return;
      }
      let timer: number | undefined;
      const checkExpiry = () => {
        const remaining = payload.exp * 1000 - Date.now();
        if (remaining <= 0) expireNow();
        else
          timer = window.setTimeout(
            checkExpiry,
            Math.min(remaining, 2147483647),
          );
      };
      checkExpiry();
      // A background tab can throttle timers; recheck when it becomes visible.
      const onVisible = () => {
        if (document.visibilityState === "visible") {
          window.clearTimeout(timer);
          checkExpiry();
        }
      };
      document.addEventListener("visibilitychange", onVisible);
      return () => {
        window.clearTimeout(timer);
        document.removeEventListener("visibilitychange", onVisible);
      };
    } catch {
      setSession(null);
      setUser(null);
    }
  }, [user]);
  const value: AuthState = {
    user,
    loading,
    error,
    async login(email, password) {
      const response = await api<{ token: string; user: User }>("/auth/login", {
        method: "POST",
        body: { email, password },
        auth: false,
      });
      setSession(response.data.token);
      try {
        const current = await api<User>("/users/me");
        setUser(current.data);
        setError("");
      } catch (e) {
        setSession(null);
        setUser(null);
        throw e;
      }
    },
    logout() {
      setSession(null);
      setUser(null);
      setError("");
    },
    check() {
      setAttempt((count) => count + 1);
    },
    updateUser: setUser,
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAuth() {
  const context = useContext(Context);
  if (!context) throw new Error("Missing AuthProvider");
  return context;
}
export function Protected({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.loading)
    return (
      <div className="state" role="status">
        Đang kiểm tra phiên đăng nhập…
      </div>
    );
  if (!auth.user) {
    if (sessionToken())
      return (
        <div className="state" role="alert">
          <p>{auth.error}</p>
          <button onClick={auth.check}>Kiểm tra lại</button>
          <button onClick={auth.logout}>Đăng xuất</button>
        </div>
      );
    return (
      <Navigate
        to={`/dang-nhap?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  }
  return children;
}
export function safeNext(value: string | null) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f]/.test(value)
  )
    return "/";
  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.origin === window.location.origin &&
      !["/dang-nhap", "/dang-ky"].includes(parsed.pathname)
      ? parsed.pathname + parsed.search + parsed.hash
      : "/";
  } catch {
    return "/";
  }
}
