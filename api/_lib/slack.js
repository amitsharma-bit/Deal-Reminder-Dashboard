const SLACK_TOKEN = process.env.SLACK_TOKEN;
const BASE = 'https://slack.com/api';
const SLACK_ID_RE = /^[UW][A-Z0-9]{6,}$/;

// Incoming webhook URLs, one per channel: {"team_sales_pod_archit": "https://hooks.slack.com/...", ...}
// Each webhook posts to exactly the channel it was created for — no bot token needed,
// but it also can't DM users, so owner reminders still go through the bot token below.
function webhookMap() {
  try {
    return JSON.parse(process.env.SLACK_WEBHOOKS || '{}');
  } catch (e) {
    return {};
  }
}

function assertToken() {
  if (!SLACK_TOKEN) throw new Error('SLACK_TOKEN is not configured');
}

async function call(method, params) {
  assertToken();
  const r = await fetch(`${BASE}/${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SLACK_TOKEN}`, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(params),
  });
  const data = await r.json();
  if (!data.ok) throw new Error(`Slack ${method} failed: ${data.error}`);
  return data;
}

// Accepts a Slack member ID directly, or falls back to matching a handle/display
// name/email against the workspace's user list.
async function resolveUserId(handle) {
  const clean = handle.trim().replace(/^@/, '');
  if (SLACK_ID_RE.test(clean)) return clean;

  let cursor;
  for (let page = 0; page < 10; page++) {
    const data = await call('users.list', cursor ? { cursor, limit: 200 } : { limit: 200 });
    const match = (data.members || []).find(m =>
      m.name === clean ||
      (m.profile && (m.profile.display_name === clean || m.profile.real_name === clean || m.profile.email === clean))
    );
    if (match) return match.id;
    cursor = data.response_metadata && data.response_metadata.next_cursor;
    if (!cursor) break;
  }
  throw new Error(`Could not resolve Slack user "${handle}"`);
}

// payload is {text, blocks?} — text is the plain-text fallback/notification string,
// blocks is optional Block Kit content (e.g. to render a "View in HubSpot" link button).
async function postToChannel(channel, payload) {
  const clean = channel.trim().replace(/^#/, '');
  const webhookUrl = webhookMap()[clean];

  if (webhookUrl) {
    const r = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(`Slack webhook for #${clean} failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
    return { ok: true };
  }

  const target = channel.startsWith('#') || SLACK_ID_RE.test(channel) ? channel : `#${channel}`;
  return call('chat.postMessage', { channel: target, ...payload });
}

async function postDm(handle, payload) {
  const userId = await resolveUserId(handle);
  return call('chat.postMessage', { channel: userId, ...payload });
}

module.exports = { postToChannel, postDm };
