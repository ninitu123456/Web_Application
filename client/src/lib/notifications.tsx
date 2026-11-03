import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useAuth } from "./auth";
import { useResource } from "./hooks";
const Context = createContext<{
  count: number;
  loading: boolean;
  revision: number;
  error?: unknown;
  refresh: () => void;
}>({ count: 0, loading: false, revision: 0, refresh() {} });
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [revision, setRevision] = useState(0);
  const lastFocus = useRef(0);
  const refresh = useCallback(() => setRevision((old) => old + 1), []);
  const unread = useResource<{ unreadCount: number }>(
    user ? "/notifications/unread-count" : null,
    {},
    revision,
  );
  useEffect(() => {
    lastFocus.current = Date.now();
    const focus = () => {
      if (!user || Date.now() - lastFocus.current < 1500) return;
      lastFocus.current = Date.now();
      setRevision((old) => old + 1);
    };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [user?.id]);
  return (
    <Context.Provider
      value={{
        count: user ? unread.data?.data.unreadCount || 0 : 0,
        loading: unread.loading,
        error: unread.error,
        revision,
        refresh,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useNotifications() {
  return useContext(Context);
}
