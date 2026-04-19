"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TopDimension, TopRow } from "@/lib/analytics/types";

interface Props {
  siteId: string;
  range: string;
  dimension: TopDimension;
  title: string;
  limit?: number;
}

export function TopTable({ siteId, range, dimension, title, limit = 8 }: Props) {
  const [rows, setRows] = useState<TopRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setErr(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/analytics/${siteId}/top?dimension=${dimension}&range=${range}&limit=${limit}`,
          { cache: "no-store" },
        );
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) setErr(body?.error ?? "Erro");
        else setRows(body.rows as TopRow[]);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [siteId, range, dimension, limit]);

  const total = rows?.reduce((acc, r) => acc + r.count, 0) ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {err && <p className="text-sm text-red-600">{err}</p>}
        {!err && rows === null && <div className="h-32 animate-pulse rounded bg-muted" />}
        {!err && rows && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Sem dados.</p>
        )}
        {!err && rows && rows.length > 0 && (
          <ul className="space-y-1.5">
            {rows.map((r) => {
              const pct = total > 0 ? (r.count / total) * 100 : 0;
              return (
                <li key={r.label} className="relative">
                  <div
                    className="absolute inset-y-0 left-0 rounded bg-vf-lime/30"
                    style={{ width: `${pct}%` }}
                  />
                  <div className="relative flex items-center justify-between px-2 py-1.5 text-sm">
                    <span className="truncate">{r.label || "(vazio)"}</span>
                    <span className="ml-2 font-medium tabular-nums">{r.count}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
