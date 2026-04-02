import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Building2, Plus, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("memberships")
    .select("role, workspace:workspaces(id, name, slug, meta_business_id, meta_business_name)")
    .eq("user_id", user.id);

  const workspaces = memberships?.map((m) => {
    const ws = m.workspace as unknown as {
      id: string;
      name: string;
      slug: string;
      meta_business_id: string | null;
      meta_business_name: string | null;
    };
    return { ...ws, role: m.role };
  }) ?? [];

  const displayName =
    user.user_metadata?.display_name ??
    user.email?.split("@")[0] ??
    "User";

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <nav className="border-b">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="text-lg font-light tracking-tight font-display bg-gradient-to-r from-violet-brand to-cyan-brand bg-clip-text text-transparent">
            VibeFly
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">{displayName}</span>
            <form action="/api/auth/signout" method="POST">
              <Button variant="ghost" size="sm" type="submit">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Workspaces</h1>
            <p className="mt-1 text-muted-foreground">
              Select a workspace to manage your Meta Ads.
            </p>
          </div>
          <Button asChild>
            <Link href="/dashboard/new">
              <Plus className="mr-2 h-4 w-4" />
              New Workspace
            </Link>
          </Button>
        </div>

        {workspaces.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Building2 className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">No workspaces yet</h3>
              <p className="mt-1 text-sm text-muted-foreground text-center max-w-sm">
                Create a workspace to connect your Meta Business Manager and start managing ads with AI.
              </p>
              <Button asChild className="mt-6">
                <Link href="/dashboard/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Create your first workspace
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workspaces.map((ws) => (
              <Link key={ws.id} href={`/dashboard/${ws.slug}`}>
                <Card className="group hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-brand/10">
                          <Building2 className="h-5 w-5 text-violet-brand" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{ws.name}</h3>
                          {ws.meta_business_name ? (
                            <p className="text-sm text-muted-foreground truncate max-w-[180px]">
                              {ws.meta_business_name}
                            </p>
                          ) : (
                            <Badge variant="warning" className="mt-0.5">
                              Not connected
                            </Badge>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      {ws.meta_business_name && (
                        <Badge variant="success">Connected</Badge>
                      )}
                      <Badge variant="outline" className="ml-auto text-xs uppercase">
                        {ws.role}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
