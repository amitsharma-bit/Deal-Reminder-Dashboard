const { postToChannel, postDm } = require('./_lib/slack');

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

  const amount = Number(deal.amount) || 0;
  const text = `⏰ Deal reminder: The deal "${deal.name}" (HubSpot ID ${deal.id}, $${amount.toLocaleString()}) is in the "${deal.stage}" stage with an Expected Contract Closure Date of ${deal.expected}, which is ${deal.daysOver} day(s) in the past. Owner: ${deal.owner}. Please review and update the close date or move the deal forward.`;

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
