# Privacy Policy

**Last updated: March 31, 2026**

## 1. Introduction

VibeFly ("we", "us", or "our") provides a software-as-a-service platform that enables users to connect their Meta (Facebook) advertising accounts to AI tools via the Model Context Protocol (MCP). This Privacy Policy explains how we collect, use, store, and protect your personal information when you use our website and services.

By creating an account or using our services, you agree to the practices described in this policy. If you do not agree, please do not use our services.

## 2. Information We Collect

### 2.1 Account Information

- Email address
- Display name
- Password (stored as a secure hash — we never store plain-text passwords)
- Profile avatar URL (optional)

### 2.2 Workspace & Organization Data

- Workspace name and slug
- Meta Business Manager ID and name
- Membership roles and invitations

### 2.3 Meta Advertising Data

- Meta access tokens (encrypted at rest — see Section 5)
- Meta user ID
- Token scopes, type, and expiration
- Campaign, ad set, ad, and creative data retrieved from the Meta Graph API on your behalf

### 2.4 API Keys

- API key hashes (we never store your full API key after initial generation)
- Key prefix, creation date, expiration, and last-used timestamp

### 2.5 Usage & Analytics Data

- API tool names invoked
- HTTP method, status codes, and response times
- Error types (if any)
- Timestamps of each request

### 2.6 Billing Information

If you subscribe to a paid plan, payment processing is handled entirely by **Stripe**. We store only your Stripe customer ID and subscription ID — we do not store credit card numbers, bank account details, or other payment credentials.

## 3. How We Use Your Information

- To provide, operate, and maintain the platform
- To authenticate your identity and manage workspace access
- To connect to the Meta Graph API on your behalf and retrieve or modify your advertising data as instructed
- To enforce rate limits and prevent abuse
- To monitor service health and troubleshoot errors
- To process payments and manage subscriptions
- To communicate important service updates, security alerts, or changes to this policy

## 4. Third-Party Service Providers

We use the following third-party services to operate our platform. Each provider processes data in accordance with their own privacy policies:

| Provider | Purpose | Data Processed |
|----------|---------|----------------|
| **Supabase** | Authentication, database, encrypted token storage | Account data, workspace data, encrypted tokens, usage logs |
| **Cloudflare** | API gateway (Workers), caching & rate limiting (KV) | API requests, cached API key validations, rate-limit counters |
| **Vercel** | Web application hosting | HTTP requests, server logs |
| **Stripe** | Payment processing | Billing and payment information |
| **Meta (Facebook)** | Advertising data API (Graph API v24.0) | Access tokens, ad account data, campaign data |

## 5. Data Security

We implement multiple layers of security to protect your data:

- **Token encryption:** Meta access tokens are encrypted at rest using PGP symmetric encryption (pgcrypto). They are decrypted only at the moment of use and are never stored in plain text.
- **API key hashing:** API keys are stored as bcrypt hashes. The full key is shown only once at creation and cannot be retrieved afterward.
- **Row-Level Security (RLS):** Database access policies ensure users can only access data within their own workspaces.
- **Workspace isolation:** All data is scoped to individual workspaces. Members can only access workspaces they belong to.
- **Short-lived caches:** Cached token data in Cloudflare KV expires after 5 minutes; API key validations expire after 60 seconds.
- **HTTPS:** All data in transit is encrypted via TLS/HTTPS.

## 6. Data Retention

- **Account data** is retained for as long as your account is active. When you delete your account, all associated profile data is removed.
- **Workspace data** (including usage logs, API keys, and token records) is deleted when the workspace is deleted, through cascading database deletions.
- **Meta tokens** are marked as invalid when you disconnect your Meta account. Historical token metadata may be retained for audit purposes but cannot be used to access your Meta account.
- **Usage logs** are retained to provide you with analytics and to help us monitor service health. You may request deletion at any time.

## 7. Your Rights

Depending on your jurisdiction (including under the GDPR, LGPD, or CCPA), you may have the following rights:

- **Access:** Request a copy of the personal data we hold about you.
- **Rectification:** Request correction of inaccurate data.
- **Deletion:** Request deletion of your account and associated data.
- **Portability:** Request your data in a machine-readable format.
- **Restriction:** Request that we limit the processing of your data.
- **Objection:** Object to certain types of data processing.
- **Revocation of consent:** Withdraw consent at any time by disconnecting your Meta account or deleting your account.

To exercise any of these rights, please contact us at the email address listed in Section 12.

## 8. International Data Transfers

Our service providers (Supabase, Cloudflare, Vercel, Stripe) may process data in data centers located outside your country of residence, including in the United States. These providers maintain appropriate safeguards for international data transfers, including Standard Contractual Clauses (SCCs) where applicable.

## 9. Cookies & Tracking

We use only essential cookies required for authentication and session management. We do not use third-party advertising trackers, analytics pixels, or social media tracking cookies.

## 10. Children's Privacy

Our services are not directed to individuals under the age of 18. We do not knowingly collect personal information from children. If you believe a child has provided us with personal data, please contact us so we can delete it.

## 11. Changes to This Policy

We may update this Privacy Policy from time to time. When we make material changes, we will notify you by email or through a prominent notice on our platform. Your continued use of the service after any changes constitutes acceptance of the updated policy.

## 12. Contact Us

If you have questions about this Privacy Policy or wish to exercise your data rights, please contact us:

**Email:** [privacy@vibefly.io](mailto:privacy@vibefly.io)

---

**CNPJ:** 61.750.788/0001-48
**Nome Empresarial:** 61.750.788 TIAGO CASAS BURGER
