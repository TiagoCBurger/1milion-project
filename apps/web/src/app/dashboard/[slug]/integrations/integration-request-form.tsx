"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  submitIntegrationRequest,
  type SubmitIntegrationRequestState,
} from "./actions";

function IntegrationRequestFormFields({
  slug,
  onSuccess,
}: {
  slug: string;
  onSuccess?: () => void;
}) {
  const [state, formAction, isPending] = useActionState<
    SubmitIntegrationRequestState,
    FormData
  >(submitIntegrationRequest, undefined);
  const onSuccessRef = useRef(onSuccess);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  useEffect(() => {
    if (state?.ok !== true) return;
    const t = window.setTimeout(() => onSuccessRef.current?.(), 1800);
    return () => window.clearTimeout(t);
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />

      <div className="space-y-2">
        <Label htmlFor="integration_name">Qual integração você precisa?</Label>
        <Input
          id="integration_name"
          name="integration_name"
          placeholder="Ex.: Shopify, RD Station, Pipedrive…"
          required
          maxLength={500}
          disabled={isPending}
          autoComplete="off"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="details">Detalhes (opcional)</Label>
        <textarea
          id="details"
          name="details"
          rows={4}
          maxLength={8000}
          disabled={isPending}
          placeholder="Contexto, links da documentação da API, casos de uso…"
          className={cn(
            "flex min-h-[100px] w-full rounded-xl bg-secondary/60 px-3 py-2 text-sm transition-colors",
            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:bg-card",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
      </div>

      {state?.ok === true && (
        <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
          Pedido enviado. Entraremos em contato quando houver novidades.
        </p>
      )}
      {state?.ok === false && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Enviando…
          </>
        ) : (
          <>
            <Send className="mr-2 h-4 w-4" />
            Enviar pedido
          </>
        )}
      </Button>
    </form>
  );
}

/** Botão discreto + mesmo formulário (salva via `create_integration_request` no Supabase). */
export function SuggestIntegrationButton({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-auto gap-1.5 px-2 py-1 text-xs font-normal text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="h-3.5 w-3.5 opacity-60" aria-hidden />
        Sugerir ferramenta
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Sugerir uma ferramenta</DialogTitle>
            <DialogDescription>
              Diga qual integração você quer ver neste espaço. Avaliamos cada sugestão.
            </DialogDescription>
          </DialogHeader>
          {open ? (
            <IntegrationRequestFormFields
              slug={slug}
              onSuccess={() => {
                setOpen(false);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function IntegrationRequestCard({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Card className="border-border/80 transition-colors hover:border-border">
        <CardHeader className="flex flex-row items-start gap-4 space-y-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-brand/10 text-violet-brand">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle className="text-lg">Pedir nova integração</CardTitle>
            <CardDescription>
              Não encontrou o que precisa? Descreva qual ferramenta ou plataforma você quer conectar a
              este espaço. Avaliamos cada pedido.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Button type="button" onClick={() => setOpen(true)} className="w-full sm:w-auto">
            Solicitar
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Pedir nova integração</DialogTitle>
            <DialogDescription>
              Informe o nome da integração e, se quiser, detalhes para nossa equipe avaliar.
            </DialogDescription>
          </DialogHeader>
          {open ? (
            <IntegrationRequestFormFields
              slug={slug}
              onSuccess={() => {
                setOpen(false);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
