const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const BASE = 'https://api.hubapi.com';

// HubSpot dealstage IDs for the "(Auto Pipeline)" stages this dashboard tracks.
const STAGE_IDS = ["1534611153", "1534611154", "1534611155", "1534611159"];
const STAGE_LABELS = {
  "1534611153": "Demo Accepted",
  "1534611154": "In Discussion",
  "1534611155": "Contract Initiated",
  "1534611159": "Future Prospect",
};

function headers() {
  if (!HUBSPOT_TOKEN) throw new Error('HUBSPOT_TOKEN is not configured');
  return { Authorization: `Bearer ${HUBSPOT_TOKEN}`, 'Content-Type': 'application/json' };
}

// HubSpot's owner "teams[0].name" already matches the team labels this dashboard uses
// (e.g. "Archit team", "Saarthak Team"); owners with no team become "Unassigned".
async function fetchAllOwners() {
  const owners = {};
  let after;
  for (let page = 0; page < 10; page++) {
    const url = new URL(`${BASE}/crm/v3/owners`);
    url.searchParams.set('limit', '100');
    if (after) url.searchParams.set('after', after);
    const r = await fetch(url, { headers: headers() });
    if (!r.ok) throw new Error(`HubSpot owners API error ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const data = await r.json();
    for (const o of data.results || []) {
      const team = (o.teams && o.teams[0] && o.teams[0].name) || 'Unassigned';
      const name = `${o.firstName || ''} ${o.lastName || ''}`.trim() || o.email || `Owner ${o.id}`;
      owners[o.id] = { id: Number(o.id), name, email: o.email || null, team };
    }
    after = data.paging && data.paging.next ? data.paging.next.after : null;
    if (!after) break;
  }
  return owners;
}

// HubSpot's Search API filters on "date" properties by epoch-ms UTC midnight,
// even though the object read API returns them as plain "YYYY-MM-DD" strings.
async function searchOverdueDeals() {
  const now = new Date();
  const todayMidnightUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  const deals = [];
  let after;
  let total = null;
  for (let page = 0; page < 10; page++) {
    const body = {
      limit: 100,
      filterGroups: [{
        filters: [
          { propertyName: 'dealstage', operator: 'IN', values: STAGE_IDS },
          { propertyName: 'expected_contract_closure_date', operator: 'LT', value: String(todayMidnightUTC) },
          { propertyName: 'expected_contract_closure_date', operator: 'HAS_PROPERTY' },
        ],
      }],
      properties: ['dealname', 'dealstage', 'hubspot_owner_id', 'expected_contract_closure_date', 'amount'],
    };
    if (after) body.after = after;

    const r = await fetch(`${BASE}/crm/v3/objects/deals/search`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`HubSpot deals search error ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const data = await r.json();
    total = data.total ?? total;

    for (const result of data.results || []) {
      const p = result.properties || {};
      deals.push({
        id: Number(result.id),
        name: p.dealname || '(untitled)',
        stage: STAGE_LABELS[p.dealstage] || p.dealstage,
        amount: Number(p.amount) || 0,
        expected: p.expected_contract_closure_date ? p.expected_contract_closure_date.slice(0, 10) : null,
        ownerId: p.hubspot_owner_id ? Number(p.hubspot_owner_id) : null,
      });
    }

    after = data.paging && data.paging.next ? data.paging.next.after : null;
    if (!after) break;
  }
  return { deals, total };
}

module.exports = { fetchAllOwners, searchOverdueDeals, STAGE_IDS, STAGE_LABELS };
