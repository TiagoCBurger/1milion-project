"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ConversionRow } from "@/lib/analytics/types";

export function ConversionsTable({ siteId, range }: { siteId: string; range: string }) {
  const [rows, setRows] = useState<ConversionRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setErr(null);
    (async () => {
      try {
        const res = await fetch(`/api/analytics/${siteId}/conversions?range=${range}`, {
          cache: "no-store",
        });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) setErr(body?.error ?? "Erro");
        else setRows(body.rows as ConversionRow[]);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [siteId, range]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conversões por evento</CardTitle>
      </CardHeader>
      <CardContent>
        {err && <p className="text-sm text-red-600">{err}</p>}
        {!err && rows === null && <div className="h-32 animate-pulse rounded bg-muted" />}
        {!err && rows && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Sem conversões no período.</p>
        )}
        {!err && rows && rows.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Evento</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Usuários únicos</TableHead>
                <TableHead className="text-right">Valor somado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.event_name}>
                  <TableCell className="font-medium">{r.event_name}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.unique_users}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.value_sum > 0 ? r.value_sum.toFixed(2) : "–"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
