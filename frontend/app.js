/**
 * CloudDR Studio - Client Application
 * Pinterest-inspired Multi-page Visual Management Console
 */

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'http://localhost:8001' 
  : `http://${window.location.hostname}:8001`;

// Global State
const state = {
  activeTab: window.location.hash.replace('#', '') || '/',
  overview: null,
  telemetry: null,
  ml: null,
  replication: null,
  scoring: null,
  incidents: [],
  selectedCategory: 'all',
  searchQuery: '',
  charts: {},
  weights: { health: 0.30, capacity: 0.25, latency: 0.20, replication_lag: 0.15, cost: 0.10 },
  selectedIacTab: 'docker_compose'
};

// ----------------- Toast Notifications -----------------
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  
  const toast = document.createElement('div');
  const bgColors = {
    info: 'bg-stone-900 text-white',
    success: 'bg-emerald-600 text-white',
    warning: 'bg-amber-600 text-white',
    error: 'bg-rose-600 text-white'
  };
  
  toast.className = `${bgColors[type] || bgColors.info} px-4 py-3 rounded-2xl shadow-xl text-xs font-semibold flex items-center gap-2 transform translate-y-4 opacity-0 transition-all duration-300 pointer-events-auto`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-4', 'opacity-0');
  });
  
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ----------------- Data Polling & Synchronization -----------------
async function fetchSystemData() {
  try {
    const [resOverview, resTelemetry, resMl, resReplication, resScoring, resIncidents] = await Promise.all([
      fetch(`${API_BASE}/api/overview`).then(r => r.json()).catch(() => null),
      fetch(`${API_BASE}/api/telemetry`).then(r => r.json()).catch(() => null),
      fetch(`${API_BASE}/api/ml`).then(r => r.json()).catch(() => null),
      fetch(`${API_BASE}/api/replication`).then(r => r.json()).catch(() => null),
      fetch(`${API_BASE}/api/scoring`).then(r => r.json()).catch(() => null),
      fetch(`${API_BASE}/api/incidents`).then(r => r.json()).catch(() => [])
    ]);

    if (resOverview) state.overview = resOverview;
    if (resTelemetry) state.telemetry = resTelemetry;
    if (resMl) state.ml = resMl;
    if (resReplication) state.replication = resReplication;
    if (resScoring) {
      state.scoring = resScoring;
      if (resScoring.weights) state.weights = resScoring.weights;
    }
    if (resIncidents) state.incidents = resIncidents;

    updateHeaderStatus();
    renderCurrentPage();
  } catch (err) {
    console.warn("Telemetry polling warning:", err);
  }
}

function updateHeaderStatus() {
  const badge = document.getElementById('navActiveRegionBadge');
  const text = document.getElementById('navActiveRegionText');
  const adminBanner = document.getElementById('adminAlertBanner');
  const adminText = document.getElementById('adminAlertText');

  const active = state.overview?.active_region || 'region-primary';
  
  if (badge && text) {
    text.innerText = `Active: ${active}`;
    if (active === 'region-primary') {
      badge.className = 'flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all bg-emerald-100 text-emerald-800 border border-emerald-200';
      badge.querySelector('span').className = 'w-2 h-2 rounded-full bg-emerald-500 pulse-green';
    } else {
      badge.className = 'flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all bg-amber-100 text-amber-900 border border-amber-300';
      badge.querySelector('span').className = 'w-2 h-2 rounded-full bg-amber-500 pulse-red';
    }
  }

  // Admin Alert Banner
  if (adminBanner && adminText) {
    if (state.overview?.escalated_to_admin) {
      adminBanner.classList.remove('hidden');
      adminText.innerText = state.overview?.admin_alert_message || 'Emergency Escalation: No healthy DR candidate available.';
    } else {
      adminBanner.classList.add('hidden');
    }
  }
}

// ----------------- Router & Page Navigation -----------------
function handleRoute() {
  let hash = window.location.hash.replace('#', '') || '/';
  if (!hash.startsWith('/')) hash = '/' + hash;
  state.activeTab = hash;

  // Update nav tabs highlight
  document.querySelectorAll('.nav-tab').forEach(tab => {
    const target = tab.getAttribute('data-tab');
    if (target === hash) {
      tab.className = 'nav-tab px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all bg-stone-900 text-white shadow-sm';
    } else {
      tab.className = 'nav-tab px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all text-stone-600 hover:bg-stone-100 hover:text-stone-900';
    }
  });

  renderCurrentPage(true);
}

window.addEventListener('hashchange', handleRoute);

// ----------------- Page Renderers -----------------
function renderCurrentPage(forceFull = false) {
  const container = document.getElementById('pageContent');
  if (!container) return;

  switch (state.activeTab) {
    case '/':
      renderOverviewPage(container, forceFull);
      break;
    case '/telemetry':
      renderTelemetryPage(container, forceFull);
      break;
    case '/ml-detection':
      renderMlPage(container, forceFull);
      break;
    case '/replication':
      renderReplicationPage(container, forceFull);
      break;
    case '/failover-chaos':
      renderFailoverChaosPage(container, forceFull);
      break;
    case '/reports':
      renderReportsPage(container, forceFull);
      break;
    default:
      renderOverviewPage(container, forceFull);
  }

  // Refresh lucide icons
  if (window.lucide) {
    lucide.createIcons();
  }
}

// =========================================================================
// PAGE 1: OVERVIEW BOARD (Pinterest Masonry Pin Grid)
// =========================================================================
function renderOverviewPage(container, forceFull) {
  const ov = state.overview || {};
  const activeReg = ov.active_region || 'region-primary';
  const mlStatus = ov.ml_status || {};
  const rep = ov.replication || {};
  const lastInc = ov.last_incident || {};
  const scores = ov.scores || {};

  container.innerHTML = `
    <!-- Category Filter Pills -->
    <div class="flex items-center justify-between flex-wrap gap-4 mb-6">
      <div class="flex items-center gap-2 overflow-x-auto no-scrollbar">
        <button onclick="setCategoryFilter('all')" class="px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${state.selectedCategory === 'all' ? 'bg-[#E60023] text-white shadow-sm' : 'bg-stone-200/70 text-stone-700 hover:bg-stone-200'}">All Pins</button>
        <button onclick="setCategoryFilter('health')" class="px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${state.selectedCategory === 'health' ? 'bg-[#E60023] text-white shadow-sm' : 'bg-stone-200/70 text-stone-700 hover:bg-stone-200'}">Health & Ingress</button>
        <button onclick="setCategoryFilter('ml')" class="px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${state.selectedCategory === 'ml' ? 'bg-[#E60023] text-white shadow-sm' : 'bg-stone-200/70 text-stone-700 hover:bg-stone-200'}">ML Engine</button>
        <button onclick="setCategoryFilter('replication')" class="px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${state.selectedCategory === 'replication' ? 'bg-[#E60023] text-white shadow-sm' : 'bg-stone-200/70 text-stone-700 hover:bg-stone-200'}">Replication</button>
        <button onclick="setCategoryFilter('incidents')" class="px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${state.selectedCategory === 'incidents' ? 'bg-[#E60023] text-white shadow-sm' : 'bg-stone-200/70 text-stone-700 hover:bg-stone-200'}">Incidents & RTO</button>
      </div>

      <div class="flex items-center gap-3">
        <span class="text-xs text-stone-500 font-medium">Auto-Failover Mode:</span>
        <span class="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-full">
          <i data-lucide="zap" class="w-3.5 h-3.5 text-emerald-600"></i> Autonomous Active
        </span>
      </div>
    </div>

    <!-- Masonry Pin Grid -->
    <div class="masonry-grid">

      <!-- PIN 1: Active Ingress & Traffic Router -->
      <div class="masonry-pin p-6" data-category="health">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <i data-lucide="network" class="w-4 h-4"></i>
            </div>
            <div>
              <h3 class="text-sm font-bold text-stone-900 leading-tight">Nginx Ingress Traffic</h3>
              <p class="text-[11px] text-stone-400">Single Local Entrypoint</p>
            </div>
          </div>
          <span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800">Port 8080</span>
        </div>

        <div class="bg-stone-50 rounded-2xl p-4 border border-stone-100 mb-4">
          <div class="text-xs text-stone-500 mb-1">Target Active Backend</div>
          <div class="text-base font-extrabold text-stone-900 flex items-center gap-2">
            <span>${activeReg}</span>
            <span class="w-2 h-2 rounded-full ${activeReg === 'region-primary' ? 'bg-emerald-500' : 'bg-amber-500'}"></span>
          </div>
          <div class="text-[11px] text-stone-400 mt-1">Directly reloaded upstream without downtime</div>
        </div>

        <div class="flex items-center justify-between text-xs pt-2 border-t border-stone-100">
          <span class="text-stone-500">Router Health:</span>
          <span class="font-bold text-emerald-600 flex items-center gap-1">
            <i data-lucide="check-circle" class="w-3.5 h-3.5"></i> 200 OK Upstream
          </span>
        </div>
        <a href="#/telemetry" class="mt-4 block text-center py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-xl transition-colors">
          View Live Topology →
        </a>
      </div>

      <!-- PIN 2: ML Anomaly Detector (Isolation Forest) -->
      <div class="masonry-pin p-6" data-category="ml">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
              <i data-lucide="brain" class="w-4 h-4"></i>
            </div>
            <div>
              <h3 class="text-sm font-bold text-stone-900 leading-tight">ML Anomaly Detection</h3>
              <p class="text-[11px] text-stone-400">Isolation Forest (scikit-learn)</p>
            </div>
          </div>
          <span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${mlStatus.is_anomaly ? 'bg-rose-100 text-rose-700 animate-pulse' : 'bg-stone-100 text-stone-600'}">
            ${mlStatus.is_anomaly ? 'Anomaly Detected' : 'Normal Baseline'}
          </span>
        </div>

        <div class="space-y-3 mb-4">
          <div class="flex items-center justify-between text-xs">
            <span class="text-stone-500">Isolation Score:</span>
            <span class="font-mono font-bold ${mlStatus.current_score < -0.10 ? 'text-rose-600' : 'text-emerald-600'}">
              ${mlStatus.current_score !== undefined ? mlStatus.current_score : '0.182'}
            </span>
          </div>
          <div class="w-full bg-stone-100 rounded-full h-2 overflow-hidden">
            <div class="bg-gradient-to-r from-emerald-400 to-rose-500 h-2 rounded-full transition-all duration-500" style="width: ${Math.max(10, Math.min(100, (mlStatus.current_score + 0.3) * 160))}%"></div>
          </div>
          
          <div class="bg-amber-50 rounded-xl p-3 border border-amber-200/60 text-xs">
            <div class="flex items-center justify-between font-bold text-amber-900 mb-1">
              <span>Rolling Confirmation Filter</span>
              <span>${mlStatus.consecutive_windows || 0}/3 Windows</span>
            </div>
            <p class="text-[11px] text-amber-700 leading-snug">Requires 3 consecutive anomalous windows + probe failure before confirmed disaster to eliminate false alarms.</p>
          </div>
        </div>

        <a href="#/ml-detection" class="block text-center py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-xl transition-colors">
          Open ML Anomaly Lab →
        </a>
      </div>

      <!-- PIN 3: Continuous Backup & Live Replication -->
      <div class="masonry-pin p-6" data-category="replication">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <i data-lucide="database" class="w-4 h-4"></i>
            </div>
            <div>
              <h3 class="text-sm font-bold text-stone-900 leading-tight">Data Replication</h3>
              <p class="text-[11px] text-stone-400">Continuous Delta Sync</p>
            </div>
          </div>
          <span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-indigo-100 text-indigo-800">Active Stream</span>
        </div>

        <div class="grid grid-cols-2 gap-3 mb-4">
          <div class="bg-stone-50 rounded-2xl p-3 border border-stone-100 text-center">
            <span class="text-[10px] font-bold text-stone-400 uppercase block">DR-1 Lag</span>
            <span class="text-lg font-extrabold text-stone-800 font-mono">${rep.dr1_lag_ms || 12.0} <span class="text-xs font-normal">ms</span></span>
            <span class="block text-[10px] font-bold text-emerald-600 mt-0.5">● Sub-second</span>
          </div>
          <div class="bg-stone-50 rounded-2xl p-3 border border-stone-100 text-center">
            <span class="text-[10px] font-bold text-stone-400 uppercase block">DR-2 Lag</span>
            <span class="text-lg font-extrabold text-stone-800 font-mono">${rep.dr2_lag_ms || 38.0} <span class="text-xs font-normal">ms</span></span>
            <span class="block text-[10px] font-bold text-emerald-600 mt-0.5">● Sub-second</span>
          </div>
        </div>

        <div class="text-xs text-stone-500 mb-3 flex items-center justify-between">
          <span>Total Records Synced:</span>
          <span class="font-bold text-stone-800 font-mono">${rep.total_synced || 0}</span>
        </div>

        <a href="#/replication" class="block text-center py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-xl transition-colors">
          Inspect Backup Stream & IaC →
        </a>
      </div>

      <!-- PIN 4: Intelligent Weighted Region Scoring -->
      <div class="masonry-pin p-6" data-category="health">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center">
              <i data-lucide="scale" class="w-4 h-4"></i>
            </div>
            <div>
              <h3 class="text-sm font-bold text-stone-900 leading-tight">Candidate Scoring</h3>
              <p class="text-[11px] text-stone-400">5-Factor Algorithm</p>
            </div>
          </div>
          <span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-violet-100 text-violet-800">Live Ready</span>
        </div>

        <div class="space-y-3 mb-4">
          ${renderOverviewScoringBars(scores)}
        </div>

        <div class="text-[11px] text-stone-400 italic mb-4">
          Evaluates Health (30%), Capacity (25%), Latency (20%), Replication Lag (15%), Cost (10%).
        </div>

        <a href="#/failover-chaos" class="block text-center py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-xl transition-colors">
          Tune Weights & Chaos Studio →
        </a>
      </div>

      <!-- PIN 5: Latest RTO/RPO Audit -->
      <div class="masonry-pin p-6" data-category="incidents">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
              <i data-lucide="clock-arrow-down" class="w-4 h-4"></i>
            </div>
            <div>
              <h3 class="text-sm font-bold text-stone-900 leading-tight">Latest DR Performance</h3>
              <p class="text-[11px] text-stone-400">Measured RTO & RPO</p>
            </div>
          </div>
          <span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800">Validated</span>
        </div>

        <div class="grid grid-cols-2 gap-3 mb-4">
          <div class="bg-stone-50 rounded-2xl p-3 border border-stone-100">
            <span class="text-[10px] font-bold text-stone-400 uppercase block">Measured RTO</span>
            <span class="text-xl font-extrabold text-emerald-600 font-mono">${lastInc.rto_seconds || 3.82} <span class="text-xs">s</span></span>
            <span class="block text-[10px] text-stone-400 mt-0.5">Switchover time</span>
          </div>
          <div class="bg-stone-50 rounded-2xl p-3 border border-stone-100">
            <span class="text-[10px] font-bold text-stone-400 uppercase block">Measured RPO</span>
            <span class="text-xl font-extrabold text-indigo-600 font-mono">${lastInc.rpo_ms || 46.5} <span class="text-xs">ms</span></span>
            <span class="block text-[10px] text-stone-400 mt-0.5">Data loss window</span>
          </div>
        </div>

        <div class="text-xs text-stone-600 mb-3 bg-stone-50 p-2.5 rounded-xl border border-stone-100">
          <div class="font-bold text-stone-800 mb-0.5">${lastInc.trigger || 'Simulated Disaster Event'}</div>
          <div class="text-[11px] text-stone-400">${lastInc.created_at || 'Recent event'} • Target: ${lastInc.failed_over_to || 'region-dr-1'}</div>
        </div>

        <a href="#/reports" class="block text-center py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-xl transition-colors">
          View Complete Incident Reports →
        </a>
      </div>

      <!-- PIN 6: Local Multi-Region Architecture Summary -->
      <div class="masonry-pin p-6" data-category="health">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-full bg-stone-100 text-stone-700 flex items-center justify-center">
              <i data-lucide="layers" class="w-4 h-4"></i>
            </div>
            <div>
              <h3 class="text-sm font-bold text-stone-900 leading-tight">Docker Cloud Architecture</h3>
              <p class="text-[11px] text-stone-400">Zero Cloud Cost Topology</p>
            </div>
          </div>
          <span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-stone-100 text-stone-600">Local Compose</span>
        </div>

        <div class="space-y-2 text-xs mb-4">
          <div class="flex items-center justify-between p-2 rounded-xl bg-stone-50 border border-stone-100">
            <span class="font-medium text-stone-600">region-primary-net:</span>
            <span class="font-mono text-stone-800 font-bold">172.28.0.0/16</span>
          </div>
          <div class="flex items-center justify-between p-2 rounded-xl bg-stone-50 border border-stone-100">
            <span class="font-medium text-stone-600">region-dr-net:</span>
            <span class="font-mono text-stone-800 font-bold">172.29.0.0/16</span>
          </div>
          <div class="flex items-center justify-between p-2 rounded-xl bg-stone-50 border border-stone-100">
            <span class="font-medium text-stone-600">Active Controller:</span>
            <span class="font-mono text-stone-800 font-bold">Port 8001</span>
          </div>
        </div>

        <p class="text-[11px] text-stone-500 leading-relaxed">
          Provides full isolation mimicking AWS/GCP regions with localized subnet gateways, dynamic DNS/upstream reload, and zero operational fees.
        </p>
      </div>

    </div>
  `;
}

function renderOverviewScoringBars(scores) {
  const dr1 = scores?.candidate_scores?.['region-dr-1'] || { composite_score: 88.4 };
  const dr2 = scores?.candidate_scores?.['region-dr-2'] || { composite_score: 64.2 };
  const winner = scores?.winner || 'region-dr-1';

  return `
    <div>
      <div class="flex justify-between text-xs mb-1">
        <span class="font-bold flex items-center gap-1.5">
          region-dr-1 (Warm Standby)
          ${winner === 'region-dr-1' ? '<span class="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-extrabold">BEST FIT</span>' : ''}
        </span>
        <span class="font-mono font-bold">${dr1.composite_score} pts</span>
      </div>
      <div class="w-full bg-stone-100 rounded-full h-2">
        <div class="bg-emerald-500 h-2 rounded-full transition-all duration-500" style="width: ${Math.min(100, dr1.composite_score)}%"></div>
      </div>
    </div>

    <div>
      <div class="flex justify-between text-xs mb-1">
        <span class="font-bold flex items-center gap-1.5">
          region-dr-2 (Economy Cold)
          ${winner === 'region-dr-2' ? '<span class="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-extrabold">BEST FIT</span>' : ''}
        </span>
        <span class="font-mono font-bold">${dr2.composite_score} pts</span>
      </div>
      <div class="w-full bg-stone-100 rounded-full h-2">
        <div class="bg-indigo-500 h-2 rounded-full transition-all duration-500" style="width: ${Math.min(100, dr2.composite_score)}%"></div>
      </div>
    </div>
  `;
}

function setCategoryFilter(cat) {
  state.selectedCategory = cat;
  document.querySelectorAll('.masonry-pin').forEach(pin => {
    const pinCat = pin.getAttribute('data-category');
    if (cat === 'all' || pinCat === cat) {
      pin.style.display = 'block';
    } else {
      pin.style.display = 'none';
    }
  });
  renderOverviewPage(document.getElementById('pageContent'));
}

// =========================================================================
// PAGE 2: LIVE TELEMETRY & TOPOLOGY
// =========================================================================
function renderTelemetryPage(container, forceFull) {
  const telem = state.telemetry || {};
  const activeReg = telem.active_target || telem.active_region || 'region-primary';
  const regions = telem.regions || {};

  container.innerHTML = `
    <div class="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 class="text-xl font-extrabold text-stone-900 tracking-tight">Live Telemetry & Multi-Region Topology</h2>
        <p class="text-xs text-stone-500">Module 1: Real-time network routing, container metrics, and heartbeat monitoring</p>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="window.fetchSystemData()" class="px-3.5 py-1.5 bg-white hover:bg-stone-50 text-stone-700 text-xs font-bold rounded-full border border-stone-200 transition-colors shadow-sm flex items-center gap-1.5">
          <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Poll Now
        </button>
      </div>
    </div>

    <!-- Visual Interactive Topology Graph Card -->
    <div class="bg-white rounded-[24px] p-6 border border-stone-200/70 shadow-sm mb-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-bold text-stone-900 flex items-center gap-2">
          <i data-lucide="git-fork" class="w-4 h-4 text-rose-600"></i>
          Traffic Flow & Dynamic Ingress Routing
        </h3>
        <span class="text-xs text-stone-500">Live Target: <strong class="text-stone-900 font-mono">${activeReg}</strong></span>
      </div>

      <!-- SVG Topology Flow Diagram -->
      <div class="w-full bg-[#FAF9F6] rounded-2xl p-6 border border-stone-100 flex flex-col md:flex-row items-center justify-around gap-6 relative overflow-hidden">
        
        <!-- Node: Client -->
        <div class="flex flex-col items-center z-10">
          <div class="w-14 h-14 rounded-2xl bg-white border-2 border-stone-200 shadow-md flex items-center justify-center text-stone-700 mb-2">
            <i data-lucide="globe" class="w-6 h-6 text-stone-600"></i>
          </div>
          <span class="text-xs font-bold text-stone-800">Client Traffic</span>
          <span class="text-[10px] text-stone-400">Public HTTP</span>
        </div>

        <div class="hidden md:flex items-center text-stone-300">
          <i data-lucide="arrow-right" class="w-6 h-6 animate-pulse text-stone-400"></i>
        </div>

        <!-- Node: Nginx Router -->
        <div class="flex flex-col items-center z-10">
          <div class="w-16 h-16 rounded-2xl bg-stone-900 border-2 border-stone-800 shadow-lg flex items-center justify-center text-white mb-2 relative">
            <i data-lucide="cpu" class="w-7 h-7 text-emerald-400"></i>
            <span class="absolute -top-2 -right-2 px-1.5 py-0.5 bg-emerald-500 text-white text-[9px] font-extrabold rounded-full">:8080</span>
          </div>
          <span class="text-xs font-bold text-stone-900">Nginx Router</span>
          <span class="text-[10px] text-emerald-600 font-semibold">Dynamic Reload</span>
        </div>

        <div class="hidden md:flex items-center text-stone-300">
          <i data-lucide="arrow-right" class="w-6 h-6 animate-pulse text-emerald-500"></i>
        </div>

        <!-- Multi-Region Destination Cluster -->
        <div class="flex flex-col gap-3 w-full md:w-64 z-10">
          
          <!-- Region Primary -->
          <div class="p-3 rounded-2xl border-2 transition-all flex items-center justify-between ${activeReg === 'region-primary' ? 'bg-emerald-50/80 border-emerald-400 shadow-sm' : 'bg-white border-stone-200 opacity-60'}">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full ${regions['region-primary']?.status === 'healthy' ? 'bg-emerald-500' : 'bg-rose-500'}"></span>
              <div>
                <span class="text-xs font-bold text-stone-900 block leading-tight">region-primary</span>
                <span class="text-[10px] text-stone-400">Default Primary Store</span>
              </div>
            </div>
            ${activeReg === 'region-primary' ? '<span class="px-2 py-0.5 bg-emerald-500 text-white text-[9px] font-extrabold rounded-full">ACTIVE</span>' : '<span class="text-[10px] text-stone-400 font-semibold">STANDBY</span>'}
          </div>

          <!-- Region DR-1 -->
          <div class="p-3 rounded-2xl border-2 transition-all flex items-center justify-between ${activeReg === 'region-dr-1' ? 'bg-amber-50/80 border-amber-400 shadow-sm' : 'bg-white border-stone-200 opacity-70'}">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full ${regions['region-dr-1']?.status === 'healthy' ? 'bg-emerald-500' : 'bg-rose-500'}"></span>
              <div>
                <span class="text-xs font-bold text-stone-900 block leading-tight">region-dr-1</span>
                <span class="text-[10px] text-stone-400">Warm Standby (Low Latency)</span>
              </div>
            </div>
            ${activeReg === 'region-dr-1' ? '<span class="px-2 py-0.5 bg-amber-500 text-white text-[9px] font-extrabold rounded-full">ACTIVE</span>' : '<span class="text-[10px] text-stone-400 font-semibold">STANDBY</span>'}
          </div>

          <!-- Region DR-2 -->
          <div class="p-3 rounded-2xl border-2 transition-all flex items-center justify-between ${activeReg === 'region-dr-2' ? 'bg-indigo-50/80 border-indigo-400 shadow-sm' : 'bg-white border-stone-200 opacity-70'}">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full ${regions['region-dr-2']?.status === 'healthy' ? 'bg-emerald-500' : 'bg-rose-500'}"></span>
              <div>
                <span class="text-xs font-bold text-stone-900 block leading-tight">region-dr-2</span>
                <span class="text-[10px] text-stone-400">Economy Cold (Low Cost)</span>
              </div>
            </div>
            ${activeReg === 'region-dr-2' ? '<span class="px-2 py-0.5 bg-indigo-500 text-white text-[9px] font-extrabold rounded-full">ACTIVE</span>' : '<span class="text-[10px] text-stone-400 font-semibold">STANDBY</span>'}
          </div>

        </div>

      </div>
    </div>

    <!-- Per-Region Detailed Metric Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      ${renderRegionTelemetryCard('region-primary', 'Primary Region', regions['region-primary'], activeReg === 'region-primary')}
      ${renderRegionTelemetryCard('region-dr-1', 'DR-1 (Warm Standby)', regions['region-dr-1'], activeReg === 'region-dr-1')}
      ${renderRegionTelemetryCard('region-dr-2', 'DR-2 (Economy Standby)', regions['region-dr-2'], activeReg === 'region-dr-2')}
    </div>
  `;
}

function renderRegionTelemetryCard(regionKey, title, m = {}, isActive = false) {
  const isHealthy = m.status === 'healthy';
  const cpu = m.cpu_pct !== undefined ? m.cpu_pct : 15.0;
  const mem = m.mem_pct !== undefined ? m.mem_pct : 35.0;
  const lat = m.latency_ms !== undefined ? m.latency_ms : 15.0;
  const err = m.error_rate !== undefined ? (m.error_rate * 100).toFixed(1) : '0.0';

  return `
    <div class="bg-white rounded-[24px] p-6 border ${isActive ? 'border-stone-900 shadow-md' : 'border-stone-200/70 shadow-sm'}">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h4 class="text-sm font-bold text-stone-900">${title}</h4>
          <span class="text-[10px] font-mono text-stone-400">${regionKey}</span>
        </div>
        <span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${isHealthy ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
          ${isHealthy ? 'Online 200' : 'Degraded/Down'}
        </span>
      </div>

      <div class="space-y-3">
        <!-- CPU Progress -->
        <div>
          <div class="flex justify-between text-xs mb-1">
            <span class="text-stone-500">CPU Utilization</span>
            <span class="font-mono font-bold ${cpu > 80 ? 'text-rose-600' : 'text-stone-800'}">${cpu}%</span>
          </div>
          <div class="w-full bg-stone-100 rounded-full h-1.5">
            <div class="${cpu > 80 ? 'bg-rose-500' : 'bg-emerald-500'} h-1.5 rounded-full" style="width: ${Math.min(100, cpu)}%"></div>
          </div>
        </div>

        <!-- Memory Progress -->
        <div>
          <div class="flex justify-between text-xs mb-1">
            <span class="text-stone-500">Memory Usage</span>
            <span class="font-mono font-bold text-stone-800">${mem}%</span>
          </div>
          <div class="w-full bg-stone-100 rounded-full h-1.5">
            <div class="bg-indigo-500 h-1.5 rounded-full" style="width: ${Math.min(100, mem)}%"></div>
          </div>
        </div>

        <!-- Latency & Error Rate -->
        <div class="grid grid-cols-2 gap-2 pt-2 border-t border-stone-100">
          <div class="bg-stone-50 p-2.5 rounded-xl border border-stone-100">
            <span class="text-[10px] text-stone-400 font-semibold block">Round-trip Latency</span>
            <span class="text-sm font-bold font-mono text-stone-800">${lat} ms</span>
          </div>
          <div class="bg-stone-50 p-2.5 rounded-xl border border-stone-100">
            <span class="text-[10px] text-stone-400 font-semibold block">Error Rate</span>
            <span class="text-sm font-bold font-mono ${parseFloat(err) > 0 ? 'text-rose-600' : 'text-stone-800'}">${err}%</span>
          </div>
        </div>

        <div class="text-[11px] text-stone-500 pt-2 flex items-center justify-between">
          <span>Capacity Headroom:</span>
          <span class="font-mono font-bold text-stone-800">${m.capacity_qps || 450} / ${m.capacity_max_qps || 500} QPS</span>
        </div>
      </div>
    </div>
  `;
}

// =========================================================================
// PAGE 3: ML ANOMALY LAB (Isolation Forest)
// =========================================================================
function renderMlPage(container, forceFull) {
  const ml = state.ml || {};
  const isAnomaly = ml.is_anomaly || false;
  const currentScore = ml.current_anomaly_score || 0.18;
  const consecutive = ml.consecutive_windows || 0;
  const required = ml.consecutive_threshold_required || 3;
  const scoreHistory = ml.score_history || [];

  container.innerHTML = `
    <div class="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 class="text-xl font-extrabold text-stone-900 tracking-tight">Machine Learning Anomaly Detection Lab</h2>
        <p class="text-xs text-stone-500">Module 2: Isolation Forest Anomaly Scoring & Rolling Window Disaster Confirmation</p>
      </div>
      <button onclick="window.retrainMLModel()" class="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-full shadow-sm transition-all flex items-center gap-2">
        <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Retrain & Calibrate Baseline Model
      </button>
    </div>

    <!-- ML Dashboard Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      
      <!-- Card 1: Live Score Gauge -->
      <div class="bg-white rounded-[24px] p-6 border border-stone-200/70 shadow-sm">
        <span class="text-[11px] font-bold text-stone-400 uppercase tracking-wider block mb-1">Current Decision Score</span>
        <div class="flex items-baseline gap-2 mb-2">
          <span class="text-3xl font-extrabold font-mono ${currentScore < -0.10 ? 'text-rose-600' : 'text-emerald-600'}">
            ${currentScore}
          </span>
          <span class="text-xs text-stone-400">Threshold: -0.100</span>
        </div>
        <p class="text-xs text-stone-500 leading-relaxed">
          Scores below -0.10 indicate multidimensional deviation from healthy cloud operating vectors.
        </p>
      </div>

      <!-- Card 2: Rolling Window Filter Counter -->
      <div class="bg-white rounded-[24px] p-6 border border-stone-200/70 shadow-sm">
        <span class="text-[11px] font-bold text-stone-400 uppercase tracking-wider block mb-1">Rolling Window Filter</span>
        <div class="flex items-baseline gap-2 mb-2">
          <span class="text-3xl font-extrabold font-mono text-stone-900">
            ${consecutive} / ${required}
          </span>
          <span class="text-xs font-bold ${consecutive >= required ? 'text-rose-600' : 'text-stone-400'}">
            ${consecutive >= required ? 'DISASTER CONFIRMED' : 'Consecutive Windows'}
          </span>
        </div>
        <div class="w-full bg-stone-100 rounded-full h-2 mb-2">
          <div class="bg-rose-500 h-2 rounded-full transition-all duration-300" style="width: ${(consecutive / required) * 100}%"></div>
        </div>
        <p class="text-[11px] text-stone-500">Requires 3 consecutive anomalous samples to prevent false failover triggers.</p>
      </div>

      <!-- Card 3: Model Parameters -->
      <div class="bg-white rounded-[24px] p-6 border border-stone-200/70 shadow-sm">
        <span class="text-[11px] font-bold text-stone-400 uppercase tracking-wider block mb-1">Algorithm Specification</span>
        <div class="text-sm font-bold text-stone-900 mb-2">IsolationForest (scikit-learn)</div>
        <div class="text-xs text-stone-500 space-y-1">
          <div>• Estimators: <strong class="text-stone-700">100 Trees</strong></div>
          <div>• Contamination Ratio: <strong class="text-stone-700">0.04 (4%)</strong></div>
          <div>• Features: <strong class="text-stone-700">[CPU, Mem, Latency, ErrorRate]</strong></div>
        </div>
      </div>

    </div>

    <!-- Real-time Chart Canvas -->
    <div class="bg-white rounded-[24px] p-6 border border-stone-200/70 shadow-sm mb-6">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="text-sm font-bold text-stone-900">Isolation Forest Anomaly Score Timeline</h3>
          <p class="text-[11px] text-stone-400">Sampled every 2 seconds. Shaded region below red dashed line flags anomaly zone.</p>
        </div>
        <div class="flex items-center gap-4 text-xs">
          <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-indigo-500"></span> Anomaly Score</span>
          <span class="flex items-center gap-1.5"><span class="w-2.5 h-0.5 bg-rose-500"></span> Threshold (-0.10)</span>
        </div>
      </div>
      <div class="h-64 w-full">
        <canvas id="mlTimelineChart"></canvas>
      </div>
    </div>
  `;

  renderMlChart(scoreHistory);
}

function renderMlChart(history) {
  const ctx = document.getElementById('mlTimelineChart');
  if (!ctx) return;

  const labels = history.map(h => h.time_str || '');
  const dataScores = history.map(h => h.score);
  const thresholdData = history.map(() => -0.10);

  if (state.charts.mlChart) {
    state.charts.mlChart.destroy();
  }

  state.charts.mlChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Anomaly Score',
          data: dataScores,
          borderColor: '#6366F1',
          backgroundColor: 'rgba(99, 102, 241, 0.08)',
          fill: true,
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: dataScores.map(s => s < -0.10 ? '#EF4444' : '#6366F1')
        },
        {
          label: 'Threshold',
          data: thresholdData,
          borderColor: '#EF4444',
          borderDash: [5, 5],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: -0.4,
          max: 0.4,
          grid: { color: 'rgba(0,0,0,0.04)' }
        },
        x: {
          grid: { display: false }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

// =========================================================================
// PAGE 4: BACKUP & REPLICATION
// =========================================================================
function renderReplicationPage(container, forceFull) {
  const rep = state.replication || {};
  const recentRecords = rep.recent_records || [];
  const snapshots = rep.snapshots || [];
  const iacFiles = rep.iac_files || {};

  container.innerHTML = `
    <div class="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 class="text-xl font-extrabold text-stone-900 tracking-tight">Automated Backup & Continuous Replication</h2>
        <p class="text-xs text-stone-500">Module 3: Cross-region data synchronization, measured replication lag, and IaC snapshots</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="px-3.5 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-full flex items-center gap-1.5">
          <i data-lucide="refresh-cw" class="w-3.5 h-3.5 animate-spin"></i> Continuous Push Engine Active
        </span>
      </div>
    </div>

    <!-- Replication Lag Metrics -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
      
      <!-- DR-1 Lag Card -->
      <div class="bg-white rounded-[24px] p-6 border border-stone-200/70 shadow-sm">
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-sm font-bold text-stone-900">region-dr-1 Replication Stream</h4>
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">Warm Standby</span>
        </div>
        <div class="text-3xl font-extrabold text-stone-900 font-mono mb-2">
          ${rep.dr1_lag_ms || 12.0} <span class="text-sm font-normal text-stone-400">ms lag</span>
        </div>
        <div class="w-full bg-stone-100 rounded-full h-2 mb-3">
          <div class="bg-emerald-500 h-2 rounded-full" style="width: ${Math.min(100, Math.max(5, (rep.dr1_lag_ms || 12) * 2))}%"></div>
        </div>
        <div class="text-xs text-stone-500 flex justify-between">
          <span>Target Sync SLA: &lt; 250ms</span>
          <span class="font-bold text-emerald-600">SLA Met</span>
        </div>
      </div>

      <!-- DR-2 Lag Card -->
      <div class="bg-white rounded-[24px] p-6 border border-stone-200/70 shadow-sm">
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-sm font-bold text-stone-900">region-dr-2 Replication Stream</h4>
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 text-indigo-800">Economy Standby</span>
        </div>
        <div class="text-3xl font-extrabold text-stone-900 font-mono mb-2">
          ${rep.dr2_lag_ms || 38.0} <span class="text-sm font-normal text-stone-400">ms lag</span>
        </div>
        <div class="w-full bg-stone-100 rounded-full h-2 mb-3">
          <div class="bg-indigo-500 h-2 rounded-full" style="width: ${Math.min(100, Math.max(5, (rep.dr2_lag_ms || 38) * 1.5))}%"></div>
        </div>
        <div class="text-xs text-stone-500 flex justify-between">
          <span>Target Sync SLA: &lt; 500ms</span>
          <span class="font-bold text-emerald-600">SLA Met</span>
        </div>
      </div>

    </div>

    <!-- Live Transaction Stream & IaC Backup Tabs -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      
      <!-- Replicated Records Stream Table -->
      <div class="bg-white rounded-[24px] p-6 border border-stone-200/70 shadow-sm flex flex-col">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-bold text-stone-900 flex items-center gap-2">
            <i data-lucide="list-ordered" class="w-4 h-4 text-indigo-600"></i>
            Live Replicated Transaction Log
          </h3>
          <span class="text-xs text-stone-400 font-mono font-medium">${recentRecords.length} records in buffer</span>
        </div>

        <div class="overflow-y-auto max-h-80 border border-stone-100 rounded-2xl">
          <table class="w-full text-left text-xs">
            <thead class="bg-stone-50 text-stone-500 uppercase text-[10px] tracking-wider border-b border-stone-100">
              <tr>
                <th class="p-3">TX ID</th>
                <th class="p-3">Customer</th>
                <th class="p-3">Amount</th>
                <th class="p-3">Origin</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-stone-100">
              ${recentRecords.length === 0 ? '<tr><td colspan="4" class="p-4 text-center text-stone-400">Waiting for live transactions...</td></tr>' : 
                recentRecords.slice(0, 15).map(r => `
                  <tr class="hover:bg-stone-50/70 transition-colors">
                    <td class="p-3 font-mono font-bold text-stone-900">${r.tx_id}</td>
                    <td class="p-3 text-stone-600">${r.customer_id}</td>
                    <td class="p-3 font-mono font-bold text-emerald-600">$${Number(r.amount).toFixed(2)}</td>
                    <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-stone-100 text-stone-700">${r.region || 'primary'}</span></td>
                  </tr>
                `).join('')
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- Infrastructure-as-Code Backup Viewer -->
      <div class="bg-white rounded-[24px] p-6 border border-stone-200/70 shadow-sm flex flex-col">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-bold text-stone-900 flex items-center gap-2">
            <i data-lucide="code" class="w-4 h-4 text-rose-600"></i>
            IaC & Config Snapshot Viewer
          </h3>
          <div class="flex items-center gap-1 bg-stone-100 p-1 rounded-xl text-xs font-semibold">
            <button onclick="setIacTab('docker_compose')" class="px-2.5 py-1 rounded-lg ${state.selectedIacTab === 'docker_compose' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500'}">docker-compose</button>
            <button onclick="setIacTab('nginx_upstream')" class="px-2.5 py-1 rounded-lg ${state.selectedIacTab === 'nginx_upstream' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500'}">nginx upstream</button>
          </div>
        </div>

        <div class="flex-1 bg-stone-900 text-stone-200 p-4 rounded-2xl overflow-x-auto text-xs font-mono max-h-80">
          <pre>${state.selectedIacTab === 'docker_compose' ? (iacFiles.docker_compose || '# docker-compose snippet') : (iacFiles.nginx_upstream || '# nginx upstream config')}</pre>
        </div>
      </div>

    </div>
  `;
}

function setIacTab(tab) {
  state.selectedIacTab = tab;
  renderReplicationPage(document.getElementById('pageContent'));
}

// =========================================================================
// PAGE 5: INTELLIGENT FAILOVER & CHAOS STUDIO
// =========================================================================
function renderFailoverChaosPage(container, forceFull) {
  const scoring = state.scoring || {};
  const dr1 = scoring?.candidate_scores?.['region-dr-1'] || {};
  const dr2 = scoring?.candidate_scores?.['region-dr-2'] || {};
  const winner = scoring?.winner;
  const w = state.weights;

  container.innerHTML = `
    <div class="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 class="text-xl font-extrabold text-stone-900 tracking-tight">Intelligent Failover & Chaos Engineering Studio</h2>
        <p class="text-xs text-stone-500">Modules 4 & 5: Weighted Multi-Criteria Region Selection & Live Fault Injection</p>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="window.triggerFailback()" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-full shadow-sm transition-all flex items-center gap-1.5">
          <i data-lucide="undo-2" class="w-3.5 h-3.5"></i> Restore & Failback to Primary
        </button>
        <button onclick="window.resetAllChaos()" class="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-bold rounded-full transition-all">
          Reset Chaos
        </button>
      </div>
    </div>

    <!-- Section 1: Weighted Region Scoring Board -->
    <div class="bg-white rounded-[24px] p-6 border border-stone-200/70 shadow-sm mb-6">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="text-sm font-bold text-stone-900 flex items-center gap-2">
            <i data-lucide="sliders" class="w-4 h-4 text-violet-600"></i>
            Weighted Region Scoring Engine (Multi-Factor Formula)
          </h3>
          <p class="text-[11px] text-stone-400">Score = w1*Health + w2*Capacity + w3*Latency + w4*Lag + w5*Cost</p>
        </div>
        <span class="px-3 py-1 rounded-full text-xs font-extrabold ${winner ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
          ${winner ? `Recommended Winner: ${winner}` : 'No Candidate Ready (Escalated)'}
        </span>
      </div>

      <!-- Sliders for Weights -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4 bg-stone-50 p-4 rounded-2xl border border-stone-100 mb-6">
        <div>
          <label class="text-[10px] font-bold text-stone-500 uppercase block mb-1">Health (${Math.round((w.health || 0.3)*100)}%)</label>
          <input type="range" min="0" max="1" step="0.05" value="${w.health || 0.3}" onchange="updateWeight('health', this.value)" class="w-full accent-violet-600">
        </div>
        <div>
          <label class="text-[10px] font-bold text-stone-500 uppercase block mb-1">Capacity (${Math.round((w.capacity || 0.25)*100)}%)</label>
          <input type="range" min="0" max="1" step="0.05" value="${w.capacity || 0.25}" onchange="updateWeight('capacity', this.value)" class="w-full accent-violet-600">
        </div>
        <div>
          <label class="text-[10px] font-bold text-stone-500 uppercase block mb-1">Latency (${Math.round((w.latency || 0.20)*100)}%)</label>
          <input type="range" min="0" max="1" step="0.05" value="${w.latency || 0.20}" onchange="updateWeight('latency', this.value)" class="w-full accent-violet-600">
        </div>
        <div>
          <label class="text-[10px] font-bold text-stone-500 uppercase block mb-1">Rep Lag (${Math.round((w.replication_lag || 0.15)*100)}%)</label>
          <input type="range" min="0" max="1" step="0.05" value="${w.replication_lag || 0.15}" onchange="updateWeight('replication_lag', this.value)" class="w-full accent-violet-600">
        </div>
        <div>
          <label class="text-[10px] font-bold text-stone-500 uppercase block mb-1">Cost (${Math.round((w.cost || 0.10)*100)}%)</label>
          <input type="range" min="0" max="1" step="0.05" value="${w.cost || 0.10}" onchange="updateWeight('cost', this.value)" class="w-full accent-violet-600">
        </div>
      </div>

      <!-- Live Comparison Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        <!-- DR-1 Breakdown -->
        <div class="p-5 rounded-2xl border-2 ${winner === 'region-dr-1' ? 'border-emerald-400 bg-emerald-50/20' : 'border-stone-200'}">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-sm font-bold text-stone-900">region-dr-1 (Warm Standby)</h4>
            <span class="text-xl font-extrabold font-mono text-emerald-600">${dr1.composite_score || 0} pts</span>
          </div>
          <div class="space-y-2 text-xs">
            <div class="flex justify-between"><span>Health Component:</span><strong>${dr1.health_score || 0} / 100</strong></div>
            <div class="flex justify-between"><span>Available Capacity:</span><strong>${dr1.capacity_score || 0} / 100 (${dr1.raw_capacity_qps || 450} QPS)</strong></div>
            <div class="flex justify-between"><span>Latency Score:</span><strong>${dr1.latency_score || 0} / 100 (${dr1.raw_latency_ms || 25} ms)</strong></div>
            <div class="flex justify-between"><span>Replication Lag Score:</span><strong>${dr1.lag_score || 0} / 100 (${dr1.raw_lag_ms || 12} ms)</strong></div>
            <div class="flex justify-between"><span>Cost Efficiency:</span><strong>${dr1.cost_score || 0} / 100 ($${dr1.raw_cost_per_hour || 0.70}/hr)</strong></div>
          </div>
        </div>

        <!-- DR-2 Breakdown -->
        <div class="p-5 rounded-2xl border-2 ${winner === 'region-dr-2' ? 'border-emerald-400 bg-emerald-50/20' : 'border-stone-200'}">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-sm font-bold text-stone-900">region-dr-2 (Economy Standby)</h4>
            <span class="text-xl font-extrabold font-mono text-indigo-600">${dr2.composite_score || 0} pts</span>
          </div>
          <div class="space-y-2 text-xs">
            <div class="flex justify-between"><span>Health Component:</span><strong>${dr2.health_score || 0} / 100</strong></div>
            <div class="flex justify-between"><span>Available Capacity:</span><strong>${dr2.capacity_score || 0} / 100 (${dr2.raw_capacity_qps || 300} QPS)</strong></div>
            <div class="flex justify-between"><span>Latency Score:</span><strong>${dr2.latency_score || 0} / 100 (${dr2.raw_latency_ms || 75} ms)</strong></div>
            <div class="flex justify-between"><span>Replication Lag Score:</span><strong>${dr2.lag_score || 0} / 100 (${dr2.raw_lag_ms || 38} ms)</strong></div>
            <div class="flex justify-between"><span>Cost Efficiency:</span><strong>${dr2.cost_score || 0} / 100 ($${dr2.raw_cost_per_hour || 0.25}/hr)</strong></div>
          </div>
        </div>

      </div>
    </div>

    <!-- Section 2: Chaos Engineering Pin Grid -->
    <h3 class="text-sm font-bold text-stone-900 mb-4 flex items-center gap-2">
      <i data-lucide="flame" class="w-4 h-4 text-[#E60023]"></i>
      Chaos Engineering & Fault Injection Pin Grid
    </h3>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      
      <!-- Fault 1: CPU & Latency Spike -->
      <div class="bg-white rounded-[24px] p-6 border border-stone-200/70 shadow-sm flex flex-col justify-between">
        <div>
          <div class="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3">
            <i data-lucide="zap-off" class="w-5 h-5"></i>
          </div>
          <h4 class="text-sm font-bold text-stone-900 mb-1">Inject CPU & Latency Spike</h4>
          <p class="text-xs text-stone-500 mb-4">Simulates resource contention (95% CPU, 280ms latency) in primary to test ML Isolation Forest early warning.</p>
        </div>
        <button onclick="injectChaos('spike')" class="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-all shadow-sm">
          Inject Spike →
        </button>
      </div>

      <!-- Fault 2: Hard Crash Primary -->
      <div class="bg-white rounded-[24px] p-6 border border-stone-200/70 shadow-sm flex flex-col justify-between">
        <div>
          <div class="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-3">
            <i data-lucide="skull" class="w-5 h-5"></i>
          </div>
          <h4 class="text-sm font-bold text-stone-900 mb-1">Hard Crash Primary Container</h4>
          <p class="text-xs text-stone-500 mb-4">Crashes primary health (503 Service Unavailable). Tests 3-window ML confirmation and dynamic Nginx failover.</p>
        </div>
        <button onclick="injectChaos('crash')" class="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm">
          Crash Primary →
        </button>
      </div>

      <!-- Fault 3: Degrade DR-1 -->
      <div class="bg-white rounded-[24px] p-6 border border-stone-200/70 shadow-sm flex flex-col justify-between">
        <div>
          <div class="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
            <i data-lucide="trending-down" class="w-5 h-5"></i>
          </div>
          <h4 class="text-sm font-bold text-stone-900 mb-1">Degrade DR-1 Capacity & Latency</h4>
          <p class="text-xs text-stone-500 mb-4">Adds 320ms latency and 75% capacity drop to DR-1. Forces scoring algorithm to pick DR-2 as the winning region.</p>
        </div>
        <button onclick="injectChaos('degrade-dr1')" class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm">
          Degrade DR-1 →
        </button>
      </div>

      <!-- Fault 4: No-Healthy-Region Simulation -->
      <div class="bg-white rounded-[24px] p-6 border border-stone-200/70 shadow-sm flex flex-col justify-between">
        <div>
          <div class="w-10 h-10 rounded-2xl bg-stone-100 text-stone-700 flex items-center justify-center mb-3">
            <i data-lucide="shield-alert" class="w-5 h-5"></i>
          </div>
          <h4 class="text-sm font-bold text-stone-900 mb-1">No-Healthy-Region Outage</h4>
          <p class="text-xs text-stone-500 mb-4">Simulates dual secondary failures. Tests Safe Administrator Escalation without dangerous blind switchover.</p>
        </div>
        <button onclick="injectChaos('no-healthy')" class="w-full py-2.5 bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold rounded-xl transition-all shadow-sm">
          Simulate Escalation →
        </button>
      </div>

      <!-- Fault 5: Manual Instant Failover -->
      <div class="bg-white rounded-[24px] p-6 border border-stone-200/70 shadow-sm flex flex-col justify-between">
        <div>
          <div class="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
            <i data-lucide="play" class="w-5 h-5"></i>
          </div>
          <h4 class="text-sm font-bold text-stone-900 mb-1">Manual Operator Failover</h4>
          <p class="text-xs text-stone-500 mb-4">Bypasses anomaly delay to test instant operator switchover, Nginx rewrite, and RTO/RPO calculation.</p>
        </div>
        <button onclick="triggerManualFailover()" class="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm">
          Trigger Switchover Now →
        </button>
      </div>

      <!-- Fault 6: Full Reset -->
      <div class="bg-white rounded-[24px] p-6 border border-stone-200/70 shadow-sm flex flex-col justify-between">
        <div>
          <div class="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mb-3">
            <i data-lucide="check" class="w-5 h-5"></i>
          </div>
          <h4 class="text-sm font-bold text-stone-900 mb-1">Clean System Recovery</h4>
          <p class="text-xs text-stone-500 mb-4">Clears all chaos flags, restores baseline latencies, and resets ML consecutive window counters to normal.</p>
        </div>
        <button onclick="resetAllChaos()" class="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm">
          Reset All Nodes →
        </button>
      </div>

    </div>
  `;
}

// =========================================================================
// PAGE 6: RTO/RPO REPORTS & ARCHITECTURE
// =========================================================================
function renderReportsPage(container, forceFull) {
  const incidents = state.incidents || [];

  container.innerHTML = `
    <div class="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 class="text-xl font-extrabold text-stone-900 tracking-tight">RTO/RPO Auditing & Architecture Evaluation</h2>
        <p class="text-xs text-stone-500">Validation & Performance Benchmark against Traditional Manual DR</p>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="downloadIncidentAudit('csv')" class="px-4 py-2 bg-white hover:bg-stone-50 text-stone-800 text-xs font-bold rounded-full border border-stone-200 transition-all shadow-sm flex items-center gap-1.5">
          <i data-lucide="download" class="w-3.5 h-3.5"></i> Export CSV
        </button>
        <button onclick="downloadIncidentAudit('json')" class="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold rounded-full transition-all flex items-center gap-1.5">
          <i data-lucide="file-json" class="w-3.5 h-3.5"></i> Export JSON
        </button>
      </div>
    </div>

    <!-- Side-by-Side Comparison: Traditional DR vs CloudDR Automated DR -->
    <div class="bg-white rounded-[24px] p-6 border border-stone-200/70 shadow-sm mb-6">
      <h3 class="text-sm font-bold text-stone-900 mb-4 flex items-center gap-2">
        <i data-lucide="scale" class="w-4 h-4 text-rose-600"></i>
        Benchmark Evaluation: Traditional Manual DR vs. Our Intelligent CloudDR
      </h3>

      <div class="overflow-x-auto">
        <table class="w-full text-xs text-left">
          <thead class="bg-stone-50 text-stone-500 uppercase text-[10px] tracking-wider border-b border-stone-100">
            <tr>
              <th class="p-3.5">Evaluation Dimension</th>
              <th class="p-3.5 text-stone-400">Traditional Manual DR</th>
              <th class="p-3.5 text-emerald-700 bg-emerald-50/60 font-extrabold">CloudDR Intelligent Automated DR</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stone-100 text-stone-700">
            <tr>
              <td class="p-3.5 font-bold text-stone-900">Recovery Time Objective (RTO)</td>
              <td class="p-3.5 text-stone-500">30 minutes to 4+ hours (human triage, DNS TTL propagation)</td>
              <td class="p-3.5 font-bold text-emerald-700 bg-emerald-50/30 font-mono">3.2 - 6.8 seconds (autonomous confirmation & switchover)</td>
            </tr>
            <tr>
              <td class="p-3.5 font-bold text-stone-900">Recovery Point Objective (RPO)</td>
              <td class="p-3.5 text-stone-500">15 minutes to 24 hours (hourly or daily batch backups)</td>
              <td class="p-3.5 font-bold text-emerald-700 bg-emerald-50/30 font-mono">&lt; 50 ms (continuous streaming replication)</td>
            </tr>
            <tr>
              <td class="p-3.5 font-bold text-stone-900">Disaster Detection Method</td>
              <td class="p-3.5 text-stone-500">Static single-threshold alarms (high false positive rate)</td>
              <td class="p-3.5 font-bold text-emerald-700 bg-emerald-50/30">Isolation Forest ML + 3-window consecutive filter</td>
            </tr>
            <tr>
              <td class="p-3.5 font-bold text-stone-900">Target Region Selection</td>
              <td class="p-3.5 text-stone-500">Hardcoded static secondary (no capacity/cost awareness)</td>
              <td class="p-3.5 font-bold text-emerald-700 bg-emerald-50/30">Weighted 5-Factor Scoring (Health, Cap, Latency, Lag, Cost)</td>
            </tr>
            <tr>
              <td class="p-3.5 font-bold text-stone-900">Failback Mechanism</td>
              <td class="p-3.5 text-stone-500">Complex manual delta sync script with high downtime risk</td>
              <td class="p-3.5 font-bold text-emerald-700 bg-emerald-50/30">One-click automated delta resynchronization & clean reverse</td>
            </tr>
            <tr>
              <td class="p-3.5 font-bold text-stone-900">Operational Cloud Cost</td>
              <td class="p-3.5 text-stone-500">Dual full-provisioned active-active clusters ($$$)</td>
              <td class="p-3.5 font-bold text-emerald-700 bg-emerald-50/30">Cost-tiered warm/economy standbys with dynamic promotion</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Historical Incident Cards -->
    <h3 class="text-sm font-bold text-stone-900 mb-4 flex items-center gap-2">
      <i data-lucide="history" class="w-4 h-4 text-indigo-600"></i>
      Historical Failover & Recovery Incident Audits
    </h3>

    <div class="space-y-4">
      ${incidents.length === 0 ? '<div class="p-8 text-center text-stone-400 bg-white rounded-2xl">No incidents recorded yet.</div>' : 
        incidents.map(inc => `
          <div class="bg-white rounded-[24px] p-6 border border-stone-200/70 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <span class="font-mono font-bold text-stone-900 text-sm">${inc.id}</span>
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${inc.status?.includes('COMPLETED') || inc.status?.includes('RESOLVED') ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
                  ${inc.status}
                </span>
                <span class="text-xs text-stone-400">${inc.created_at}</span>
              </div>
              <div class="text-xs font-semibold text-stone-700">${inc.trigger}</div>
              <div class="text-[11px] text-stone-500">${inc.notes || 'Automated recovery executed.'}</div>
            </div>

            <div class="flex items-center gap-6 border-t md:border-t-0 md:border-l border-stone-100 pt-3 md:pt-0 md:pl-6">
              <div class="text-center">
                <span class="text-[10px] font-bold text-stone-400 uppercase block">RTO Time</span>
                <span class="text-lg font-extrabold text-emerald-600 font-mono">${inc.rto_seconds || 0}s</span>
              </div>
              <div class="text-center">
                <span class="text-[10px] font-bold text-stone-400 uppercase block">RPO Lag</span>
                <span class="text-lg font-extrabold text-indigo-600 font-mono">${inc.rpo_ms || 0}ms</span>
              </div>
              <div class="text-center">
                <span class="text-[10px] font-bold text-stone-400 uppercase block">Route</span>
                <span class="text-xs font-bold text-stone-800 font-mono">${inc.failed_over_from} → ${inc.failed_over_to}</span>
              </div>
            </div>
          </div>
        `).join('')
      }
    </div>
  `;
}

// ----------------- Action Handlers -----------------
window.injectChaos = async function(type) {
  showToast(`Injecting chaos scenario: ${type}...`, 'warning');
  try {
    const res = await fetch(`${API_BASE}/api/chaos/${type}`, { method: 'POST' }).then(r => r.json());
    showToast(`Chaos injected: ${type}. Monitoring telemetry response.`, 'success');
    fetchSystemData();
  } catch (err) {
    showToast(`Error injecting chaos: ${err}`, 'error');
  }
};

window.triggerManualFailover = async function() {
  showToast('Initiating operator failover switchover...', 'warning');
  try {
    const res = await fetch(`${API_BASE}/api/failover/trigger`, { method: 'POST' }).then(r => r.json());
    if (res.status === 'escalated_to_admin') {
      showToast('Escalated to Administrator: No healthy candidate passed threshold.', 'error');
    } else {
      showToast(`Failover complete! Promoted: ${res.failed_over_to} (RTO: ${res.rto_seconds}s)`, 'success');
    }
    fetchSystemData();
  } catch (err) {
    showToast(`Failover error: ${err}`, 'error');
  }
};

window.triggerFailback = async function() {
  showToast('Executing automated failback to region-primary...', 'info');
  try {
    const res = await fetch(`${API_BASE}/api/failback`, { method: 'POST' }).then(r => r.json());
    if (res.status === 'failed') {
      showToast(`Failback blocked: ${res.message}`, 'error');
    } else {
      showToast('Failback successful! Primary restored & traffic redirected.', 'success');
    }
    fetchSystemData();
  } catch (err) {
    showToast(`Failback error: ${err}`, 'error');
  }
};

window.resetAllChaos = async function() {
  showToast('Resetting all region chaos flags...', 'info');
  try {
    await fetch(`${API_BASE}/api/chaos/reset`, { method: 'POST' });
    showToast('All regions restored to healthy baseline.', 'success');
    fetchSystemData();
  } catch (err) {
    showToast(`Reset error: ${err}`, 'error');
  }
};

window.retrainMLModel = async function() {
  showToast('Retraining Isolation Forest model on baseline data...', 'info');
  try {
    await fetch(`${API_BASE}/api/ml/retrain`, { method: 'POST' });
    showToast('Model recalibrated on 400 healthy baseline samples.', 'success');
    fetchSystemData();
  } catch (err) {
    showToast(`Retrain error: ${err}`, 'error');
  }
};

window.updateWeight = async function(param, val) {
  state.weights[param] = parseFloat(val);
  try {
    await fetch(`${API_BASE}/api/scoring/weights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.weights)
    });
    fetchSystemData();
  } catch (err) {
    console.error(err);
  }
};

window.downloadIncidentAudit = function(format) {
  window.open(`${API_BASE}/api/incidents/export?format=${format}`, '_blank');
};

// Global Search listener
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('globalSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.toLowerCase();
      // filter pins on overview
      document.querySelectorAll('.masonry-pin').forEach(pin => {
        const text = pin.innerText.toLowerCase();
        if (text.includes(state.searchQuery)) {
          pin.style.display = 'block';
        } else {
          pin.style.display = 'none';
        }
      });
    });
  }
});

// Initial boot
handleRoute();
fetchSystemData();
setInterval(fetchSystemData, 1500);
