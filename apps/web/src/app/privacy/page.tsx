import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | VibeFly",
  description: "Privacy Policy for VibeFly",
};

export default function PrivacyPolicy() {
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
          Privacy Policy
        </h1>
        <p className="mt-2 text-muted-foreground">Last updated: April 2, 2026</p>

        <div className="mt-10 space-y-10 text-foreground/80 leading-relaxed">
          {/* 1 */}
          <section>
            <h2 className="text-2xl font-semibold text-foreground">
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
            <h2 className="text-2xl font-semibold text-foreground">
              2. Information We Collect
            </h2>

            <h3 className="mt-4 text-lg font-medium text-foreground">
              2.1 Account Information
            </h3>
            <ul className="mt-2 list-disc pl-6 space-y-1">
              <li>Email address</li>
              <li>Display name</li>
              <li>Password (stored as a secure hash &mdash; we never store plain-text passwords)</li>
              <li>Profile avatar URL (optional)</li>
            </ul>

            <h3 className="mt-4 text-lg font-medium text-foreground">
              2.2 Workspace &amp; Organization Data
            </h3>
            <ul className="mt-2 list-disc pl-6 space-y-1">
              <li>Workspace name and slug</li>
              <li>Meta Business Manager ID and name</li>
              <li>Membership roles and invitations</li>
            </ul>

            <h3 className="mt-4 text-lg font-medium text-foreground">
              2.3 Data Collected via Facebook Login &amp; Meta API
            </h3>
            <p className="mt-2">
              When you connect your Meta (Facebook) account through Facebook
              Login, we collect the following:
            </p>
            <ul className="mt-2 list-disc pl-6 space-y-1">
              <li>
                Public profile name and Facebook user ID (via the{" "}
                <code className="text-sm bg-muted px-1 rounded">public_profile</code>{" "}
                permission)
              </li>
              <li>Permissions you grant for access to Ads and Business Manager</li>
              <li>Meta access tokens (encrypted at rest &mdash; see Section 5)</li>
              <li>Token scopes, type, and expiration</li>
              <li>
                Campaign, ad set, ad, and creative data retrieved from the Meta
                Graph API on your behalf
              </li>
            </ul>

            <h3 className="mt-4 text-lg font-medium text-foreground">
              2.4 API Keys
            </h3>
            <ul className="mt-2 list-disc pl-6 space-y-1">
              <li>API key hashes (we never store your full API key after initial generation)</li>
              <li>Key prefix, creation date, expiration, and last-used timestamp</li>
            </ul>

            <h3 className="mt-4 text-lg font-medium text-foreground">
              2.5 Usage &amp; Analytics Data
            </h3>
            <ul className="mt-2 list-disc pl-6 space-y-1">
              <li>API tool names invoked</li>
              <li>HTTP method, status codes, and response times</li>
              <li>Error types (if any)</li>
              <li>Timestamps of each request</li>
            </ul>

            <h3 className="mt-4 text-lg font-medium text-foreground">
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
            <h2 className="text-2xl font-semibold text-foreground">
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
            <p className="mt-3">
              <strong>
                We do not sell, rent, or share your personal data or Meta
                advertising data with third parties
              </strong>{" "}
              for marketing, advertising, or any other commercial purpose
              unrelated to providing the Service.
            </p>
          </section>

          {/* 4 */}
          <section>
            <h2 className="text-2xl font-semibold text-foreground">
              4. Third-Party Service Providers
            </h2>
            <p className="mt-3">
              We use the following third-party services to operate our platform.
              Each provider processes data in accordance with their own privacy
              policies:
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm border border-border">
                <thead>
                  <tr className="bg-muted text-left">
                    <th className="px-4 py-2 font-medium border-b border-border">Provider</th>
                    <th className="px-4 py-2 font-medium border-b border-border">Purpose</th>
                    <th className="px-4 py-2 font-medium border-b border-border">Data Processed</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border">
                    <td className="px-4 py-2 font-medium">Supabase</td>
                    <td className="px-4 py-2">Authentication, database, encrypted token storage</td>
                    <td className="px-4 py-2">Account data, workspace data, encrypted tokens, usage logs</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="px-4 py-2 font-medium">Cloudflare</td>
                    <td className="px-4 py-2">API gateway (Workers), caching &amp; rate limiting (KV)</td>
                    <td className="px-4 py-2">API requests, cached API key validations, rate-limit counters</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="px-4 py-2 font-medium">Vercel</td>
                    <td className="px-4 py-2">Web application hosting</td>
                    <td className="px-4 py-2">HTTP requests, server logs</td>
                  </tr>
                  <tr className="border-b border-border">
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
            <h2 className="text-2xl font-semibold text-foreground">
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
            <h2 className="text-2xl font-semibold text-foreground">
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

            <h3 className="mt-6 text-lg font-medium text-foreground">
              6.1 Data Deletion &amp; Revoking Access
            </h3>
            <p className="mt-3">
              You can revoke VibeFly&apos;s access to your Meta data and request
              deletion at any time through the following methods:
            </p>
            <ul className="mt-2 list-disc pl-6 space-y-2">
              <li>
                <strong>Disconnect Meta Account:</strong> Go to your workspace
                dashboard and click &quot;Disconnect Meta Account&quot;. This
                immediately revokes our access to your Meta API tokens and
                deletes the encrypted tokens from our database.
              </li>
              <li>
                <strong>Revoke via Facebook Settings:</strong> Visit{" "}
                <a
                  href="https://www.facebook.com/settings?tab=business_tools"
                  className="text-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Facebook Settings &gt; Business Integrations
                </a>{" "}
                and remove VibeFly. This will invalidate all tokens issued to
                our application.
              </li>
              <li>
                <strong>Delete Account:</strong> Delete your VibeFly account
                entirely through your account settings. This triggers cascading
                deletion of all associated workspaces, tokens, API keys, and
                usage logs.
              </li>
              <li>
                <strong>Data Deletion Request:</strong> You may also request
                data deletion by contacting us at{" "}
                <a
                  href="mailto:contato@vibefly.app"
                  className="text-primary hover:underline"
                >
                  contato@vibefly.app
                </a>
                {" "}or visiting our{" "}
                <a
                  href="/data-deletion"
                  className="text-primary hover:underline"
                >
                  Data Deletion Instructions
                </a>{" "}
                page.
              </li>
            </ul>
          </section>

          {/* 7 */}
          <section>
            <h2 className="text-2xl font-semibold text-foreground">
              7. Your Rights &amp; LGPD Compliance
            </h2>
            <p className="mt-3">
              VibeFly is committed to complying with the Brazilian General Data
              Protection Law (Lei Geral de Prote&ccedil;&atilde;o de Dados
              &mdash; LGPD, Law No. 13,709/2018), as well as the GDPR and CCPA
              where applicable. Below are your rights under these regulations:
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
                time by disconnecting your Meta account or deleting your VibeFly
                account (see Section 6.1 for instructions).
              </li>
            </ul>

            <h3 className="mt-6 text-lg font-medium text-foreground">
              7.1 Legal Basis for Data Processing (LGPD Art. 7)
            </h3>
            <p className="mt-2">
              We process your personal data based on the following legal grounds:
            </p>
            <ul className="mt-2 list-disc pl-6 space-y-1">
              <li>
                <strong>Consent:</strong> When you authorize VibeFly via Facebook
                Login (OAuth), you provide explicit consent for us to access your
                Meta advertising data within the scope of the permissions granted.
              </li>
              <li>
                <strong>Contract performance:</strong> Processing necessary to
                provide the VibeFly service as described in our Terms of Service.
              </li>
              <li>
                <strong>Legitimate interest:</strong> Service monitoring, security,
                and fraud prevention.
              </li>
            </ul>

            <h3 className="mt-6 text-lg font-medium text-foreground">
              7.2 Data Protection Officer (DPO / Encarregado de Dados)
            </h3>
            <p className="mt-2">
              For questions regarding data protection or to exercise any of your
              rights under the LGPD, GDPR, or CCPA, please contact our Data
              Protection Officer:
            </p>
            <p className="mt-2">
              <strong>Email:</strong>{" "}
              <a
                href="mailto:contato@vibefly.app"
                className="text-primary hover:underline"
              >
                contato@vibefly.app
              </a>
            </p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="text-2xl font-semibold text-foreground">
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
            <h2 className="text-2xl font-semibold text-foreground">
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
            <h2 className="text-2xl font-semibold text-foreground">
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
            <h2 className="text-2xl font-semibold text-foreground">
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
            <h2 className="text-2xl font-semibold text-foreground">
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
