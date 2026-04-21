"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] rendered error boundary:", error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Algo deu errado</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Não conseguimos carregar esta página. Tente novamente em alguns
          segundos. Se o erro persistir, entre em contato com o suporte.
        </p>
        {error.digest ? (
          <p className="text-xs text-muted-foreground">ref: {error.digest}</p>
        ) : null}
      </div>
      <Button onClick={reset} variant="outline">
        <RotateCw className="mr-2 h-4 w-4" />
        Tentar novamente
      </Button>
    </div>
  );
}
