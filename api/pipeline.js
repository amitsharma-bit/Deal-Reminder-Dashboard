const {
  fetchAllOwners, searchPipelineDeals, fetchDealCompanyIds, fetchCompanies, fetchSalesOwnerLabels,
} = require('./_lib/hubspot');

// In-pipeline deals (mirrors HubSpot report 508004491, "Deal Report - Convo"), one item
// per deal with its associated companies (rooftops) nested under `rooftops`.
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const [owners, salesOwnerLabels, { deals, total }] = await Promise.all([
      fetchAllOwners(), fetchSalesOwnerLabels(), searchPipelineDeals(),
    ]);

    // Rooftop details need the crm.objects.companies.read scope. If the token lacks it,
    // still return the deals and tell the UI why the rooftop columns are empty.
    let dealCompanies = {};
    let companies = {};
    let rooftopsError = null;
    try {
      dealCompanies = await fetchDealCompanyIds(deals.map(d => d.id));
      const allIds = [...new Set(Object.values(dealCompanies).flat())];
      companies = await fetchCompanies(allIds);
    } catch (e) {
      rooftopsError = e.message;
    }

    const ownerName = id => {
      if (id == null) return null;
      const o = owners[id];
      return o ? o.name : null;
    };

    const items = deals.map(d => {
      const ownerMeta = d.ownerId != null ? owners[d.ownerId] : null;
      const rooftops = (dealCompanies[String(d.id)] || [])
        .map(cid => companies[cid])
        .filter(Boolean)
        .sort((a, b) => (b.lastActivity || '').localeCompare(a.lastActivity || '') || a.name.localeCompare(b.name));
      const lastActivity = rooftops.reduce((m, r) => (r.lastActivity && (!m || r.lastActivity > m) ? r.lastActivity : m), null);
      const group = rooftops.map(r => r.gdName || r.orgName).find(Boolean) || null;
      return {
        ...d,
        owner: ownerMeta ? ownerMeta.name : (d.ownerId ? `Owner ${d.ownerId}` : 'Unassigned'),
        team: ownerMeta ? ownerMeta.team : 'Unassigned',
        salesOwner: d.salesOwnerId
          ? (salesOwnerLabels[d.salesOwnerId] || ownerName(Number(d.salesOwnerId)) || `Owner ${d.salesOwnerId}`)
          : null,
        group,
        lastActivity,
        rooftops,
      };
    });

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ items, total: total ?? items.length, rooftopsError, syncedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
