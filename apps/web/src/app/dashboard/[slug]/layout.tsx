import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/dashboard/app-sidebar";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("memberships")
    .select("role, workspace:workspaces(id, name, slug, meta_business_name)")
    .eq("user_id", user.id);

  const workspaces = memberships?.map((m) => {
    const ws = m.workspace as unknown as {
      id: string;
      name: string;
      slug: string;
      meta_business_name: string | null;
    };
    return { ...ws };
  }) ?? [];

  const currentWorkspace = workspaces.find((ws) => ws.slug === slug);
  if (!currentWorkspace) notFound();

  const displayName =
    user.user_metadata?.display_name ??
    user.email?.split("@")[0] ??
    "User";

  return (
    <div className="flex min-h-screen bg-background">
      {/* Fixed sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-sidebar md:flex md:flex-col">
        <AppSidebar
          workspaces={workspaces}
          currentWorkspace={currentWorkspace}
          user={{ email: user.email ?? "", name: displayName }}
        />
      </aside>
      {/* Main content with left offset */}
      <main className="flex-1 md:ml-64 min-h-screen flex flex-col">
        {children}
      </main>
    </div>
  );
}
