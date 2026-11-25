import { useEffect, useSyncExternalStore } from "react";
import { api, sessionToken, subscribe as subscribeSession } from "./api";

// One shared set of saved item ids so every heart on screen agrees.
let ids = new Set<number>();
let loadedFor: string | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
let snapshot = 0;
const emit = () => {
  snapshot++;
  listeners.forEach((listener) => listener());
};
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function loadSaved(force = false) {
  const token = sessionToken();
  if (!token) {
    if (ids.size || loadedFor) {
      ids = new Set();
      loadedFor = null;
      emit();
    }
    return Promise.resolve();
  }
  if (!force && loadedFor === token) return loading ?? Promise.resolve();
  loadedFor = token;
  loading = api<number[]>("/saved-items/ids")
    .then((response) => {
      ids = new Set(response.data);
      emit();
    })
    .catch(() => {
      loadedFor = null;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}
export function isSaved(id: number) {
  return ids.has(id);
}
export async function toggleSaved(id: number) {
  const next = !ids.has(id);
  const previous = new Set(ids);
  if (next) ids.add(id);
  else ids.delete(id);
  emit();
  try {
    await api(`/saved-items/${id}`, { method: next ? "PUT" : "DELETE" });
  } catch (error) {
    ids = previous;
    emit();
    throw error;
  }
  return next;
}
export function useSaved() {
  useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => 0,
  );
  const session = useSyncExternalStore(
    subscribeSession,
    sessionToken,
    () => null,
  );
  useEffect(() => {
    void loadSaved();
  }, [session]);
  return { isSaved, toggleSaved, signedIn: Boolean(session) };
}
