# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A small Vercel app: a static HTML/CSS/JS dashboard (`public/index.html`) backed by
four serverless functions (`api/*.js`). Two views: overdue HubSpot deals with Slack
reminders, and an "In pipeline" view mirroring a saved HubSpot report. No frontend framework, no bundler, no test suite.

## Running / developing

There is no build step.

- **Local dev with working APIs**: `cp .env.example .env`, fill in `HUBSPOT_TOKEN`
  and `SLACK_TOKEN`, then `vercel dev` (requires `vercel` CLI). This runs both the
  static frontend and the `/api/*` serverless functions locally.
- **Frontend-only**: opening `public/index.html` directly in a browser works for
  browsing the embedded snapshot, but the `fetch('/api/...')` calls will 404 since
  there's no server — use `vercel dev` to exercise the full app.
- **Live deployment**: https://deal-reminder-dashboard.vercel.app, linked to this
  repo's GitHub remote under the `spyne-projects` Vercel team — pushes to `main`
  redeploy automatically. `public/` is Vercel's detected static output directory;
  `api/*.js` files are auto-detected as serverless functions (no `vercel.json`
  needed).

There is no linter or test suite configured. Verify changes by running `vercel dev`
and exercising the UI, or by calling the API routes directly (e.g.
`curl localhost:3000/api/deals`).

## Secrets

`HUBSPOT_TOKEN`, `SLACK_TOKEN` and the optional `SLACK_WEBHOOKS` are read from
environment variables (`api/_lib/hubspot.js`, `api/_lib/slack.js`) — never hardcode
them. Locally they
live in `.env` (gitignored); in production they're set as Vercel project env vars
(Production + Preview). See README.md's "Environment variables" section for scope
requirements — in particular, the Slack token needs to be a proper bot token
(`xoxb-...`) with `chat:write` scope for reliable long-term sending; personal user
tokens can lack that scope or expire in hours. `SLACK_WEBHOOKS` is a JSON map of
channel name (no `#`) → Slack incoming-webhook URL (see `.env.example`); it is not
yet documented in README.md.

## Architecture

**Frontend** (`public/index.html`, one `<style>` block + one `<script>` block,
all global state and direct DOM manipulation):
- `DEALS_RAW` — an embedded JSON snapshot of overdue deals, shown on first paint
  before the live fetch resolves. Not meant to be kept fresh by hand; it's just a
  fallback for instant load / API unavailability.
- `deals` (mutable) — what's actually rendered. Replaced wholesale by
  `refreshFromHubspot()`, which fetches `/api/deals` and runs automatically on
  page load (`init()`) as well as via the "Refresh from HubSpot" button.
- `OWNERS` / `TEAMS` — populated from `/api/owners` via `loadOwners()` (also run
  on load), used so the Slack-mapping modal can list every HubSpot owner/team,
  not just ones with a currently-overdue deal. Falls back to a static list if that
  fetch fails.
- `config = {channels: {}, slack: {}}` — team→Slack-channel and
  ownerId→Slack-handle mappings, persisted to `localStorage` key `reminder_config`
  (`loadConfig`/`saveConfig`). `loadConfig` back-fills any missing team from
  `DEFAULT_CHANNELS`. This is per-browser; there's no shared backend store, so
  mapping set on one machine won't show up on another.
- Two views toggled by `setView()` (`#viewSwitch`, persisted in the URL hash and
  `localStorage` `active_view`): `#viewOverdue` (everything above) and
  `#viewPipeline`. The pipeline view renders two HubSpot reports (`PIPELINE_REPORTS`:
  Convo 508004491, Studio 507769150) as flat tables whose columns, order and
  labels come from `REPORT_COLUMNS` — keep that in sync with the reports'
  `visual.encodings.columns` if they change. `reportRows(key)` expands each deal
  into one row per company and applies the per-report product filter and the
  per-row `rooftop_last_activity` > 2026-09-01 (US/Eastern) filter, matching how
  HubSpot applies a joined-company filter. Empty cells show `(No value)`, dates
  MM/DD/YYYY; the totals row sums per row like HubSpot (so ARR repeats per
  rooftop), while the ARR widget counts each deal once. Both datasets load on
  init; the navbar refresh button refreshes the active view.
- `sendReminder(dealId, btn)` POSTs the whole deal object to `/api/remind`; bulk
  send just calls it sequentially with a 400 ms gap. `renderTable`/`getFiltered`/
  `renderStats` handle search/filter/sort/rendering off the `deals` array.

**Backend** (`api/*.js`, Vercel serverless functions, CommonJS, use the runtime's
global `fetch` — no dependencies):
- `api/_lib/hubspot.js` — `fetchAllOwners()` paginates `crm/v3/owners` and resolves
  each owner's team from `teams[0].name` (falls back to `"Unassigned"`).
  `searchOverdueDeals()` paginates `crm/v3/objects/deals/search` filtered to the
  four `STAGE_IDS` this dashboard cares about (Demo Accepted / In Discussion /
  Contract Initiated / Future Prospect, all "(Auto Pipeline)" variants) with
  `expected_contract_closure_date LT <today>`. **Gotcha**: HubSpot's object-read
  API returns that property as a plain `"YYYY-MM-DD"` string, but the Search API's
  `LT`/`GT` filters on it require the value as epoch-ms UTC midnight — passing the
  date string directly makes the search silently 400. Keep `STAGE_IDS`/
  `STAGE_LABELS` in sync if pipeline stages change. Both HubSpot paginators (and
  Slack's `users.list` lookup) stop after 10 pages.
- `api/deals.js` — calls both `hubspot.js` functions, merges owner name/team onto
  each deal, computes `daysOver` server-side, returns `{items, total, syncedAt}`.
- `api/pipeline.js` — data for both pipeline reports (all products; the browser
  splits Convo/Studio). `searchPipelineDeals()` applies the reports' shared deal-level filters (closure_chances
  80–100%/100%, the same `STAGE_IDS`, two excluded owner IDs), then
  `fetchDealCompanyIds` (v4 batch associations) + `fetchCompanies` (batch read)
  nest each deal's companies as `rooftops`. Company reads need
  `crm.objects.companies.read`; if they fail, the endpoint still returns deals with
  `rooftopsError` set and the UI shows a notice. `sales_owner` is an enumeration of
  owner IDs, labelled via the property's options (falls back to the owners map).
  Multi-select values are `;`-joined and some carry a leading U+2060, stripped by
  `splitMulti`. ARR (`arr__sales_`) is per deal — the HubSpot report repeats it on
  every rooftop row, so its column totals overcount.
- `api/owners.js` — returns the full owner list (`{id, name, team}`), sorted by
  team then name, for the Slack-mapping modal.
- `api/_lib/slack.js` — `postToChannel(channel, payload)` and
  `postDm(handle, payload)`, where `payload` is `{text, blocks?}` (Block Kit).
  `postToChannel` uses the incoming webhook from `SLACK_WEBHOOKS` if one exists for
  that channel, otherwise `chat.postMessage` with `SLACK_TOKEN`. DMs always need the
  token (webhooks can't DM). `resolveUserId` accepts a Slack member ID directly, or
  paginates `users.list` matching on username/display name/real name/email if
  given a handle or email instead.
- `api/remind.js` — POST body `{deal, channel, ownerHandle}`; builds the message
  text plus a "View deal in HubSpot" button (portal ID hardcoded as
  `HUBSPOT_PORTAL_ID`); sends to whichever
  of `channel`/`ownerHandle` are present, collects per-target errors, and returns
  502 with a combined error message if any target failed (so a bad owner mapping
  doesn't block the channel post, or vice versa).

When changing the overdue-deal query (stage IDs, date filter, pagination), test
against the real HubSpot API directly first (`curl` with the token) — the
Search API's filter-value format for date properties is not obvious from the
object-read API's response shape.
