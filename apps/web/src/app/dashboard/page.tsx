import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch user's workspaces via memberships
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Workspaces</h1>
        <Link
          href="/dashboard/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white font-medium hover:bg-blue-700 transition"
        >
          New Workspace
        </Link>
      </div>

      {workspaces.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <h3 className="text-lg font-medium text-gray-900">No workspaces yet</h3>
          <p className="mt-2 text-sm text-gray-500">
            Create a workspace to connect your Meta Business Manager.
          </p>
          <Link
            href="/dashboard/new"
            className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm text-white font-medium hover:bg-blue-700 transition"
          >
            Create your first workspace
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((ws) => (
            <Link
              key={ws.id}
              href={`/dashboard/${ws.slug}`}
              className="rounded-lg border bg-white p-5 hover:shadow-md transition"
            >
              <h3 className="font-semibold">{ws.name}</h3>
              {ws.meta_business_name ? (
                <p className="mt-1 text-sm text-green-600">
                  Connected: {ws.meta_business_name}
                </p>
              ) : (
                <p className="mt-1 text-sm text-amber-600">
                  Not connected
                </p>
              )}
              <p className="mt-2 text-xs text-gray-400 uppercase">{ws.role}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
