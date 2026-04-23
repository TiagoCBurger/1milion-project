import { redirect, notFound } from "next/navigation";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { fetchSidebarOrganizations } from "@/lib/organizations";
import { getAuthedUser, getSupabase } from "@/lib/auth-context";
import { PlanProvider } from "@/hooks/use-plan";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getAuthedUser();
  if (!user) redirect("/login");

  const supabase = await getSupabase();
  const workspaces = await fetchSidebarOrganizations(supabase, user.id);

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
        <PlanProvider organizationId={currentWorkspace.id}>
          {children}
        </PlanProvider>
      </main>
    </div>
  );
}
