import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center p-8">
      <div className="mt-24 max-w-2xl text-center">
        <h1 className="text-5xl font-bold tracking-tight">
          VibeFly
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

      <div id="data-deletion" className="mt-32 w-full max-w-3xl scroll-mt-8">
        <div className="border-t pt-16">
          <h2 className="text-3xl font-bold tracking-tight text-center">
            Data Deletion Instructions
          </h2>
          <p className="mt-2 text-center text-gray-500">Last updated: March 31, 2026</p>

          <div className="mt-10 space-y-8 text-gray-700 leading-relaxed">
            <section>
              <h3 className="text-xl font-semibold text-gray-900">
                How to Delete Your Data
              </h3>
              <p className="mt-3">
                VibeFly respects your right to control your personal data. If you
                have used our platform and wish to have your data deleted, you can
                do so through the following methods:
              </p>
            </section>

            <section>
              <h3 className="text-xl font-semibold text-gray-900">
                Option 1: Delete Your Account via the Platform
              </h3>
              <ol className="mt-3 list-decimal pl-6 space-y-2">
                <li>Log in to your VibeFly account.</li>
                <li>Navigate to your account settings.</li>
                <li>Click &quot;Delete Account&quot; and confirm the action.</li>
              </ol>
              <p className="mt-3">
                This will permanently remove your account, workspace data,
                encrypted Meta tokens, API keys, and usage logs from our systems.
              </p>
            </section>

            <section>
              <h3 className="text-xl font-semibold text-gray-900">
                Option 2: Request Deletion via Email
              </h3>
              <p className="mt-3">
                Send an email to{" "}
                <a
                  href="mailto:privacy@vibefly.io"
                  className="text-blue-600 hover:underline font-medium"
                >
                  privacy@vibefly.io
                </a>{" "}
                with the email address associated with your account. We will
                process your request within 15 business days.
              </p>
            </section>

            <section>
              <h3 className="text-xl font-semibold text-gray-900">
                What Data Is Deleted
              </h3>
              <ul className="mt-3 list-disc pl-6 space-y-2">
                <li>Your account profile (name, email, avatar)</li>
                <li>All workspaces you own and their associated data</li>
                <li>Encrypted Meta access tokens</li>
                <li>API keys and their hashes</li>
                <li>Usage logs and analytics data</li>
                <li>Membership and invitation records</li>
              </ul>
            </section>

            <section>
              <h3 className="text-xl font-semibold text-gray-900">
                Disconnecting Your Meta Account
              </h3>
              <ol className="mt-3 list-decimal pl-6 space-y-2">
                <li>
                  Go to your{" "}
                  <a
                    href="https://www.facebook.com/settings?tab=business_tools"
                    className="text-blue-600 hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Facebook Business Integrations settings
                  </a>
                  .
                </li>
                <li>Find &quot;VibeFly&quot; in the list of active integrations.</li>
                <li>Click &quot;Remove&quot; to revoke access.</li>
              </ol>
            </section>
          </div>
        </div>
      </div>

      <footer className="mt-16 w-full max-w-3xl border-t pt-8 pb-8 text-center text-sm text-gray-400">
        <Link href="/" className="hover:underline">
          VibeFly
        </Link>
        {" · "}
        <Link href="/terms" className="hover:underline">
          Terms
        </Link>
        {" · "}
        <Link href="/privacy" className="hover:underline">
          Privacy
        </Link>
        <p className="mt-2 text-xs">
          CNPJ: 61.750.788/0001-48 &mdash; 61.750.788 TIAGO CASAS BURGER
        </p>
      </footer>
    </main>
  );
}
