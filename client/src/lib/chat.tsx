import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import { api, sessionToken } from "./api";
import { useAuth } from "./auth";
export interface Conversation {
  id: string;
  peer: { id: string; fullName: string };
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  clientId: string;
  content: string;
  createdAt: string;
}
const Context = createContext<{
  socket: Socket | null;
  unread: number;
  revision: number;
  connected: boolean;
}>({ socket: null, unread: 0, revision: 0, connected: false });
export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const token = sessionToken();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [unread, setUnread] = useState(0),
    [revision, setRevision] = useState(0),
    [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!user || !token) {
      setSocket(null);
      setUnread(0);
      setConnected(false);
      return;
    }
    const endpoint = new URL(
      import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3001/api",
      window.location.origin,
    );
    const client = io(endpoint.origin, {
      auth: { token },
      transports: ["websocket", "polling"],
    });
    setSocket(client);
    let active = true;
    const refresh = () => {
      if (!active) return;
      setRevision((value) => value + 1);
      void api<{ unreadCount: number }>("/conversations/unread-count").then(
        (result) => {
          if (active) setUnread(result.data.unreadCount);
        },
        () => {},
      );
    };
    client.on("connect", () => {
      setConnected(true);
      refresh();
    });
    client.on("disconnect", () => setConnected(false));
    client.on("conversation:updated", refresh);
    client.on("connect_error", () => {
      setConnected(false);
    });
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", visible);
    const timer = window.setInterval(refresh, 15000);
    refresh();
    return () => {
      active = false;
      client.disconnect();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [user?.id, token]);
  return (
    <Context.Provider value={{ socket, unread, revision, connected }}>
      {children}
    </Context.Provider>
  );
}
export const useChat = () => useContext(Context);
