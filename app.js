// =============================================
//  WHIP — app.js  (shared utilities)
// =============================================

const STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
  "Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa",
  "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan",
  "Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire",
  "New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio",
  "Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota",
  "Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia",
  "Wisconsin","Wyoming","District of Columbia"
];

const POLICY_AREAS = [
// Counts are from original dataset. Can remove, not being used. 
  { label: "Congress", count: 2111 },
  { label: "International Affairs", count: 918 },
  { label: "Commemorations", count: 627 },
  { label: "Armed Forces & National Security", count: 582 },
  { label: "Government Operations & Politics", count: 573 },
  { label: "Economics & Public Finance", count: 556 },
  { label: "Public Lands & Natural Resources", count: 423 },
  { label: "Crime & Law Enforcement", count: 409 },
  { label: "Health", count: 391 },
  { label: "Finance & Financial Sector", count: 318 },
  { label: "Taxation", count: 235 },
  { label: "Transportation & Public Works", count: 230 },
  { label: "Education", count: 205 },
  { label: "Science, Technology & Communications", count: 199 },
  { label: "Commerce", count: 198 },
  { label: "Emergency Management", count: 166 },
  { label: "Energy", count: 164 },
  { label: "Environmental Protection", count: 149 },
  { label: "Labor & Employment", count: 137 },
  { label: "Foreign Trade & International Finance", count: 129 },
  { label: "Immigration", count: 120 },
];

// =============================================
//  API CALLS — hit our Express server,
//  which proxies to Congress.gov with the key
// =============================================

const API_BASE = 'http://localhost:3000/api';

async function fetchMembers(stateName) {
  const res = await fetch(`${API_BASE}/members?state=${encodeURIComponent(stateName)}`);
  if (!res.ok) throw new Error(`Failed to fetch members: ${res.status}`);
  return res.json(); // { state, stateCode, members: [...] }
}

async function fetchBills(policyAreas = [], limit = 10) {
  const params = new URLSearchParams({ limit });
  if (policyAreas.length) params.set('policyAreas', policyAreas.join(','));
  const res = await fetch(`${API_BASE}/bills?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch bills: ${res.status}`);
  return res.json(); // array of bill objects
}

async function fetchFloorBills(policyAreas = []) {
  const params = new URLSearchParams();
  if (policyAreas.length) params.set('policyAreas', policyAreas.join(','));
  const res = await fetch(`${API_BASE}/bills/floor?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch floor bills: ${res.status}`);
  return res.json();
}

async function fetchBillActions(type, number) {
  const res = await fetch(`${API_BASE}/bill/${type}/${number}/actions`);
  if (!res.ok) throw new Error(`Failed to fetch bill actions: ${res.status}`);
  return res.json(); // { alert: { onCalendar, onFloor }, actions: [...] }
}

// ── Local storage helpers ──
function saveProfile(data) {
  localStorage.setItem('whip_profile', JSON.stringify(data));
}
function loadProfile() {
  try {
    return JSON.parse(localStorage.getItem('whip_profile')) || {};
  } catch { return {}; }
}

// ── Toast ──
function showToast(msg, duration = 2800) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

// ── Populate state selects ──
function populateStateSelect(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  STATES.forEach(s => {
    const o = document.createElement('option');
    o.value = s;
    o.textContent = s;
    sel.appendChild(o);
  });
}

// ── Build policy chip grid ──
function buildPolicyGrid(containerId, selectedAreas = []) {
  const container = document.getElementById(containerId);
  if (!container) return;
  POLICY_AREAS.forEach(({ label }) => {
    const isSelected = selectedAreas.includes(label);
    const chip = document.createElement('div');
    chip.className = 'policy-chip' + (isSelected ? ' selected' : '');
    chip.dataset.value = label;
    chip.innerHTML = `
      <span class="chip-check"></span>
      <span>${label}</span>
    `;
    chip.addEventListener('click', () => {
      chip.classList.toggle('selected');
    });
    container.appendChild(chip);
  });
}

// ── Get selected policies from grid ──
function getSelectedPolicies(containerId) {
  const chips = document.querySelectorAll(`#${containerId} .policy-chip.selected`);
  return Array.from(chips).map(c => c.dataset.value);
}

// ── Get selected policies from grid ──
function getSelectedPolicies(containerId) {
  const checks = document.querySelectorAll(`#${containerId} input[type="checkbox"]:checked`);
  return Array.from(checks).map(c => c.value);
}
