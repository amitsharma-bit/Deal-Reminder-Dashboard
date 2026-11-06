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

// ---------------------------------------------------------------------------
// In-pipeline deals — mirrors the HubSpot report "Deal Report - Convo"
// (https://app-na2.hubspot.com/advanced-builder/242626590/report/508004491).
// The search here applies only the deal-level report filters (closure chances,
// stage, excluded owners). The report's product ("convo") and rooftop-last-activity
// filters are applied in the browser so the user can switch them without a refetch.
// ---------------------------------------------------------------------------
const PIPELINE_CLOSURE_CHANCES = ['100%', '80% to 100%'];
// Owners the report explicitly excludes (hubspot_owner_id IS_NONE_OF).
const PIPELINE_EXCLUDED_OWNER_IDS = ['78064298', '82093316'];

const PIPELINE_DEAL_PROPS = [
  'dealname', 'dealstage', 'hubspot_owner_id', 'sales_owner', 'arr__sales_', 'contracted_arr',
  'closure_chances', 'demo_scheduled_for_date', 'demo_completed_date', 'contract_closed_on',
  'expected_contract_closure_date', 'enterprise_id', 'region', 'product_interested_in',
  'product_pitched_to_the_client', 'demo_scheduled_for_which_product_s__',
  'contract_closed_for_which_product_s__', 'hs_lastmodifieddate',
];
const PIPELINE_COMPANY_PROPS = [
  'name', 'domain', 'org_name', 'gd_name', 'dms_name', 'ims', 'crm_platform',
  'crm_service_scheduler', 'rooftop_last_activity',
];

// HubSpot returns date props as "YYYY-MM-DD", ISO datetimes, or (occasionally) epoch-ms
// strings depending on the endpoint — normalise all of them to "YYYY-MM-DD".
function toDateOnly(v) {
  if (!v) return null;
  if (/^\d{10,}$/.test(v)) return new Date(Number(v)).toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}
// Datetime props: keep the full ISO timestamp so the browser can bucket it by timezone.
function toIso(v) {
  if (!v) return null;
  if (/^\d{10,}$/.test(v)) return new Date(Number(v)).toISOString();
  const d = new Date(v);
  return isNaN(d) ? null : d.toISOString();
}
// Multi-select values are ";"-joined; some option values carry a leading U+2060
// (word joiner) copied from HubSpot's UI, which we strip for display/matching.
function splitMulti(v) {
  if (!v) return [];
  return String(v).split(';').map(x => x.replace(/[⁠​]/g, '').trim()).filter(Boolean);
}
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

async function searchPipelineDeals() {
  const deals = [];
  let after;
  let total = null;
  for (let page = 0; page < 10; page++) {
    const body = {
      limit: 100,
      filterGroups: [{
        filters: [
          { propertyName: 'dealstage', operator: 'IN', values: STAGE_IDS },
          { propertyName: 'closure_chances', operator: 'IN', values: PIPELINE_CLOSURE_CHANCES },
          { propertyName: 'hubspot_owner_id', operator: 'NOT_IN', values: PIPELINE_EXCLUDED_OWNER_IDS },
        ],
      }],
      properties: PIPELINE_DEAL_PROPS,
    };
    if (after) body.after = after;

    const r = await fetch(`${BASE}/crm/v3/objects/deals/search`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`HubSpot pipeline search error ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const data = await r.json();
    total = data.total ?? total;

    for (const result of data.results || []) {
      const p = result.properties || {};
      deals.push({
        id: Number(result.id),
        name: p.dealname || '(untitled)',
        stage: STAGE_LABELS[p.dealstage] || p.dealstage,
        ownerId: p.hubspot_owner_id ? Number(p.hubspot_owner_id) : null,
        salesOwnerId: p.sales_owner || null,
        arr: num(p.arr__sales_),
        contractedArr: num(p.contracted_arr),
        closureChances: p.closure_chances || null,
        demoScheduled: toDateOnly(p.demo_scheduled_for_date),
        demoCompleted: toDateOnly(p.demo_completed_date),
        contractClosedOn: toDateOnly(p.contract_closed_on),
        expected: toDateOnly(p.expected_contract_closure_date),
        enterpriseId: p.enterprise_id || null,
        region: p.region || null,
        product: p.product_interested_in || null,
        productsPitched: splitMulti(p.product_pitched_to_the_client),
        demoProducts: splitMulti(p.demo_scheduled_for_which_product_s__),
        contractProducts: splitMulti(p.contract_closed_for_which_product_s__),
        lastModified: toIso(p.hs_lastmodifieddate),
      });
    }

    after = data.paging && data.paging.next ? data.paging.next.after : null;
    if (!after) break;
  }
  return { deals, total };
}

// dealId -> [companyId, ...] via the v4 batch associations API (1000 inputs per call).
async function fetchDealCompanyIds(dealIds) {
  const map = {};
  for (let i = 0; i < dealIds.length; i += 1000) {
    const r = await fetch(`${BASE}/crm/v4/associations/deal/company/batch/read`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ inputs: dealIds.slice(i, i + 1000).map(id => ({ id: String(id) })) }),
    });
    // 207 = partial success (e.g. some deals have no companies) — still has results.
    if (!r.ok && r.status !== 207) throw new Error(`HubSpot associations error ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const data = await r.json();
    for (const row of data.results || []) {
      map[row.from.id] = [...new Set((row.to || []).map(t => String(t.toObjectId)))];
    }
  }
  return map;
}

// companyId -> rooftop details (100 inputs per batch call).
async function fetchCompanies(companyIds) {
  const out = {};
  for (let i = 0; i < companyIds.length; i += 100) {
    const r = await fetch(`${BASE}/crm/v3/objects/companies/batch/read`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        properties: PIPELINE_COMPANY_PROPS,
        inputs: companyIds.slice(i, i + 100).map(id => ({ id })),
      }),
    });
    if (!r.ok && r.status !== 207) throw new Error(`HubSpot companies error ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const data = await r.json();
    for (const c of data.results || []) {
      const p = c.properties || {};
      out[c.id] = {
        id: Number(c.id),
        name: p.name || '(unnamed company)',
        domain: p.domain || null,
        orgName: p.org_name ? p.org_name.trim() : null,
        gdName: p.gd_name ? p.gd_name.trim() : null,
        dms: p.dms_name || null,
        ims: p.ims || null,
        crm: p.crm_platform || null,
        serviceScheduler: p.crm_service_scheduler || null,
        lastActivity: toIso(p.rooftop_last_activity),
      };
    }
  }
  return out;
}

// sales_owner is an enumeration whose option values are (mostly) HubSpot owner IDs.
// Returns {value: label}; empty object if the token lacks schema-read scope.
async function fetchSalesOwnerLabels() {
  try {
    const r = await fetch(`${BASE}/crm/v3/properties/deals/sales_owner`, { headers: headers() });
    if (!r.ok) return {};
    const data = await r.json();
    const out = {};
    for (const o of data.options || []) out[o.value] = o.label;
    return out;
  } catch (e) {
    return {};
  }
}

module.exports = {
  fetchAllOwners, searchOverdueDeals, STAGE_IDS, STAGE_LABELS,
  searchPipelineDeals, fetchDealCompanyIds, fetchCompanies, fetchSalesOwnerLabels,
};
