// =============================================
//  WHIP — server.js
//  Local dev + EC2 production backend
//  Run with: node server.js
// =============================================

import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY;
const CONGRESS_BASE = 'https://api.congress.gov/v3';
const CURRENT_CONGRESS = 119;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(__dirname));

// ── State name → 2-letter code map ──
const STATE_CODES = {
  "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
  "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
  "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
  "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
  "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
  "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
  "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
  "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT",
  "Vermont": "VT", "Virginia": "VA", "Washington": "WA", "West Virginia": "WV",
  "Wisconsin": "WI", "Wyoming": "WY", "District of Columbia": "DC"
};

const POLICY_AREA_MAP = {
  "Congress": "Congress",
  "International Affairs": "International Affairs",
  "Commemorations": "Commemorations",
  "Armed Forces & National Security": "Armed Forces and National Security",
  "Government Operations & Politics": "Government Operations and Politics",
  "Economics & Public Finance": "Economics and Public Finance",
  "Public Lands & Natural Resources": "Public Lands and Natural Resources",
  "Crime & Law Enforcement": "Crime and Law Enforcement",
  "Health": "Health",
  "Finance & Financial Sector": "Finance and Financial Sector",
  "Taxation": "Taxation",
  "Transportation & Public Works": "Transportation and Public Works",
  "Education": "Education",
  "Science, Technology & Communications": "Science, Technology, Communications",
  "Commerce": "Commerce",
  "Emergency Management": "Emergency Management",
  "Energy": "Energy",
  "Environmental Protection": "Environmental Protection",
  "Labor & Employment": "Labor and Employment",
  "Foreign Trade & International Finance": "Foreign Trade and International Finance",
  "Immigration": "Immigration",
};

// =============================================
//  UNITEDSTATES LEGISLATOR CACHE
//  Fetched once on startup, keyed by bioguideId
//  Gives us: phone, contact_form, website
// =============================================

let legislatorCache = {};  // { bioguideId: { phone, contactForm, website } }
let cacheLastFetched = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // refresh once a day

async function loadLegislatorCache() {
  try {
    console.log('  Fetching unitedstates legislator data...');
    const res = await fetch(
      'https://unitedstates.github.io/congress-legislators/legislators-current.json'
    );
    if (!res.ok) throw new Error(`unitedstates fetch failed: ${res.status}`);
    const legislators = await res.json();

    // Build a lookup map keyed by bioguideId
    const cache = {};
    for (const leg of legislators) {
      const bioguideId = leg.id?.bioguide;
      if (!bioguideId) continue;

      // Current term is the last one in the terms array
      const currentTerm = leg.terms?.[leg.terms.length - 1] || {};

      cache[bioguideId] = {
        phone:       currentTerm.phone       || null,
        contactForm: currentTerm.contact_form || currentTerm.url || null,
        website:     currentTerm.url          || null,
        office:      currentTerm.office       || null,
      };
    }

    legislatorCache = cache;
    cacheLastFetched = Date.now();
    console.log(`  ✓ Loaded ${Object.keys(cache).length} legislators from unitedstates`);
  } catch (err) {
    console.warn('  ⚠️  Could not load unitedstates data:', err.message);
    console.warn('     Phone/contact form info will be unavailable.');
  }
}

// Ensure cache is fresh before any request that needs it
async function ensureCache() {
  const isStale = !cacheLastFetched || (Date.now() - cacheLastFetched > CACHE_TTL_MS);
  if (isStale) await loadLegislatorCache();
}

// ── Helper: call Congress.gov and return JSON ──
async function congressFetch(path) {
  const separator = path.includes('?') ? '&' : '?';
  const url = `${CONGRESS_BASE}${path}${separator}api_key=${CONGRESS_API_KEY}&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Congress.gov error: ${res.status} ${res.statusText}`);
  return res.json();
}

// ─────────────────────────────────────────────
//  ROUTE 1: GET /api/members?state=California
//  Returns senators + house members for a state,
//  enriched with phone + contact form from unitedstates
// ─────────────────────────────────────────────
app.get('/api/members', async (req, res) => {
  try {
    const { state } = req.query;
    if (!state) return res.status(400).json({ error: 'state is required' });

    const stateCode = STATE_CODES[state];
    if (!stateCode) return res.status(400).json({ error: `Unknown state: ${state}` });

    await ensureCache();

    const data = await congressFetch(
      `/member?stateCode=${stateCode}&currentMember=true&limit=50`
    );

    const members = (data.members || []).map(m => {
      const extra = legislatorCache[m.bioguideId] || {};
      return {
        name:        m.name,
        state:       m.state,
        party:       m.partyName,
        chamber:     m.terms?.item?.[0]?.chamber || '',
        district:    m.district || null,
        bioguideId:  m.bioguideId,
        imageUrl:    m.depiction?.imageUrl || null,
        // From unitedstates:
        phone:       extra.phone       || null,
        contactForm: extra.contactForm || null,
        website:     extra.website     || null,
        office:      extra.office      || null,
      };
    });

    res.json({ state, stateCode, members });
  } catch (err) {
    console.error('/api/members error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
//  ROUTE 2: GET /api/member/:bioguideId
//  Single member detail
// ─────────────────────────────────────────────
app.get('/api/member/:bioguideId', async (req, res) => {
  try {
    await ensureCache();
    const data = await congressFetch(`/member/${req.params.bioguideId}`);
    const m = data.member;
    const extra = legislatorCache[req.params.bioguideId] || {};

    res.json({
      name:        m.directOrderName || m.invertedOrderName,
      bioguideId:  m.bioguideId,
      party:       m.partyHistory?.[0]?.partyName,
      state:       m.state,
      chamber:     m.terms?.[0]?.chamber,
      district:    m.terms?.[0]?.district || null,
      imageUrl:    m.depiction?.imageUrl  || null,
      phone:       extra.phone            || null,
      contactForm: extra.contactForm      || null,
      website:     extra.website          || null,
      office:      extra.office           || null,
    });
  } catch (err) {
    console.error('/api/member error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
//  ROUTE 3: GET /api/bills?policyAreas=Health,Energy&limit=10
// ─────────────────────────────────────────────
app.get('/api/bills', async (req, res) => {
  try {
    const { policyAreas, limit = 10 } = req.query;

    if (!policyAreas) {
      const data = await congressFetch(
        `/bill/${CURRENT_CONGRESS}?sort=updateDate&limit=${limit}`
      );
      return res.json(shapeBills(data.bills));
    }

    const areas = policyAreas.split(',').map(a => a.trim());
    const fetches = areas.map(area => {
      const congressArea = POLICY_AREA_MAP[area] || area;
      return congressFetch(
        `/bill/${CURRENT_CONGRESS}?sort=updateDate&limit=${limit}&policyArea=${encodeURIComponent(congressArea)}`
      ).then(d => d.bills || []).catch(() => []);
    });

    const results = await Promise.all(fetches);
    const merged = results.flat();

    const seen = new Set();
    const deduped = merged
      .filter(b => {
        if (seen.has(b.number)) return false;
        seen.add(b.number);
        return true;
      })
      .sort((a, b) => new Date(b.updateDate) - new Date(a.updateDate))
      .slice(0, parseInt(limit));

    res.json(shapeBills(deduped));
  } catch (err) {
    console.error('/api/bills error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
//  ROUTE 4: GET /api/bill/:type/:number/actions
// ─────────────────────────────────────────────
app.get('/api/bill/:type/:number/actions', async (req, res) => {
  try {
    const { type, number } = req.params;
    const data = await congressFetch(
      `/bill/${CURRENT_CONGRESS}/${type}/${number}/actions?limit=20`
    );

    const actions = (data.actions || []).map(a => ({
      date:    a.actionDate,
      text:    a.text,
      type:    a.type,
      chamber: a.sourceSystem?.name,
    }));

    const stages = actions.map(a => a.type);
    const alert = {
      onCalendar: stages.includes('Calendars'),
      onFloor:    stages.includes('Floor'),
      becameLaw:  stages.includes('BecameLaw'),
    };

    res.json({ type, number, congress: CURRENT_CONGRESS, alert, actions });
  } catch (err) {
    console.error('/api/bill actions error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
//  ROUTE 5: GET /api/bills/floor
//  Bills at Calendars or Floor stage — mobilization signal
// ─────────────────────────────────────────────
app.get('/api/bills/floor', async (req, res) => {
  try {
    const { policyAreas, limit = 20 } = req.query;
    const areas = policyAreas ? policyAreas.split(',').map(a => a.trim()) : [];

    const fetches = areas.length
      ? areas.map(area => {
          const congressArea = POLICY_AREA_MAP[area] || area;
          return congressFetch(
            `/bill/${CURRENT_CONGRESS}?sort=updateDate&limit=50&policyArea=${encodeURIComponent(congressArea)}`
          ).then(d => d.bills || []).catch(() => []);
        })
      : [congressFetch(`/bill/${CURRENT_CONGRESS}?sort=updateDate&limit=50`).then(d => d.bills || [])];

    const results = await Promise.all(fetches);
    const bills = results.flat().slice(0, 15);

    const withActions = await Promise.all(
      bills.map(async bill => {
        try {
          const actData = await congressFetch(
            `/bill/${CURRENT_CONGRESS}/${bill.type?.toLowerCase()}/${bill.number}/actions?limit=10`
          );
          const actionTypes = (actData.actions || []).map(a => a.type);
          return {
            ...bill,
            onFloor:    actionTypes.includes('Floor'),
            onCalendar: actionTypes.includes('Calendars'),
          };
        } catch {
          return { ...bill, onFloor: false, onCalendar: false };
        }
      })
    );

    res.json(shapeBills(withActions.filter(b => b.onFloor || b.onCalendar)));
  } catch (err) {
    console.error('/api/bills/floor error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Shape bill objects for the frontend ──
function shapeBills(bills) {
  return (bills || []).map(b => ({
    id:               `${b.type?.toUpperCase()}.${b.number}`,
    type:             b.type,
    number:           b.number,
    title:            b.title,
    policyArea:       b.policyArea?.name || '',
    updateDate:       b.updateDate,
    latestAction:     b.latestAction?.text || '',
    latestActionDate: b.latestAction?.actionDate || '',
    url:              b.url,
    onFloor:          b.onFloor    || false,
    onCalendar:       b.onCalendar || false,
  }));
}

// ── Start: load cache then listen ──
loadLegislatorCache().then(() => {
  app.listen(PORT, () => {
    console.log(`
  ┌─────────────────────────────────────┐
  │   Whip server running               │
  │   Local:  http://localhost:${PORT}      │
  └─────────────────────────────────────┘
    `);
    if (!CONGRESS_API_KEY) {
      console.warn('  ⚠️  CONGRESS_API_KEY not set in .env — API calls will fail');
    }
  });
});
