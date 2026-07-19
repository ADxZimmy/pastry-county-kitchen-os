import { useCallback, useEffect, useRef, useState } from "react";
import { apiBaseUrl } from "./backend";

// Route-scoped reads for the high-growth collections. These used to arrive in
// the single bootstrap payload, capped by a server-side LIMIT that silently hid
// most of the history — so this layer also carries the real total, which is what
// lets the UI admit how much it is showing.

export type PagedStatus = "loading" | "loadingMore" | "ready" | "error";

export type PagedResource<T> = {
  items: T[];
  status: PagedStatus;
  error: string;
  hasMore: boolean;
  loadMore: () => void;
  retry: () => void;
};

type PageResponse<T> = { items?: T[]; hasMore?: boolean; nextCursor?: string | null; error?: string };

export async function fetchResourcePage<T>(resource: string, params: Record<string, string | number | undefined> = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  }
  const suffix = query.toString() ? `?${query}` : "";
  const response = await fetch(`${apiBaseUrl}/api/data/${resource}${suffix}`, { credentials: "same-origin" });
  const body = (await response.json().catch(() => ({}))) as PageResponse<T>;
  if (!response.ok) throw new Error(body.error || `Could not load ${resource}.`);
  return body;
}

export function usePagedResource<T>(resource: string, { limit = 50, enabled = true }: { limit?: number; enabled?: boolean } = {}): PagedResource<T> {
  const [items, setItems] = useState<T[]>([]);
  const [status, setStatus] = useState<PagedStatus>("loading");
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async (mode: "first" | "more") => {
    if (!enabled) return;
    // Every load carries a token; a response from a superseded request is
    // discarded rather than overwriting newer data.
    const token = ++requestRef.current;
    setStatus(mode === "first" ? "loading" : "loadingMore");
    setError("");
    try {
      const page = await fetchResourcePage<T>(resource, {
        limit,
        cursor: mode === "more" ? cursorRef.current ?? undefined : undefined
      });
      if (token !== requestRef.current) return;
      cursorRef.current = page.nextCursor ?? null;
      setHasMore(Boolean(page.hasMore));
      setItems((current) => (mode === "first" ? page.items ?? [] : [...current, ...(page.items ?? [])]));
      setStatus("ready");
    } catch (loadError) {
      if (token !== requestRef.current) return;
      setError(loadError instanceof Error ? loadError.message : `Could not load ${resource}.`);
      setStatus("error");
    }
  }, [resource, limit, enabled]);

  useEffect(() => {
    if (!enabled) return;
    cursorRef.current = null;
    load("first");
  }, [load, enabled]);

  return {
    items,
    status,
    error,
    hasMore,
    loadMore: () => {
      if (status !== "loadingMore" && hasMore) load("more");
    },
    retry: () => {
      cursorRef.current = null;
      load("first");
    }
  };
}

// Honest phrasing for how much of a collection is on screen. The old UI showed a
// truncated slice as though it were everything.
export function describeShowing(shown: number, total: number | undefined, noun: string) {
  if (!Number.isFinite(total as number)) return `Showing ${shown.toLocaleString()} ${noun}`;
  const totalCount = Number(total);
  if (shown >= totalCount) return `Showing all ${totalCount.toLocaleString()} ${noun}`;
  return `Showing ${shown.toLocaleString()} of ${totalCount.toLocaleString()} ${noun}`;
}
