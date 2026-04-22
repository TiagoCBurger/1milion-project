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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { CustomEventRow } from "@/lib/analytics/types";

export function EventExplorer({ siteId, range }: { siteId: string; range: string }) {
  const [rows, setRows] = useState<CustomEventRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setErr(null);
    const qs = new URLSearchParams({ range, limit: "200" });
    if (filter) qs.set("event_name", filter);
    (async () => {
      try {
        const res = await fetch(`/api/analytics/${siteId}/events?${qs.toString()}`, {
          cache: "no-store",
        });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) setErr(body?.error ?? "Erro");
        else setRows(body.events as CustomEventRow[]);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [siteId, range, filter]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Eventos customizados</CardTitle>
        <Input
          placeholder="Filtrar por nome"
          value={filter}
          onChange={(e) => setFilter(e.target.value.trim())}
          className="w-56"
        />
      </CardHeader>
      <CardContent>
        {err && <p className="text-sm text-red-600">{err}</p>}
        {!err && rows === null && <div className="h-32 animate-pulse rounded bg-muted" />}
        {!err && rows && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum evento.</p>
        )}
        {!err && rows && rows.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Path</TableHead>
                  <TableHead>Props</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>CAPI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="font-medium">{r.event_name}</TableCell>
                    <TableCell className="max-w-xs truncate text-xs">{r.pathname ?? "–"}</TableCell>
                    <TableCell className="max-w-xs truncate font-mono text-xs">
                      {r.props ? JSON.stringify(r.props) : "–"}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {(() => {
                        const v = r.props && typeof r.props === "object" ? (r.props as Record<string, unknown>).value : undefined;
                        const c = r.props && typeof r.props === "object" ? (r.props as Record<string, unknown>).currency : undefined;
                        return v !== undefined && v !== null ? `${v} ${c ?? ""}` : "–";
                      })()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.capi_sent ? "default" : "secondary"}>
                        {r.capi_sent ? "enviado" : "–"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
