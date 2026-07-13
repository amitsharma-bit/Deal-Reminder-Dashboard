# Deal Reminder Dashboard

A dashboard for surfacing overdue HubSpot deals and sending one-click Slack
reminders to the deal owner and their team channel. Live at
https://deal-reminder-dashboard.vercel.app

## What it does

- Lists deals whose **Expected Contract Closure Date** has passed while the deal is
  still in one of these HubSpot pipeline stages:
  - Demo Accepted (Auto Pipeline)
  - In Discussion (Auto Pipeline)
  - Contract Initiated (Auto Pipeline)
  - Future Prospect (Auto Pipeline)
- Shows days overdue, deal value, owner, and team, with search/filter/sort.
- One click ("Remind") sends a Slack DM to the deal owner and a message to their
  team's Slack channel.
- Bulk select + send for multiple deals at once.
- "Refresh from HubSpot" re-pulls the live overdue list (also runs automatically
  on page load).
- Owner → Slack handle and Team → Slack channel mappings are configured once via
  the **Slack mapping** panel and persisted in the browser (`localStorage`).

## Architecture

- `public/index.html` — the frontend: static HTML/CSS/JS, no build step, no
  framework. Ships with an embedded snapshot of deals for instant first paint,
  then calls `/api/deals` and `/api/owners` on load to replace it with live data.
- `api/deals.js`, `api/owners.js`, `api/remind.js` — Vercel serverless functions
  that talk to HubSpot and Slack directly using server-side tokens. The browser
  never sees the HubSpot or Slack credentials.
- `api/_lib/hubspot.js`, `api/_lib/slack.js` — shared HubSpot/Slack API helpers.

## Running locally

No build step. To develop against the real APIs:

```
npm i -g vercel
cp .env.example .env   # fill in HUBSPOT_TOKEN and SLACK_TOKEN
vercel dev
```

## Environment variables

| Variable | Purpose |
|---|---|
| `HUBSPOT_TOKEN` | HubSpot private app token (needs `crm.objects.deals.read` and `crm.objects.owners.read`) |
| `SLACK_TOKEN` | Slack token used for `chat.postMessage` / `users.list`. Should be a Bot User OAuth token (`xoxb-...`) with `chat:write` scope for production use — see note below. |

Set these in the Vercel project's environment variables (Production + Preview),
not in a committed file — `.env` is gitignored.

> **Slack token note**: a bot token (`xoxb-...`) from a Slack App is the durable
> choice — it doesn't expire and sends as a bot rather than as a person. A
> personal user token (`xoxp-...` / `xoxe.xoxp-...`) will work only if it carries
> `chat:write` scope, and short-lived rotating tokens expire in hours and need to
> be refreshed manually.

## Deployment

Deployed on Vercel, linked to this GitHub repo (`spyne-projects` team) — pushes to
`main` redeploy automatically. `public/` is served as static output; `api/*.js`
run as serverless functions.

## Slack mapping defaults

Team → channel defaults are pre-filled for:

| HubSpot Team | Slack Channel |
|---|---|
| Saarthak Team | #team_sales_pod_saarthak |
| Neelima Team | #team_sales_pod_neelima |
| Prince Team | #team_sales_pod_prince |
| Archit team | #team_sales_pod_archit |

Individual owner → Slack handle mappings are left blank by default and can be
filled in via the Slack mapping panel (email, `@handle`, or Slack member ID all work).
