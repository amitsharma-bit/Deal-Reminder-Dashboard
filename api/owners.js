const { fetchAllOwners } = require('./_lib/hubspot');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const owners = await fetchAllOwners();
    const list = Object.values(owners)
      .map(o => ({ id: o.id, name: o.name, team: o.team }))
      .sort((a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name));

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ owners: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
