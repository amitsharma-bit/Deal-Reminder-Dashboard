const { fetchAllOwners, searchOverdueDeals } = require('./_lib/hubspot');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const [owners, { deals, total }] = await Promise.all([fetchAllOwners(), searchOverdueDeals()]);

    const now = new Date();
    const todayMidnightUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

    const items = deals.map(d => {
      let daysOver = null;
      if (d.expected) {
        const [y, m, day] = d.expected.split('-').map(Number);
        daysOver = Math.round((todayMidnightUTC - Date.UTC(y, m - 1, day)) / 86400000);
      }
      const ownerMeta = d.ownerId != null ? owners[d.ownerId] : null;
      return {
        id: d.id,
        name: d.name,
        stage: d.stage,
        amount: d.amount,
        expected: d.expected,
        daysOver,
        ownerId: d.ownerId,
        owner: ownerMeta ? ownerMeta.name : (d.ownerId ? `Owner ${d.ownerId}` : 'Unassigned'),
        team: ownerMeta ? ownerMeta.team : 'Unassigned',
      };
    });

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ items, total: total ?? items.length, syncedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
