import { useEffect, useState, useSyncExternalStore } from "react";
import { readResource, getRevision, sessionToken, subscribe } from "./api";
import type { Envelope, Query } from "./types";

export function useResource<T>(
  path: string | null,
  query: Query = {},
  refreshKey = 0,
) {
  const version = useSyncExternalStore(subscribe, getRevision);
  const serialized = JSON.stringify(query);
  const [state, setState] = useState<{
    data?: Envelope<T>;
    error?: unknown;
    loading: boolean;
    scope?: string;
  }>({ loading: true });
  const scope = `${path}:${serialized}:${sessionToken()}`;
  useEffect(() => {
    const controller = new AbortController();
    if (!path) {
      setState({ loading: false, scope });
      return;
    }
    setState((old) =>
      old.scope === scope && old.data
        ? { ...old, error: undefined, loading: false }
        : { loading: true, scope },
    );
    readResource<T>(path, JSON.parse(serialized)).then(
      (data) => {
        if (!controller.signal.aborted)
          setState({ data, loading: false, scope });
      },
      (error: unknown) => {
        if (
          !controller.signal.aborted &&
          !(error instanceof Error && error.name === "AbortError")
        )
          setState({ error, loading: false, scope });
      },
    );
    return () => controller.abort();
  }, [path, serialized, version, scope, refreshKey]);
  return state.scope === scope
    ? state
    : { loading: Boolean(path), data: undefined, error: undefined };
}
