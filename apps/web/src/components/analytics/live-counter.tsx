"use client";

import { useEffect, useState } from "react";
import { Circle } from "lucide-react";

const POLL_INTERVAL_MS = 30_000;

export function LiveCounter({
  siteId,
  initial,
}: {
  siteId: string;
  initial?: number;
}) {
  const [count, setCount] = useState<number | null>(initial ?? null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      if (typeof document !== "undefined" && document.hidden) {
        // Skip the tick entirely while the tab is in the background. We used
        // to burn a Supabase+AE query every 10s on invisible tabs.
        schedule();
        return;
      }
      try {
        const res = await fetch(`/api/analytics/${siteId}/live`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { active_sessions?: number };
        if (!cancelled) setCount(data.active_sessions ?? 0);
      } catch {
        // ignore transient errors
      } finally {
        if (!cancelled) schedule();
      }
    }

    function schedule() {
      if (cancelled) return;
      timer = setTimeout(load, POLL_INTERVAL_MS);
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        if (timer) clearTimeout(timer);
        load();
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    // Only fetch once on mount if we have no server-seeded value. Otherwise,
    // the initial value is fresh enough — schedule the next poll normally.
    if (initial == null) {
      load();
    } else {
      schedule();
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [siteId, initial]);

  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-border/40 bg-card px-3 py-1.5 text-sm">
      <Circle className="h-2 w-2 fill-emerald-500 text-emerald-500 animate-pulse" />
      <span className="text-muted-foreground">Ao vivo:</span>
      <span className="font-semibold">{count ?? "–"}</span>
    </div>
  );
}
