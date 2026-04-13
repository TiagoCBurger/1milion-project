"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

function ConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type");
    const next = searchParams.get("next") ?? "/dashboard";
    const destination = next.startsWith("/") ? next : "/dashboard";

    async function confirm() {
      const supabase = createClient();

      // Token hash flow: direct OTP verification (recommended — no PKCE verifier needed)
      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          type: type as "signup" | "email",
          token_hash: tokenHash,
        });
        if (!error) {
          setStatus("success");
          setTimeout(() => router.push(destination), 2000);
          return;
        }
        console.error("[auth/confirm] verifyOtp error:", error);
        setErrorMessage("O link de confirmação expirou ou já foi utilizado.");
        setStatus("error");
        return;
      }

      // PKCE flow: Supabase verified OTP server-side and redirected with a code
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          setStatus("success");
          setTimeout(() => router.push(destination), 2000);
          return;
        }
        console.error("[auth/confirm] exchangeCodeForSession error:", error);
        setErrorMessage("O link de confirmação expirou ou já foi utilizado.");
        setStatus("error");
        return;
      }

      setErrorMessage("Link de confirmação inválido. Params recebidos: " + Array.from(searchParams.entries()).map(([k, v]) => `${k}=${v}`).join(", "));
      setStatus("error");
    }

    confirm();
  }, [searchParams, router]);

  return (
    <main className="flex min-h-screen items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <Link href="/" className="text-2xl font-light tracking-tight font-display bg-gradient-to-r from-violet-brand to-cyan-brand bg-clip-text text-transparent mb-2 inline-block">
            VibeFly
          </Link>

          {status === "loading" && (
            <>
              <CardTitle className="text-xl">Confirmando email...</CardTitle>
              <CardDescription>Aguarde um momento.</CardDescription>
            </>
          )}

          {status === "success" && (
            <>
              <CardTitle className="text-xl">Email confirmado!</CardTitle>
              <CardDescription>Sua conta foi ativada. Redirecionando...</CardDescription>
            </>
          )}

          {status === "error" && (
            <>
              <CardTitle className="text-xl">Falha na confirmação</CardTitle>
              <CardDescription>{errorMessage}</CardDescription>
            </>
          )}
        </CardHeader>

        {status === "error" && (
          <CardContent className="text-center">
            <Button asChild variant="outline" className="w-full">
              <Link href="/signup">Criar nova conta</Link>
            </Button>
            <p className="mt-3 text-sm text-muted-foreground">
              Já tem conta?{" "}
              <Link href="/login" className="text-primary hover:underline">
                Entrar
              </Link>
            </p>
          </CardContent>
        )}
      </Card>
    </main>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen items-center justify-center p-4 bg-background">
        <p className="text-muted-foreground">Carregando...</p>
      </main>
    }>
      <ConfirmContent />
    </Suspense>
  );
}
