const SLACK_TOKEN = process.env.SLACK_TOKEN;
const BASE = 'https://slack.com/api';
const SLACK_ID_RE = /^[UW][A-Z0-9]{6,}$/;

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

async function postToChannel(channel, text) {
  const target = channel.startsWith('#') || SLACK_ID_RE.test(channel) ? channel : `#${channel}`;
  return call('chat.postMessage', { channel: target, text });
}

async function postDm(handle, text) {
  const userId = await resolveUserId(handle);
  return call('chat.postMessage', { channel: userId, text });
}

module.exports = { postToChannel, postDm };
