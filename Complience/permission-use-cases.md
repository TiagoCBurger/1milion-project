# VibeFly — Permission Use Cases (Meta API)

> Detailed documentation of how each Meta Platform API permission is used in VibeFly.
> For use in the Meta App Review form.

---

## 1. `ads_read`

**Summary**: Allows VibeFly users to view and analyze their existing Meta ad campaigns directly from the web dashboard or via an external AI assistant connected through MCP.

### Use Cases

1. **List ad accounts** — The user connects their Meta account and VibeFly lists all ad accounts (`/me/adaccounts`) so they can select which one to manage.

2. **View campaigns** — The user browses their active campaigns in the dashboard. VibeFly queries `/{account_id}/campaigns` and returns each campaign's name, status, objective, and budget.

3. **View ad sets** — The user views the ad sets of a specific campaign via `/{campaign_id}/adsets`, including targeting, budget, schedule, and status.

4. **View ads** — The user views individual ads via `/{adset_id}/ads` or `/{account_id}/ads`, including status, creative, and delivery settings.

5. **View creative details** — The user views the creatives associated with an ad (`/{ad_id}/adcreatives`), including images, videos, text, and call-to-action.

6. **Analyze performance (Insights)** — The user requests performance metrics such as impressions, clicks, CTR, CPC, spend, and conversions via `/{object_id}/insights`, with date filters and breakdowns by age, gender, platform, or country.

7. **Research targeting** — The user searches for interests (`/search?type=adinterest`), behaviors (`/search?type=adTargetingCategory&class=behaviors`), demographics, and geo-locations to plan campaign targeting.

8. **Estimate audience** — The user estimates the size of an audience based on targeting criteria via `/{account_id}/reachestimate`.

9. **Search Ad Library** — The user searches public ads in the Meta Ad Library (`/ads_archive`) for competitive analysis.

### Screens/Features That Depend on This Permission

- Main dashboard (campaign, ad set, and ad listings)
- Insights and performance metrics panel
- Targeting research and audience estimation tools
- Ad Library search
- All MCP read tools (available on the Free plan)

### Graph API Endpoints Used

| Endpoint | Operation |
|---|---|
| `GET /me/adaccounts` | List user's ad accounts |
| `GET /{account_id}` | Ad account details |
| `GET /{account_id}/campaigns` | List campaigns |
| `GET /{campaign_id}` | Campaign details |
| `GET /{account_id}/adsets` | List ad sets by account |
| `GET /{campaign_id}/adsets` | List ad sets by campaign |
| `GET /{adset_id}` | Ad set details |
| `GET /{account_id}/ads` | List ads by account |
| `GET /{campaign_id}/ads` | List ads by campaign |
| `GET /{adset_id}/ads` | List ads by ad set |
| `GET /{ad_id}` | Ad details |
| `GET /{ad_id}/adcreatives` | List creatives for an ad |
| `GET /{creative_id}` | Creative details |
| `GET /act_{account_id}/adimages` | Get image URL by hash |
| `GET /{video_id}` | Video details |
| `GET /{object_id}/insights` | Performance metrics |
| `GET /search?type=adinterest` | Search interests |
| `GET /search?type=adinterestsuggestion` | Interest suggestions |
| `GET /search?type=adTargetingCategory` | Search behaviors/demographics |
| `GET /search?type=adgeolocation` | Search locations |
| `GET /{account_id}/reachestimate` | Estimate audience size |
| `GET /ads_archive` | Search Ad Library |

---

## 2. `ads_management`

**Summary**: Allows VibeFly users to create and manage Meta ad campaigns from the web dashboard or via an external AI assistant connected through MCP, including image and video uploads.

### Use Cases

1. **Create campaign** — The user creates a new ad campaign by specifying an objective (CONVERSIONS, TRAFFIC, etc.), name, and budget via the dashboard or AI assistant. VibeFly calls `POST /{account_id}/campaigns`.

2. **Update campaign** — The user modifies the name, status (ACTIVE/PAUSED), budget, or settings of an existing campaign via `POST /{campaign_id}`.

3. **Create ad set** — The user creates an ad set with specific targeting (age, gender, interests, location), daily/lifetime budget, schedule, and placement via `POST /{account_id}/adsets`.

4. **Update ad set** — The user modifies targeting, budget, schedule, or status of an existing ad set via `POST /{adset_id}`.

5. **Create ad** — The user creates an ad linking a creative to an ad set via `POST /{account_id}/ads`.

6. **Update ad** — The user changes the status, name, or creative of an existing ad via `POST /{ad_id}`.

7. **Upload image** — The user uploads an image (base64 or URL) to use in creatives. VibeFly uploads it via `POST /{account_id}/adimages` and receives an `image_hash`.

8. **Upload video** — The user uploads a video (base64 or URL) to use in creatives. VibeFly uploads it via `POST /{account_id}/advideos` and receives a `video_id`.

9. **Create creative** — The user creates an ad creative with an image or video, text, headline, link, and call-to-action via `POST /{account_id}/adcreatives`.

10. **Update creative** — The user renames an existing creative via `POST /{creative_id}`.

11. **List promotable pages** — During ad creative creation, VibeFly lists the user's promotable pages via `GET /{account_id}/promote_pages` so the user can select which page to associate with the ad.

12. **Create budget schedule** — The user creates a budget schedule for a campaign via `POST /{campaign_id}/budget_schedules`.

### Access Restrictions by Plan

- **Free**: No access to write tools. Returns an error prompting an upgrade.
- **Pro ($49/month)**: Full access to all create and edit operations.
- **Enterprise ($199/month)**: Full access with expanded upload limits.

### Screens/Features That Depend on This Permission

- Campaign creation and management dashboard
- Ad set and ad editing interface
- Image and video upload for creatives
- Ad creative creation with image or video
- Facebook Page selector (lists promotable pages during creative creation)
- Budget scheduling
- MCP interface for AI assistant guided campaign setup (secondary, no autonomous use)

### Graph API Endpoints Used

| Endpoint | Operation |
|---|---|
| `POST /{account_id}/campaigns` | Create campaign |
| `POST /{campaign_id}` | Update campaign |
| `POST /{account_id}/adsets` | Create ad set |
| `POST /{adset_id}` | Update ad set |
| `POST /{account_id}/ads` | Create ad |
| `POST /{ad_id}` | Update ad |
| `POST /{account_id}/adimages` | Upload image |
| `POST /{account_id}/advideos` | Upload video |
| `POST /{account_id}/adcreatives` | Create creative |
| `POST /{creative_id}` | Update creative |
| `GET /{account_id}/promote_pages` | List promotable pages during creative creation |
| `POST /{campaign_id}/budget_schedules` | Create budget schedule |

---

## 3. `business_management`

**Summary**: Allows VibeFly to access the user's Business Managers and list their associated ad accounts, so the user can manage multiple accounts across different Business Managers.

### Use Cases

1. **List Business Managers** — After OAuth login, VibeFly queries `/me/businesses` to discover all Business Managers the user administers.

2. **List ad accounts by Business Manager** — For each Business Manager, VibeFly queries `/{bm_id}/owned_ad_accounts` to list available ad accounts. The user then selects which accounts to connect to their workspace.

3. **Search Business Managers** — The user can search their Business Managers by name via `/me/businesses` with a name filter.

### Connection Flow

```
OAuth Login → /me/businesses → list BMs
           → /{bm_id}/owned_ad_accounts (for each BM) → list accounts
           → User selects accounts → Saved to workspace
```

### Screens/Features That Depend on This Permission

- Meta account connection screen (onboarding)
- Business Manager and ad account selection
- Business Manager search on dashboard

### Graph API Endpoints Used

| Endpoint | Operation |
|---|---|
| `GET /me/businesses` | List user's Business Managers |
| `GET /{bm_id}/owned_ad_accounts` | List ad accounts for a BM |

---

## 4. `pages_manage_ads`

**Summary**: Allows VibeFly to create ad creatives linked to the user's Facebook Pages, required to publish ads that appear as page posts in the feed.

### Use Cases

1. **Create image creative linked to a page** — The user creates an ad creative with `object_story_spec` containing `page_id`, `link_data` (image, link, message, headline, CTA). The ad appears in the feed as a post from the selected page.

2. **Create video creative linked to a page** — The user creates an ad creative with `object_story_spec` containing `page_id`, `video_data` (video, message, headline, link, CTA). The ad appears as a video published by the page.

3. **Create creative with Instagram placement** — Optionally, the user can include `instagram_actor_id` in the creative so the ad also appears on Instagram linked to the page.

### Why This Is Necessary

Meta requires that every ad in the feed be published "on behalf of" a Facebook Page. The `object_story_spec` is the structure that links the creative to the page. Without `pages_manage_ads`, it is not possible to create creatives with this structure.

### Screens/Features That Depend on This Permission

- Ad creative creation (image and video)
- Complete campaign creation flow via dashboard or AI assistant

### Graph API Endpoints Used

| Endpoint | Operation |
|---|---|
| `POST /{account_id}/adcreatives` | Create creative with `object_story_spec` containing `page_id` |

---

## 5. `pages_read_engagement`

**Summary**: Allows VibeFly to read the user's Facebook Pages and their engagement data so the user can select the correct page when creating ads.

### Use Cases

1. **List user's pages** — VibeFly lists the Facebook Pages the user manages via `/me/accounts`, displaying name, category, follower count, and verification status.

2. **List ad account pages** — VibeFly queries `/{account_id}/owned_pages` to find pages directly linked to the ad account.

3. **Search promotable pages** — When creating a creative, the user can search among their promotable pages (`/{account_id}/promote_pages`) to select the correct page to associate with the ad.

### Why This Is Necessary

To create an ad creative, the user must provide a valid `page_id`. This permission allows VibeFly to list available pages so the user can select the correct one, instead of having to look up and enter the ID manually.

### Screens/Features That Depend on This Permission

- Pages listing on workspace dashboard
- Page selector when creating creatives
- Promotable pages search

### Graph API Endpoints Used

| Endpoint | Operation |
|---|---|
| `GET /me/accounts` | List user's pages |
| `GET /{account_id}/owned_pages` | List pages linked to the ad account |
| `GET /{account_id}/promote_pages` | List promotable pages (with name filter) |

---

## 6. `pages_show_list`

**Summary**: Allows VibeFly to access the list of Facebook Pages that a user manages. Used to populate the page selector in the ad creative creation flow and to confirm page ownership before linking a page to an ad.

### Use Cases

1. **List managed pages on the dashboard** — After connecting a Meta account, VibeFly calls `GET /me/accounts` to display the Facebook Pages the user manages. This list appears in the workspace dashboard so users know which pages are available for their ads.

2. **Populate the page selector in the creative builder** — When a user creates an ad creative, the page selector dropdown is populated with the pages returned by `GET /me/accounts`. The user selects the page that will be associated with the ad via `object_story_spec`.

3. **Confirm page ownership** — Before creating a creative, VibeFly confirms that the selected `page_id` belongs to the authenticated user, preventing accidental use of unauthorized pages.

### Why This Is Necessary

To create an ad creative with `object_story_spec`, the user must provide a valid `page_id` from a page they manage. Without `pages_show_list`, VibeFly cannot list the available pages to populate the selector. The user would have to find and enter the page ID manually, which is impractical.

### Permitted Use Per Meta Policy

- We show the user the list of Pages they manage (primary and permitted use).
- We confirm whether the user manages a specific Page (permitted use).
- We do not use page data for any purpose outside the ad creative creation flow.
- We do not store page data beyond the `page_id` selected for association with a creative.

### Screens/Features That Depend on This Permission

- Facebook Pages listing on workspace dashboard
- Page selector dropdown in the creative builder (required for ad creative creation)
- Page ownership confirmation before creative creation

### Graph API Endpoints Used

| Endpoint | Operation |
|---|---|
| `GET /me/accounts` | List Facebook Pages managed by the user |

---

## Permission × Features Summary

| Permission | Free Plan | Pro Plan | Enterprise Plan |
|---|---|---|---|
| `ads_read` | Full read access | Full read access | Full read access |
| `ads_management` | Blocked | Full write access | Full write access |
| `business_management` | List BMs and accounts | List BMs and accounts | List BMs and accounts |
| `pages_manage_ads` | Blocked | Create creatives | Create creatives |
| `pages_read_engagement` | List pages | List pages | List pages |
| `pages_show_list` | List managed pages | List managed pages | List managed pages |

---

*Document generated: 2026-04-03*
*Meta Graph API version: v24.0*
