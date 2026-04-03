# VibeFly — App Review Descriptions (Meta)

> Textos prontos para colar no formulário de App Review da Meta.
> Cada permissão precisa de: descrição, instruções de teste, e telas dependentes.

---

## 1. `ads_read`

### Description (para o formulário)

VibeFly is a SaaS platform that connects users' Meta advertising accounts to AI tools via the Model Context Protocol (MCP). The `ads_read` permission is essential for our core functionality: allowing users to view and analyze their existing ad campaigns through AI-powered assistants.

**How we use this permission:**

1. **List ad accounts** — When a user connects their Meta account, we call `GET /me/adaccounts` to display all available ad accounts so the user can select which ones to manage.

2. **View campaigns, ad sets, and ads** — Users ask their AI assistant to show campaign performance. We call `GET /{account_id}/campaigns`, `GET /{campaign_id}/adsets`, and `GET /{adset_id}/ads` to retrieve and display this data.

3. **View ad creatives** — Users review their creative assets through `GET /{ad_id}/adcreatives` and `GET /{creative_id}` to see images, videos, headlines, and call-to-action configurations.

4. **Analyze performance (Insights)** — Users request metrics like impressions, clicks, CTR, CPC, spend, and conversions. We call `GET /{object_id}/insights` with date filters and breakdowns by age, gender, platform, or country.

5. **Research targeting** — Users search for interests (`GET /search?type=adinterest`), behaviors, demographics, and geo-locations to plan campaign targeting.

6. **Estimate audience size** — Users estimate reach for a given targeting configuration via `GET /{account_id}/reachestimate`.

7. **Search Ad Library** — Users search public ads via `GET /ads_archive` for competitive analysis.

All data is displayed only to the authenticated user who owns the ad account. We never store campaign data persistently — it is fetched in real-time and displayed as a proxy.

### Test Instructions (para o revisor)

1. Log in to VibeFly at https://www.vibefly.app using the test account provided.
2. Create a workspace or use the existing test workspace.
3. Connect a Meta account by clicking "Connect Meta Account" on the workspace dashboard.
4. After connecting, the dashboard will display the user's ad accounts.
5. Use an MCP-compatible AI tool (e.g., Claude Desktop) with the VibeFly MCP server to ask: "List my campaigns" — this demonstrates the `ads_read` permission reading campaign data.
6. Ask the AI: "Show me insights for campaign X for the last 7 days" — this demonstrates reading performance metrics.
7. Ask the AI: "Search for interests related to fitness" — this demonstrates the targeting research feature.

### Screens/Features That Depend on This Permission

- Workspace dashboard (campaign, ad set, and ad listings)
- Insights and performance metrics panel
- Targeting research and audience estimation tools
- Ad Library search
- All 28 read-only MCP tools available on the Free plan

---

## 2. `ads_management`

### Description (para o formulário)

VibeFly uses the `ads_management` permission to enable users to create and manage Meta advertising campaigns through AI-powered assistants. This is a core feature of our paid plans (Pro and Enterprise).

**How we use this permission:**

1. **Create campaigns** — Users instruct their AI assistant to create a new campaign with a specific objective (e.g., CONVERSIONS, TRAFFIC), name, and budget. We call `POST /{account_id}/campaigns`.

2. **Update campaigns** — Users modify campaign name, status (ACTIVE/PAUSED), or budget via `POST /{campaign_id}`.

3. **Create ad sets** — Users create ad sets with specific targeting (age, gender, interests, location), daily/lifetime budget, schedule, and placement via `POST /{account_id}/adsets`.

4. **Update ad sets** — Users modify targeting, budget, schedule, or status via `POST /{adset_id}`.

5. **Create and update ads** — Users create ads linking a creative to an ad set via `POST /{account_id}/ads`, or update status/name via `POST /{ad_id}`.

6. **Upload images and videos** — Users upload creative assets via `POST /{account_id}/adimages` and `POST /{account_id}/advideos` for use in ad creatives.

7. **Create ad creatives** — Users create ad creatives with images/videos, text, headlines, and CTAs via `POST /{account_id}/adcreatives`.

8. **Budget scheduling** — Users create budget schedules for campaigns via `POST /{campaign_id}/budget_schedules`.

All write operations are initiated exclusively by the user through their AI assistant. VibeFly never takes autonomous actions on the user's Meta account.

**Access restrictions by plan:**
- Free plan: No access to write operations (blocked at the application level)
- Pro plan ($49/month): Full access to all write operations
- Enterprise plan ($199/month): Full access with higher upload limits

### Test Instructions (para o revisor)

1. Log in to VibeFly at https://www.vibefly.app using the test account provided (Pro plan).
2. Connect a Meta account on the workspace dashboard.
3. Use an MCP-compatible AI tool with the VibeFly MCP server.
4. Ask the AI: "Create a new TRAFFIC campaign named 'Test Campaign' with a daily budget of $10" — this demonstrates campaign creation.
5. Ask the AI: "Pause the campaign 'Test Campaign'" — this demonstrates campaign update.
6. Ask the AI: "Create an ad set for 'Test Campaign' targeting women aged 25-45 in Brazil interested in fitness" — this demonstrates ad set creation with targeting.
7. Ask the AI: "Upload this image for an ad creative" (provide a test image) — this demonstrates image upload.

### Screens/Features That Depend on This Permission

- Campaign creation via AI assistant
- Campaign, ad set, and ad editing/management
- Image and video upload for creatives
- Ad creative creation with image or video
- Budget scheduling

---

## 3. `business_management`

### Description (para o formulário)

VibeFly uses the `business_management` permission to access the user's Business Managers and list their associated ad accounts. This is essential for our onboarding flow, as many advertisers manage multiple ad accounts across different Business Managers.

**How we use this permission:**

1. **List Business Managers** — After OAuth login, we call `GET /me/businesses` to discover all Business Managers the user administers.

2. **List ad accounts per Business Manager** — For each Business Manager, we call `GET /{bm_id}/owned_ad_accounts` to list the available ad accounts. The user then selects which accounts to connect to their VibeFly workspace.

**Connection flow:**
```
OAuth Login → GET /me/businesses → list BMs
           → GET /{bm_id}/owned_ad_accounts (for each BM) → list accounts
           → User selects accounts → Saved to workspace
```

We only read Business Manager and ad account metadata (IDs, names). We do not modify any Business Manager settings.

### Test Instructions (para o revisor)

1. Log in to VibeFly at https://www.vibefly.app using the test account provided.
2. Click "Connect Meta Account" on the workspace dashboard.
3. Complete the Facebook Login OAuth flow, granting the requested permissions.
4. After authorization, VibeFly will display a list of the user's Business Managers.
5. For each Business Manager, the associated ad accounts will be listed.
6. Select one or more ad accounts to connect to the workspace.
7. The selected accounts will appear on the workspace dashboard.

### Screens/Features That Depend on This Permission

- Meta account connection screen (onboarding)
- Business Manager and ad account selection
- Workspace dashboard (connected accounts display)

---

## 4. `pages_manage_ads`

### Description (para o formulário)

VibeFly uses the `pages_manage_ads` permission to create ad creatives that are linked to the user's Facebook Pages. Meta requires that every ad in the Facebook/Instagram feed be published "on behalf of" a Facebook Page, using the `object_story_spec` structure in the ad creative.

**How we use this permission:**

1. **Create image ad creatives** — When a user creates an ad creative, we include the `object_story_spec` with the selected `page_id`, `link_data` (image, link, message, headline, CTA). The ad appears in the feed as a post from the user's page.

2. **Create video ad creatives** — Same as above but with `video_data` instead of `link_data`, including the video, message, headline, link, and CTA.

3. **Instagram placement** — Optionally, users can include an `instagram_actor_id` in the creative to also display the ad on Instagram linked to the page.

**Why this is necessary:** Without `pages_manage_ads`, it is not possible to create ad creatives with `object_story_spec`, which is the only way to create feed ads on Meta. This permission is required to enable the complete campaign creation flow.

### Test Instructions (para o revisor)

1. Log in to VibeFly at https://www.vibefly.app using the test account provided (Pro plan).
2. Connect a Meta account with at least one Facebook Page.
3. Use an MCP-compatible AI tool with the VibeFly MCP server.
4. Ask the AI: "Create an ad creative with the image I uploaded, linking to https://example.com, with the headline 'Test Ad' and message 'This is a test', using my page 'Test Page'" — this demonstrates creating a creative linked to a page.
5. The creative will be created with the `object_story_spec` containing the page ID.

### Screens/Features That Depend on This Permission

- Ad creative creation (image and video)
- Complete campaign creation flow via AI assistant

---

## 5. `pages_read_engagement`

### Description (para o formulário)

VibeFly uses the `pages_read_engagement` permission to read the user's Facebook Pages so they can select which page to associate with their ad creatives.

**How we use this permission:**

1. **List user's pages** — We call `GET /me/accounts` to display the Facebook Pages the user manages, showing name, category, follower count, and verification status.

2. **List ad account pages** — We call `GET /{account_id}/owned_pages` to find pages directly linked to the ad account.

3. **Search promotable pages** — When creating a creative, users can search their promotable pages via `GET /{account_id}/promote_pages` to select the correct page for the ad.

**Why this is necessary:** To create an ad creative, the user needs to provide a `page_id`. This permission allows VibeFly to list the available pages so the user can select the correct one through the AI assistant, instead of having to manually look up and provide the page ID.

### Test Instructions (para o revisor)

1. Log in to VibeFly at https://www.vibefly.app using the test account provided.
2. Connect a Meta account with at least one Facebook Page.
3. Use an MCP-compatible AI tool with the VibeFly MCP server.
4. Ask the AI: "List my Facebook pages" — this will display the user's pages with name, category, and follower count.
5. Ask the AI: "Search for promotable pages named 'Test'" — this demonstrates the page search functionality.

### Screens/Features That Depend on This Permission

- Facebook Pages listing on workspace dashboard
- Page selection when creating ad creatives
- Promotable pages search

---

## General Information for All Permissions

### About VibeFly

VibeFly is a SaaS platform that acts as a secure bridge between the Meta Advertising API (Graph API v24.0) and AI tools compatible with the Model Context Protocol (MCP). Users connect their Meta accounts through standard Facebook Login (OAuth 2.0), and then use AI assistants (such as Claude, ChatGPT, Cursor) to manage their advertising campaigns through natural language.

### Rate Limiting & Abuse Prevention

VibeFly fully respects Meta's API rate limits and additionally implements its own server-side rate limiting to prevent abuse and ensure all usage complies with Meta Platform Policies.

**Meta API rate limit compliance:**

- VibeFly monitors the `x-business-use-case-usage` and `x-app-usage` headers returned by the Meta Graph API to track usage against Meta's rate limit thresholds.
- When approaching Meta's rate limits, VibeFly automatically throttles requests to avoid exceeding the allowed thresholds.

**Server-side rate limiting (VibeFly's own controls):**

- Every API request is checked against per-workspace rate limits **before** being forwarded to Meta's API.
- Rate limits are enforced on two time windows: **per hour** and **per day**, using KV-based counters.
- Rate limits are tied to the user's subscription plan, ensuring fair usage:
  - **Free plan**: 20 requests/hour, 20 requests/day
  - **Pro plan**: Higher limits based on subscription tier
  - **Enterprise plan**: Custom rate limits tailored to the client's needs
- **Upload limits**: Daily limits on image and video uploads per workspace, also enforced per plan.
- When a workspace exceeds its rate limit, VibeFly returns a clear error message with a `retryAfter` indicator — no request is forwarded to Meta.

**Abuse prevention:**

- All write operations (campaign creation, ad management) are restricted to paid plans only — Free plan users cannot perform any write operations, which prevents unauthorized or unintended modifications.
- VibeFly never takes autonomous actions on users' Meta accounts. Every API call is explicitly initiated by the authenticated user through their AI assistant.
- Access to ad accounts is scoped per workspace. Users can only interact with the ad accounts they have explicitly connected and authorized.

### Data Handling

- **Tokens**: Encrypted at rest using AES-256 (pgcrypto). Never exposed to the frontend.
- **Campaign data**: Fetched in real-time as a proxy. Not stored persistently.
- **Creative assets**: Stored in Cloudflare R2, isolated per workspace.
- **No data selling**: We never sell, rent, or share user data with third parties.

### User Control

- Users can disconnect their Meta account at any time from the workspace dashboard.
- Users can revoke access via Facebook Settings > Business Integrations.
- Users can delete their account and all associated data.
- Data deletion instructions available at https://www.vibefly.app/data-deletion.

---

*Document generated: 2026-04-02*
*Meta Graph API version: v24.0*
