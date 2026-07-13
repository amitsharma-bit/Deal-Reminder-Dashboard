const { postToChannel, postDm } = require('./_lib/slack');

const HUBSPOT_PORTAL_ID = '242626590';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function buildReminderText(deal) {
  return [
    `*Deal Owner:* ${deal.owner}`,
    `Your expected contract closure date is outdated (${formatDate(deal.expected)}) and the deal is still In-Pipeline. Kindly update it.`,
    '',
    `*Deal Name:* ${deal.name}`,
    `*Deal Owner:* ${deal.owner}`,
    `*Deal Stage:* ${deal.stage}`,
  ].join('\n');
}

function buildReminderPayload(deal) {
  const text = buildReminderText(deal);
  const dealUrl = `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/record/0-3/${deal.id}`;
  return {
    text,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text } },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View deal in HubSpot', emoji: true },
            url: dealUrl,
            action_id: 'view_deal_in_hubspot',
          },
        ],
      },
    ],
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { deal, channel, ownerHandle } = req.body || {};
  if (!deal || !deal.name) {
    res.status(400).json({ error: 'Missing deal in request body' });
    return;
  }
  if (!channel && !ownerHandle) {
    res.status(400).json({ error: 'No Slack channel or owner handle provided' });
    return;
  }

  const payload = buildReminderPayload(deal);

  const errors = [];
  if (ownerHandle) {
    try { await postDm(ownerHandle, payload); } catch (e) { errors.push(e.message); }
  }
  if (channel) {
    try { await postToChannel(channel, payload); } catch (e) { errors.push(e.message); }
  }

  if (errors.length) {
    res.status(502).json({ error: errors.join('; ') });
  } else {
    res.status(200).json({ ok: true });
  }
};
