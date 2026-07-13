# Deal Reminder Dashboard

A single-file, self-contained dashboard for surfacing overdue HubSpot deals and
sending one-click Slack reminders to the deal owner and their team channel.

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
- "Refresh from HubSpot" re-pulls the live overdue list on demand.
- Owner → Slack handle and Team → Slack channel mappings are configured once via
  the **Slack mapping** panel and persisted for future visits.

## Usage

This is a plain HTML/CSS/JS file (`index.html`) with no build step and no server.

- **Open directly**: download `index.html` and open it in a browser, or
- **Host it**: serve it from GitHub Pages, Netlify, or any static host, or
- **Run it inside Claude**: upload/open it as a Claude artifact, where it can use
  `window.storage` for persistence and call the Anthropic API (with HubSpot/Slack
  MCP connectors) to pull live data and send reminders.

> Note: The live "Refresh from HubSpot" and "Remind" actions call
> `https://api.anthropic.com/v1/messages` with MCP server integrations for HubSpot
> and Slack. These calls only succeed when run in an environment that proxies/
> authorizes that request (e.g. as a Claude artifact with HubSpot and Slack
> connected). Outside that environment, the dashboard still renders and lets you
> browse the embedded snapshot, but live refresh/send will fail.

## Data snapshot

The dashboard ships with a real snapshot of overdue deals pulled from HubSpot at
build time, so it's immediately useful without needing a live connection. Use
**Refresh from HubSpot** to pull the current state.

## Slack mapping defaults

Team → channel defaults are pre-filled for:

| HubSpot Team | Slack Channel |
|---|---|
| Saarthak Team | #team_sales_pod_saarthak |
| Neelima Team | #team_sales_pod_neelima |
| Prince Team | #team_sales_pod_prince |
| Archit team | #team_sales_pod_archit |

Individual owner → Slack handle mappings are left blank by default and can be
filled in via the Slack mapping panel.
