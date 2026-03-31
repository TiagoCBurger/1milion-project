import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <h1 className="text-5xl font-bold tracking-tight">
          Meta Ads MCP Cloud
        </h1>
        <p className="mt-4 text-xl text-gray-600">
          Connect your Meta Ads account to any AI tool via MCP.
          Manage campaigns, analyze performance, and optimize ads
          with Claude, Cursor, and more.
        </p>
        <div className="mt-8 flex gap-4 justify-center">
          <Link
            href="/signup"
            className="rounded-lg bg-blue-600 px-6 py-3 text-white font-medium hover:bg-blue-700 transition"
          >
            Get Started Free
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-gray-300 px-6 py-3 font-medium hover:bg-gray-100 transition"
          >
            Sign In
          </Link>
        </div>
      </div>
    </main>
  );
}
