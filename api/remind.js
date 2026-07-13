const { postToChannel, postDm } = require('./_lib/slack');

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

  const text = buildReminderText(deal);

  const errors = [];
  if (ownerHandle) {
    try { await postDm(ownerHandle, text); } catch (e) { errors.push(e.message); }
  }
  if (channel) {
    try { await postToChannel(channel, text); } catch (e) { errors.push(e.message); }
  }

  if (errors.length) {
    res.status(502).json({ error: errors.join('; ') });
  } else {
    res.status(200).json({ ok: true });
  }
};
