import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | VibeFly",
  description: "Privacy Policy for VibeFly",
};

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link
          href="/"
          className="text-sm text-blue-600 hover:underline"
        >
          &larr; Back to home
        </Link>

        <h1 className="mt-8 text-4xl font-bold tracking-tight">
          Privacy Policy
        </h1>
        <p className="mt-2 text-gray-500">Last updated: March 31, 2026</p>

        <div className="mt-10 space-y-10 text-gray-700 leading-relaxed">
          {/* 1 */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900">
              1. Introduction
            </h2>
            <p className="mt-3">
              VibeFly (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) provides a
              software-as-a-service platform that enables users to connect their
              Meta (Facebook) advertising accounts to AI tools via the Model
              Context Protocol (MCP). This Privacy Policy explains how we
              collect, use, store, and protect your personal information when you
              use our website and services.
            </p>
            <p className="mt-3">
              By creating an account or using our services, you agree to the
              practices described in this policy. If you do not agree, please do
              not use our services.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900">
              2. Information We Collect
            </h2>

            <h3 className="mt-4 text-lg font-medium text-gray-900">
              2.1 Account Information
            </h3>
            <ul className="mt-2 list-disc pl-6 space-y-1">
              <li>Email address</li>
              <li>Display name</li>
              <li>Password (stored as a secure hash &mdash; we never store plain-text passwords)</li>
              <li>Profile avatar URL (optional)</li>
            </ul>

            <h3 className="mt-4 text-lg font-medium text-gray-900">
              2.2 Workspace &amp; Organization Data
            </h3>
            <ul className="mt-2 list-disc pl-6 space-y-1">
              <li>Workspace name and slug</li>
              <li>Meta Business Manager ID and name</li>
              <li>Membership roles and invitations</li>
            </ul>

            <h3 className="mt-4 text-lg font-medium text-gray-900">
              2.3 Meta Advertising Data
            </h3>
            <ul className="mt-2 list-disc pl-6 space-y-1">
              <li>Meta access tokens (encrypted at rest &mdash; see Section 5)</li>
              <li>Meta user ID</li>
              <li>Token scopes, type, and expiration</li>
              <li>
                Campaign, ad set, ad, and creative data retrieved from the Meta
                Graph API on your behalf
              </li>
            </ul>

            <h3 className="mt-4 text-lg font-medium text-gray-900">
              2.4 API Keys
            </h3>
            <ul className="mt-2 list-disc pl-6 space-y-1">
              <li>API key hashes (we never store your full API key after initial generation)</li>
              <li>Key prefix, creation date, expiration, and last-used timestamp</li>
            </ul>

            <h3 className="mt-4 text-lg font-medium text-gray-900">
              2.5 Usage &amp; Analytics Data
            </h3>
            <ul className="mt-2 list-disc pl-6 space-y-1">
              <li>API tool names invoked</li>
              <li>HTTP method, status codes, and response times</li>
              <li>Error types (if any)</li>
              <li>Timestamps of each request</li>
            </ul>

            <h3 className="mt-4 text-lg font-medium text-gray-900">
              2.6 Billing Information
            </h3>
            <p className="mt-2">
              If you subscribe to a paid plan, payment processing is handled
              entirely by <strong>Stripe</strong>. We store only your Stripe
              customer ID and subscription ID &mdash; we do not store credit card
              numbers, bank account details, or other payment credentials.
            </p>
          </section>

          {/* 3 */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900">
              3. How We Use Your Information
            </h2>
            <ul className="mt-3 list-disc pl-6 space-y-1">
              <li>To provide, operate, and maintain the platform</li>
              <li>To authenticate your identity and manage workspace access</li>
              <li>
                To connect to the Meta Graph API on your behalf and retrieve or
                modify your advertising data as instructed
              </li>
              <li>To enforce rate limits and prevent abuse</li>
              <li>To monitor service health and troubleshoot errors</li>
              <li>To process payments and manage subscriptions</li>
              <li>
                To communicate important service updates, security alerts, or
                changes to this policy
              </li>
            </ul>
          </section>

          {/* 4 */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900">
              4. Third-Party Service Providers
            </h2>
            <p className="mt-3">
              We use the following third-party services to operate our platform.
              Each provider processes data in accordance with their own privacy
              policies:
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm border border-gray-200">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-2 font-medium border-b">Provider</th>
                    <th className="px-4 py-2 font-medium border-b">Purpose</th>
                    <th className="px-4 py-2 font-medium border-b">Data Processed</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="px-4 py-2 font-medium">Supabase</td>
                    <td className="px-4 py-2">Authentication, database, encrypted token storage</td>
                    <td className="px-4 py-2">Account data, workspace data, encrypted tokens, usage logs</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2 font-medium">Cloudflare</td>
                    <td className="px-4 py-2">API gateway (Workers), caching &amp; rate limiting (KV)</td>
                    <td className="px-4 py-2">API requests, cached API key validations, rate-limit counters</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2 font-medium">Vercel</td>
                    <td className="px-4 py-2">Web application hosting</td>
                    <td className="px-4 py-2">HTTP requests, server logs</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2 font-medium">Stripe</td>
                    <td className="px-4 py-2">Payment processing</td>
                    <td className="px-4 py-2">Billing and payment information</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-medium">Meta (Facebook)</td>
                    <td className="px-4 py-2">Advertising data API (Graph API v24.0)</td>
                    <td className="px-4 py-2">Access tokens, ad account data, campaign data</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 5 */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900">
              5. Data Security
            </h2>
            <p className="mt-3">
              We implement multiple layers of security to protect your data:
            </p>
            <ul className="mt-3 list-disc pl-6 space-y-2">
              <li>
                <strong>Token encryption:</strong> Meta access tokens are
                encrypted at rest using PGP symmetric encryption (pgcrypto). They
                are decrypted only at the moment of use and are never stored in
                plain text.
              </li>
              <li>
                <strong>API key hashing:</strong> API keys are stored as bcrypt
                hashes. The full key is shown only once at creation and cannot be
                retrieved afterward.
              </li>
              <li>
                <strong>Row-Level Security (RLS):</strong> Database access
                policies ensure users can only access data within their own
                workspaces.
              </li>
              <li>
                <strong>Workspace isolation:</strong> All data is scoped to
                individual workspaces. Members can only access workspaces they
                belong to.
              </li>
              <li>
                <strong>Short-lived caches:</strong> Cached token data in
                Cloudflare KV expires after 5 minutes; API key validations expire
                after 60 seconds.
              </li>
              <li>
                <strong>HTTPS:</strong> All data in transit is encrypted via
                TLS/HTTPS.
              </li>
            </ul>
          </section>

          {/* 6 */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900">
              6. Data Retention
            </h2>
            <ul className="mt-3 list-disc pl-6 space-y-2">
              <li>
                <strong>Account data</strong> is retained for as long as your
                account is active. When you delete your account, all associated
                profile data is removed.
              </li>
              <li>
                <strong>Workspace data</strong> (including usage logs, API keys,
                and token records) is deleted when the workspace is deleted,
                through cascading database deletions.
              </li>
              <li>
                <strong>Meta tokens</strong> are marked as invalid when you
                disconnect your Meta account. Historical token metadata may be
                retained for audit purposes but cannot be used to access your Meta
                account.
              </li>
              <li>
                <strong>Usage logs</strong> are retained to provide you with
                analytics and to help us monitor service health. You may request
                deletion at any time.
              </li>
            </ul>
          </section>

          {/* 7 */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900">
              7. Your Rights
            </h2>
            <p className="mt-3">
              Depending on your jurisdiction (including under the GDPR, LGPD, or
              CCPA), you may have the following rights:
            </p>
            <ul className="mt-3 list-disc pl-6 space-y-1">
              <li>
                <strong>Access:</strong> Request a copy of the personal data we
                hold about you.
              </li>
              <li>
                <strong>Rectification:</strong> Request correction of inaccurate
                data.
              </li>
              <li>
                <strong>Deletion:</strong> Request deletion of your account and
                associated data.
              </li>
              <li>
                <strong>Portability:</strong> Request your data in a
                machine-readable format.
              </li>
              <li>
                <strong>Restriction:</strong> Request that we limit the processing
                of your data.
              </li>
              <li>
                <strong>Objection:</strong> Object to certain types of data
                processing.
              </li>
              <li>
                <strong>Revocation of consent:</strong> Withdraw consent at any
                time by disconnecting your Meta account or deleting your account.
              </li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, please contact us at the email
              address listed in Section 11.
            </p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900">
              8. International Data Transfers
            </h2>
            <p className="mt-3">
              Our service providers (Supabase, Cloudflare, Vercel, Stripe) may
              process data in data centers located outside your country of
              residence, including in the United States. These providers maintain
              appropriate safeguards for international data transfers, including
              Standard Contractual Clauses (SCCs) where applicable.
            </p>
          </section>

          {/* 9 */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900">
              9. Cookies &amp; Tracking
            </h2>
            <p className="mt-3">
              We use only essential cookies required for authentication and
              session management. We do not use third-party advertising trackers,
              analytics pixels, or social media tracking cookies.
            </p>
          </section>

          {/* 10 */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900">
              10. Children&apos;s Privacy
            </h2>
            <p className="mt-3">
              Our services are not directed to individuals under the age of 18.
              We do not knowingly collect personal information from children. If
              you believe a child has provided us with personal data, please
              contact us so we can delete it.
            </p>
          </section>

          {/* 11 */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900">
              11. Changes to This Policy
            </h2>
            <p className="mt-3">
              We may update this Privacy Policy from time to time. When we make
              material changes, we will notify you by email or through a
              prominent notice on our platform. Your continued use of the service
              after any changes constitutes acceptance of the updated policy.
            </p>
          </section>

          {/* 12 */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900">
              12. Contact Us
            </h2>
            <p className="mt-3">
              If you have questions about this Privacy Policy or wish to exercise
              your data rights, please contact us:
            </p>
            <p className="mt-3">
              <strong>Email:</strong>{" "}
              <a
                href="mailto:contato@vibefly.app"
                className="text-blue-600 hover:underline"
              >
                contato@vibefly.app
              </a>
            </p>
          </section>
        </div>

        <div className="mt-16 border-t pt-8 text-center text-sm text-gray-400">
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
