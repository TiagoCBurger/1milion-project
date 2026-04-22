"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export default function BillingSuccessPage() {
  const { slug } = useParams<{ slug: string }>();
  const [status, setStatus] = useState<"loading" | "active" | "pending">("loading");
  const supabase = createClient();

  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 10;

    async function poll() {
      const { data: workspace } = await supabase
        .from("organizations")
        .select("id")
        .eq("slug", slug)
        .single();

      if (!workspace) {
        setStatus("pending");
        return;
      }

      const res = await fetch(`/api/billing/status?organization_id=${workspace.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.subscription?.status === "active" && data.subscription?.tier !== "free") {
          setStatus("active");
          return;
        }
      }

      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(poll, 2000);
      } else {
        setStatus("pending");
      }
    }

    poll();
  }, [slug, supabase]);

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Workspaces", href: "/dashboard" },
          { label: slug, href: `/dashboard/${slug}` },
          { label: "Billing", href: `/dashboard/${slug}/billing` },
          { label: "Success" },
        ]}
      />
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            {status === "loading" && (
              <>
                <Loader2 className="h-12 w-12 text-vf-lime animate-spin mx-auto" />
                <h2 className="text-xl font-semibold">Processing payment...</h2>
                <p className="text-muted-foreground text-sm">
                  We&apos;re confirming your subscription. This usually takes a few seconds.
                </p>
              </>
            )}

            {status === "active" && (
              <>
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
                <h2 className="text-xl font-semibold">Subscription activated!</h2>
                <p className="text-muted-foreground text-sm">
                  Your plan has been upgraded. All new features are now available.
                </p>
                <Button asChild className="mt-4">
                  <Link href={`/dashboard/${slug}`}>Go to Dashboard</Link>
                </Button>
              </>
            )}

            {status === "pending" && (
              <>
                <CheckCircle2 className="h-12 w-12 text-amber-500 mx-auto" />
                <h2 className="text-xl font-semibold">Payment received</h2>
                <p className="text-muted-foreground text-sm">
                  Your payment is being processed. Your plan will be activated shortly.
                  You can check the status on the billing page.
                </p>
                <Button asChild variant="outline" className="mt-4">
                  <Link href={`/dashboard/${slug}/billing`}>Back to Billing</Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
