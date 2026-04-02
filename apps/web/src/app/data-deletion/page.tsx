import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Data Deletion Instructions | VibeFly",
  description: "How to request deletion of your data from VibeFly",
};

export default function DataDeletion() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link
          href="/"
          className="text-sm text-primary hover:underline"
        >
          &larr; Back to home
        </Link>

        <h1 className="mt-8 text-4xl font-bold tracking-tight text-foreground font-display">
          Data Deletion Instructions
        </h1>
        <p className="mt-2 text-muted-foreground">Last updated: March 31, 2026</p>

        <div className="mt-10 space-y-10 text-foreground/80 leading-relaxed">
          <section>
            <h2 className="text-2xl font-semibold text-foreground">
              How to Delete Your Data
            </h2>
            <p className="mt-3">
              VibeFly respects your right to control your personal data. If you
              have used our platform and wish to have your data deleted, you can
              do so through the following methods:
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">
              Option 1: Delete Your Account via the Platform
            </h2>
            <p className="mt-3">
              You can delete your account and all associated data directly from
              within the VibeFly platform:
            </p>
            <ol className="mt-3 list-decimal pl-6 space-y-2">
              <li>Log in to your VibeFly account.</li>
              <li>Navigate to your account settings.</li>
              <li>
                Click &quot;Delete Account&quot; and confirm the action.
              </li>
            </ol>
            <p className="mt-3">
              This will permanently remove your account, workspace data,
              encrypted Meta tokens, API keys, and usage logs from our systems.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">
              Option 2: Request Deletion via Email
            </h2>
            <p className="mt-3">
              If you prefer, you can request data deletion by sending an email
              to:
            </p>
            <p className="mt-3">
              <a
                href="mailto:contato@vibefly.app"
                className="text-primary hover:underline font-medium"
              >
                contato@vibefly.app
              </a>
            </p>
            <p className="mt-3">
              Please include the email address associated with your VibeFly
              account. We will process your request within 15 business days and
              send you a confirmation once the deletion is complete.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">
              What Data Is Deleted
            </h2>
            <p className="mt-3">
              When you request data deletion, the following information is
              permanently removed from our systems:
            </p>
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
            <h2 className="text-2xl font-semibold text-foreground">
              Disconnecting Your Meta Account
            </h2>
            <p className="mt-3">
              In addition to deleting your data from VibeFly, you can revoke
              our access to your Meta account at any time:
            </p>
            <ol className="mt-3 list-decimal pl-6 space-y-2">
              <li>
                Go to your{" "}
                <a
                  href="https://www.facebook.com/settings?tab=business_tools"
                  className="text-primary hover:underline"
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
            <p className="mt-3">
              This will immediately invalidate any Meta tokens stored in our
              system associated with your account.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">
              Data Retention After Deletion
            </h2>
            <p className="mt-3">
              Once your data is deleted, it cannot be recovered. We may retain
              anonymized, aggregated data that cannot be used to identify you
              for service improvement purposes. No personal data or Meta
              advertising data is retained after deletion.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">
              Contact Us
            </h2>
            <p className="mt-3">
              If you have any questions about data deletion or your privacy
              rights, please contact us:
            </p>
            <p className="mt-3">
              <strong>Email:</strong>{" "}
              <a
                href="mailto:contato@vibefly.app"
                className="text-primary hover:underline"
              >
                contato@vibefly.app
              </a>
            </p>
          </section>
        </div>

        <div className="mt-16 border-t border-border pt-8 text-center text-sm text-muted-foreground">
          <Link href="/" className="hover:underline">
            VibeFly
          </Link>
          <p className="mt-2 text-xs">
            CNPJ: 61.750.788/0001-48 &mdash; 61.750.788 TIAGO CASAS BURGER
          </p>
        </div>
      </div>
    </main>
  );
}
