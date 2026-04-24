"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { useRouter } from "next/navigation";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [locked, setLocked] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setUnconfirmed(false);
    setLocked(false);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, captchaToken }),
    });

    const data = await res.json();

    if (!res.ok) {
      if (res.status === 429) {
        setLocked(true);
      } else if (data.error === "email_not_confirmed") {
        setUnconfirmed(true);
      } else {
        setError(data.error ?? "Login failed. Please try again.");
      }
      turnstileRef.current?.reset();
      setCaptchaToken("");
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  async function handleResend() {
    setResendLoading(true);
    const supabase = createClient();
    await supabase.auth.resend({ type: "signup", email });
    setResendLoading(false);
    setResendSent(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <BrandLogo href="/" className="mb-2 justify-center" />
          <CardTitle className="text-xl">Sign In</CardTitle>
          <CardDescription>Enter your credentials to access your dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            {locked && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                Account temporarily locked due to too many failed attempts. Please wait 15 minutes and try again.
              </div>
            )}
            {unconfirmed && (
              <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-700 dark:text-amber-400 space-y-2">
                <p>Please confirm your email before signing in.</p>
                {resendSent ? (
                  <p className="font-medium">Confirmation email resent — check your inbox.</p>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendLoading}
                    className="font-medium underline underline-offset-2 hover:no-underline disabled:opacity-50"
                  >
                    {resendLoading ? "Sending..." : "Resend confirmation email"}
                  </button>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {TURNSTILE_SITE_KEY && (
              <div className="flex justify-center">
                <Turnstile
                  ref={turnstileRef}
                  siteKey={TURNSTILE_SITE_KEY}
                  onSuccess={setCaptchaToken}
                  onExpire={() => setCaptchaToken("")}
                  onError={() => setCaptchaToken("")}
                  options={{ theme: "auto" }}
                />
              </div>
            )}
            <Button
              type="submit"
              disabled={loading || (!!TURNSTILE_SITE_KEY && !captchaToken)}
              className="w-full"
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            No account?{" "}
            <Link href="/signup" className="text-primary hover:underline">
              Sign up
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
