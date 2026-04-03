# VibeFly — App Review Descriptions (Meta)

> Textos prontos para colar no formulário de App Review da Meta.
> Cada permissão precisa de: descrição, instruções de teste, e telas dependentes.

---

## 1. `ads_read`

### Description (para o formulário)

VibeFly is a SaaS advertising management platform that helps users view, analyze, and manage their Meta ad campaigns from a centralized web dashboard with built-in AI assistance. The `ads_read` permission is essential for our core functionality: allowing users to view and analyze their existing ad campaigns directly within the VibeFly platform.

**How we use this permission:**

1. **List ad accounts** — When a user connects their Meta account, we call `GET /me/adaccounts` to display all available ad accounts on the workspace dashboard so the user can select which ones to manage.

2. **View campaigns, ad sets, and ads** — Users browse their campaigns, ad sets, and ads within the VibeFly dashboard, or use the built-in AI assistant to quickly retrieve specific data. We call `GET /{account_id}/campaigns`, `GET /{campaign_id}/adsets`, and `GET /{adset_id}/ads` to retrieve and display this data.

3. **View ad creatives** — Users review their creative assets through `GET /{ad_id}/adcreatives` and `GET /{creative_id}` to see images, videos, headlines, and call-to-action configurations.

4. **Analyze performance (Insights)** — Users view performance dashboards with metrics like impressions, clicks, CTR, CPC, spend, and conversions. We call `GET /{object_id}/insights` with date filters and breakdowns by age, gender, platform, or country.

5. **Research targeting** — Users search for interests (`GET /search?type=adinterest`), behaviors, demographics, and geo-locations to plan campaign targeting.

6. **Estimate audience size** — Users estimate reach for a given targeting configuration via `GET /{account_id}/reachestimate`.

7. **Search Ad Library** — Users search public ads via `GET /ads_archive` for competitive analysis.

All data is displayed only to the authenticated user who owns the ad account. We never store campaign data persistently — it is fetched in real-time and displayed within the user's dashboard.

### Test Instructions (para o revisor)

1. Log in to VibeFly at https://www.vibefly.app using the test account provided.
2. Create a workspace or use the existing test workspace.
3. Connect a Meta account by clicking "Connect Meta Account" on the workspace dashboard.
4. After connecting, the dashboard will display the user's ad accounts with campaign data.
5. Navigate to the campaigns section to see campaign listings, ad sets, and ads — this demonstrates the `ads_read` permission reading campaign data.
6. Open the performance insights panel and select a date range to view metrics (impressions, clicks, CTR, spend) — this demonstrates reading performance metrics.
7. Use the targeting research tool to search for interests related to "fitness" — this demonstrates the targeting research feature.
8. Optionally, use the built-in AI assistant to ask questions like "Show me my top campaigns by spend" for a natural-language experience.

### Screens/Features That Depend on This Permission

- Workspace dashboard (campaign, ad set, and ad listings)
- Insights and performance metrics panel
- Targeting research and audience estimation tools
- Ad Library search
- Built-in AI assistant for natural-language queries

---

## 2. `ads_management`

### Description (para o formulário)

VibeFly uses the `ads_management` permission to enable users to create and manage Meta advertising campaigns directly from the VibeFly platform. Users can manage campaigns through the web dashboard interface or with the help of a built-in AI assistant that guides them through campaign setup. This is a core feature of our paid plans (Pro and Enterprise).

**How we use this permission:**

1. **Create campaigns** — Users create a new campaign by specifying an objective (e.g., CONVERSIONS, TRAFFIC), name, and budget through the campaign creation flow. We call `POST /{account_id}/campaigns`.

2. **Update campaigns** — Users modify campaign name, status (ACTIVE/PAUSED), or budget via `POST /{campaign_id}`.

3. **Create ad sets** — Users create ad sets with specific targeting (age, gender, interests, location), daily/lifetime budget, schedule, and placement via `POST /{account_id}/adsets`.

4. **Update ad sets** — Users modify targeting, budget, schedule, or status via `POST /{adset_id}`.

5. **Create and update ads** — Users create ads linking a creative to an ad set via `POST /{account_id}/ads`, or update status/name via `POST /{ad_id}`.

6. **Upload images and videos** — Users upload creative assets via `POST /{account_id}/adimages` and `POST /{account_id}/advideos` for use in ad creatives.

7. **Create ad creatives** — Users create ad creatives with images/videos, text, headlines, and CTAs via `POST /{account_id}/adcreatives`.

8. **Budget scheduling** — Users create budget schedules for campaigns via `POST /{campaign_id}/budget_schedules`.

All write operations are initiated exclusively by the user through the VibeFly interface. VibeFly never takes autonomous actions on the user's Meta account.

**Access restrictions by plan:**
- Free plan: Read-only access (no write operations)
- Pro plan ($49/month): Full access to all campaign management features
- Enterprise plan ($199/month): Full access with higher upload limits

### Test Instructions (para o revisor)

1. Log in to VibeFly at https://www.vibefly.app using the test account provided (Pro plan).
2. Connect a Meta account on the workspace dashboard.
3. Navigate to the campaign management section and click "Create Campaign".
4. Select the TRAFFIC objective, name it "Test Campaign", and set a daily budget of $10 — this demonstrates campaign creation.
5. From the campaign list, select "Test Campaign" and click "Pause" — this demonstrates campaign status update.
6. Create an ad set for "Test Campaign" with targeting: women aged 25-45 in Brazil interested in fitness — this demonstrates ad set creation with targeting.
7. Upload a test image via the creative upload section — this demonstrates image upload.
8. Optionally, use the built-in AI assistant to perform any of these actions via natural language (e.g., "Create a TRAFFIC campaign with $10/day budget").

### Screens/Features That Depend on This Permission

- Campaign creation and management dashboard
- Ad set and ad editing interface
- Image and video upload for creatives
- Ad creative creation with image or video
- Budget scheduling
- Built-in AI assistant for guided campaign setup

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
3. Navigate to the creative builder and click "Create Ad Creative".
4. Select a previously uploaded image, enter the destination URL (https://example.com), headline ("Test Ad"), and message ("This is a test").
5. Select the Facebook Page "Test Page" from the page selector dropdown — this demonstrates creating a creative linked to a page.
6. The creative will be created with the `object_story_spec` containing the selected page ID.
7. Optionally, use the AI assistant to create the creative via natural language.

### Screens/Features That Depend on This Permission

- Ad creative creation (image and video) in the creative builder
- Complete campaign creation flow
- AI assistant guided creative setup

---

## 5. `pages_read_engagement`

### Description (para o formulário)

VibeFly uses the `pages_read_engagement` permission to read the user's Facebook Pages so they can select which page to associate with their ad creatives from a dropdown in the platform.

**How we use this permission:**

1. **List user's pages** — We call `GET /me/accounts` to display the Facebook Pages the user manages, showing name, category, follower count, and verification status.

2. **List ad account pages** — We call `GET /{account_id}/owned_pages` to find pages directly linked to the ad account.

3. **Search promotable pages** — When creating a creative, users can search their promotable pages via `GET /{account_id}/promote_pages` to select the correct page for the ad.

**Why this is necessary:** To create an ad creative, the user needs to provide a `page_id`. This permission allows VibeFly to populate the page selector in the creative builder, so the user can pick the correct page instead of having to manually look up and provide the page ID.

### Test Instructions (para o revisor)

1. Log in to VibeFly at https://www.vibefly.app using the test account provided.
2. Connect a Meta account with at least one Facebook Page.
3. Navigate to the workspace dashboard — the connected Facebook Pages will be listed with name, category, and follower count.
4. Go to the creative builder and start creating an ad creative — the page selector dropdown will show available pages, demonstrating the page listing functionality.
5. Use the search field in the page selector to filter pages by name (e.g., search "Test") — this demonstrates promotable page search.

### Screens/Features That Depend on This Permission

- Facebook Pages listing on workspace dashboard
- Page selector dropdown in the creative builder
- Promotable pages search

---

## General Information for All Permissions

### About VibeFly

VibeFly is a SaaS advertising management platform (https://www.vibefly.app) that provides a centralized web dashboard for managing Meta ad campaigns. Users connect their Meta accounts through standard Facebook Login (OAuth 2.0), and then use the VibeFly dashboard to view campaigns, analyze performance, create ads, and upload creative assets. The platform also includes a built-in AI assistant that allows users to perform these same actions through natural language, making campaign management faster and more accessible.

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
