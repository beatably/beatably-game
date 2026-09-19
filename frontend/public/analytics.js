/* Beatably analytics dashboard.
 * Standalone admin page (not part of the Vite app) that reads the aggregation
 * endpoints in backend/analytics.js. Split out of admin.html so the marketing
 * and product views can grow without turning that file into a monolith.
 */
(function () {
  'use strict';

  // --- API base: mirrors the resolution used by admin.html -----------------
  var API_BASE_URL = (function () {
    var loc = window.location;
    if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') {
      return loc.protocol + '//' + loc.hostname + ':3001';
    }
    if (loc.hostname.indexOf('netlify.app') !== -1 || loc.hostname.indexOf('beatably.app') !== -1) {
      return 'https://beatably-backend.onrender.com';
    }
    return loc.origin.replace(/\/$/, '');
  })();

  var SECRET_KEY = 'beatably_admin_secret';
  var charts = {};

  var state = {
    tab: 'overview',
    rangeDays: 30,
    country: '',
    device: '',
    grain: 'daily',
    gameGrain: 'daily',
    gameMode: '',
    clientMix: '',
    status: '',
    difficulty: '',
    search: '',
    sort: 'recent',
    page: 0,
    perPage: 50,
    sessionsTotal: 0,
    data: {},
  };

  // --- Small helpers -------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function num(n) { return (Number(n) || 0).toLocaleString(); }
  function pct(n) { return (n === null || n === undefined) ? '–' : n + '%'; }
  function secs(s) {
    s = Number(s) || 0;
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + String(r).padStart(2, '0');
  }
  function shortDate(iso) {
    if (!iso) return '–';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '–';
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function dayOnly(iso) {
    if (!iso) return '–';
    return String(iso).split('T')[0];
  }

  // Turn an ISO country code into a flag plus the code, e.g. "🇸🇪 SE".
  var COUNTRY_NAMES = {
    SE: 'Sweden', NO: 'Norway', DK: 'Denmark', FI: 'Finland', IS: 'Iceland',
    GB: 'United Kingdom', IE: 'Ireland', US: 'United States', CA: 'Canada',
    DE: 'Germany', FR: 'France', NL: 'Netherlands', BE: 'Belgium', ES: 'Spain',
    PT: 'Portugal', IT: 'Italy', CH: 'Switzerland', AT: 'Austria', PL: 'Poland',
    CZ: 'Czechia', GR: 'Greece', RO: 'Romania', HU: 'Hungary', TR: 'Turkey',
    RU: 'Russia', UA: 'Ukraine', AU: 'Australia', NZ: 'New Zealand',
    JP: 'Japan', KR: 'South Korea', CN: 'China', IN: 'India', SG: 'Singapore',
    BR: 'Brazil', MX: 'Mexico', AR: 'Argentina', CL: 'Chile', CO: 'Colombia',
    ZA: 'South Africa', NG: 'Nigeria', KE: 'Kenya', EG: 'Egypt', IL: 'Israel',
    AE: 'UAE', SA: 'Saudi Arabia', TH: 'Thailand', VN: 'Vietnam',
    ID: 'Indonesia', PH: 'Philippines', MY: 'Malaysia', HK: 'Hong Kong', TW: 'Taiwan',
  };
  function countryLabel(code) {
    if (!code || code === 'unknown') return '🌐 Unknown';
    var flag = code.replace(/./g, function (c) {
      return String.fromCodePoint(127397 + c.toUpperCase().charCodeAt(0));
    });
    return flag + ' ' + (COUNTRY_NAMES[code] || code);
  }

  function showStatus(msg, type) {
    var el = $('status');
    el.style.display = 'block';
    el.textContent = msg;
    el.className = 'status ' + (type || '');
    setTimeout(function () { el.style.display = 'none'; }, 3000);
  }

  // --- Auth ----------------------------------------------------------------
  function getSecret() { return localStorage.getItem(SECRET_KEY) || ''; }
  function setSecret(v) { localStorage.setItem(SECRET_KEY, v || ''); }

  async function adminFetch(path) {
    var secret = getSecret();
    if (!secret) throw new Error('Not authenticated');
    var resp = await fetch(API_BASE_URL + path, {
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
    });
    if (!resp.ok) throw new Error('Request failed: ' + resp.status);
    return resp.json();
  }

  async function adminSend(path, method) {
    var resp = await fetch(API_BASE_URL + path, {
      method: method,
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': getSecret() },
    });
    if (!resp.ok) throw new Error('Request failed: ' + resp.status);
    return resp.json();
  }

  // --- Query building ------------------------------------------------------
  function dateFromParam() {
    if (!state.rangeDays) return null;
    return new Date(Date.now() - state.rangeDays * 86400000).toISOString();
  }
  function baseQuery(extra) {
    var params = new URLSearchParams();
    var from = dateFromParam();
    if (from) params.set('dateFrom', from);
    if (state.country) params.set('country', state.country);
    if (state.device) params.set('device', state.device);
    Object.keys(extra || {}).forEach(function (k) {
      if (extra[k]) params.set(k, extra[k]);
    });
    var s = params.toString();
    return s ? '?' + s : '';
  }
  function gameFilterQuery(extra) {
    return baseQuery(Object.assign({
      gameMode: state.gameMode,
      clientMix: state.clientMix,
      status: state.status,
      difficulty: state.difficulty,
      search: state.search,
    }, extra || {}));
  }

  // --- Rendering primitives ------------------------------------------------
  function barList(el, entries, opts) {
    opts = opts || {};
    var node = typeof el === 'string' ? $(el) : el;
    if (!node) return;
    var rows = (entries || []).filter(function (e) { return e && e[1] > 0; });
    if (!rows.length) { node.innerHTML = '<div class="muted">No data</div>'; return; }
    var max = Math.max.apply(null, rows.map(function (r) { return r[1]; }));
    var total = rows.reduce(function (sum, r) { return sum + r[1]; }, 0);
    node.innerHTML = rows.slice(0, opts.limit || 15).map(function (r) {
      var label = opts.labeller ? opts.labeller(r[0]) : r[0];
      var share = total > 0 ? Math.round((r[1] / total) * 100) : 0;
      return '<div class="barrow">'
        + '<div class="fill" style="width:' + Math.round((r[1] / max) * 100) + '%"></div>'
        + '<div class="txt"><span>' + esc(label) + '</span>'
        + '<span class="nowrap"><b>' + num(r[1]) + '</b> <span class="muted">' + share + '%</span></span></div>'
        + '</div>';
    }).join('');
  }

  function objToEntries(obj) {
    return Object.entries(obj || {}).sort(function (a, b) { return b[1] - a[1]; });
  }

  var PALETTE = ['#1f6feb', '#2ea043', '#d29922', '#8957e5', '#db6d28', '#1f9ea0', '#da3633', '#6e7681'];

  function drawChart(id, config) {
    var el = $(id);
    if (!el || typeof Chart === 'undefined') return;
    if (charts[id]) charts[id].destroy();
    Chart.defaults.color = '#8b949e';
    Chart.defaults.borderColor = '#223045';
    charts[id] = new Chart(el, config);
  }

  function doughnut(id, obj, labeller) {
    var entries = objToEntries(obj).slice(0, 8);
    if (!entries.length) entries = [['No data', 1]];
    drawChart(id, {
      type: 'doughnut',
      data: {
        labels: entries.map(function (e) { return labeller ? labeller(e[0]) : e[0]; }),
        datasets: [{ data: entries.map(function (e) { return e[1]; }), backgroundColor: PALETTE, borderWidth: 0 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
      },
    });
  }

  function bars(id, obj, label, labeller) {
    var entries = Object.entries(obj || {}).sort(function (a, b) { return Number(a[0]) - Number(b[0]); });
    drawChart(id, {
      type: 'bar',
      data: {
        labels: entries.map(function (e) { return labeller ? labeller(e[0]) : e[0]; }),
        datasets: [{ label: label, data: entries.map(function (e) { return e[1]; }), backgroundColor: '#1f6feb' }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }

  // Collapse a [date, count] series into ISO weeks when weekly is selected.
  function rollUp(series, grain) {
    if (grain !== 'weekly') return series || [];
    var out = {};
    (series || []).forEach(function (row) {
      var d = new Date(row[0] + 'T00:00:00Z');
      var day = (d.getUTCDay() + 6) % 7;
      var monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
      var key = monday.toISOString().split('T')[0];
      out[key] = (out[key] || 0) + row[1];
    });
    return Object.entries(out).sort();
  }

  // Align several series onto one shared, sorted set of date labels.
  function alignSeries(seriesList, grain) {
    var rolled = seriesList.map(function (s) { return rollUp(s, grain); });
    var labels = [];
    var seen = {};
    rolled.forEach(function (s) {
      s.forEach(function (row) { if (!seen[row[0]]) { seen[row[0]] = true; labels.push(row[0]); } });
    });
    labels.sort();
    var data = rolled.map(function (s) {
      var map = Object.fromEntries(s);
      return labels.map(function (l) { return map[l] || 0; });
    });
    return { labels: labels, data: data };
  }

  function lineChart(id, labels, datasets) {
    drawChart(id, {
      type: 'line',
      data: {
        labels: labels,
        datasets: datasets.map(function (d, i) {
          return {
            label: d.label,
            data: d.data,
            borderColor: d.color || PALETTE[i % PALETTE.length],
            backgroundColor: (d.color || PALETTE[i % PALETTE.length]) + '33',
            fill: d.fill !== false,
            tension: 0.3,
            pointRadius: labels.length > 45 ? 0 : 2,
            borderWidth: 2,
          };
        }),
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }

  function csvDownload(filename, rows) {
    var body = rows.map(function (row) {
      return row.map(function (cell) {
        var v = cell === null || cell === undefined ? '' : String(cell);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(',');
    }).join('\n');
    var url = URL.createObjectURL(new Blob([body], { type: 'text/csv' }));
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // --- Data loading --------------------------------------------------------
  async function loadAll() {
    try {
      var results = await Promise.all([
        adminFetch('/api/admin/website-stats' + baseQuery()),
        adminFetch('/api/admin/visitor-stats' + baseQuery()),
        adminFetch('/api/admin/usage-stats' + gameFilterQuery()),
        adminFetch('/api/admin/health-stats' + baseQuery()),
      ]);
      state.data.web = results[0];
      state.data.visitors = results[1];
      state.data.usage = results[2];
      state.data.health = results[3];
      $('lastUpdated').textContent = 'Updated ' + new Date().toLocaleTimeString();
      populateFilterOptions();
      renderOverview();
      renderAcquisition();
      renderAudience();
      renderGames();
      renderHealth();
      loadSessions();
      loadErrorLog();
      loadFeedback();
    } catch (e) {
      showStatus('Could not load analytics: ' + e.message, 'error');
    }
  }

  function populateFilterOptions() {
    var select = $('filterCountry');
    var countries = (state.data.visitors && state.data.visitors.byCountry) || [];
    var current = state.country;
    select.innerHTML = '<option value="">All countries</option>'
      + countries.map(function (c) {
        return '<option value="' + esc(c[0]) + '">' + esc(countryLabel(c[0])) + ' (' + c[1] + ')</option>';
      }).join('');
    select.value = current;

    var diffSelect = $('filterDifficulty');
    var diffs = Object.keys((state.data.usage && state.data.usage.distributions.difficulty) || {});
    var currentDiff = state.difficulty;
    diffSelect.innerHTML = '<option value="">Any</option>'
      + diffs.map(function (d) { return '<option value="' + esc(d) + '">' + esc(d) + '</option>'; }).join('');
    diffSelect.value = currentDiff;

    var note = [];
    if (state.country) note.push('country ' + countryLabel(state.country));
    if (state.device) note.push('device ' + state.device);
    $('activeFilterNote').textContent = note.length ? 'Filtered by ' + note.join(' · ') : '';
  }

  // --- Overview ------------------------------------------------------------
  function renderOverview() {
    var web = state.data.web || {};
    var vis = state.data.visitors || {};
    var usage = state.data.usage || {};
    var health = state.data.health || {};
    var wo = web.overview || {}, vo = vis.overview || {}, uo = usage.overview || {}, ho = health.overview || {};

    $('kpiVisitors').textContent = num(wo.uniqueVisitors);
    $('kpiVisitorsSub').textContent = num(wo.totalViews) + ' page views';
    $('kpiReturning').textContent = num(wo.returningVisitors);
    $('kpiReturningSub').textContent = pct(wo.returningRate) + ' of visitors in range';
    $('kpiGames').textContent = num(uo.totalGames);
    $('kpiGamesSub').textContent = num(uo.multiplayerGames) + ' multiplayer · ' + num(uo.soloGames) + ' solo';
    $('kpiRepeat').textContent = num(vo.repeatPlayers);
    $('kpiRepeatSub').textContent = pct(vo.repeatPlayerRate) + ' of players play again';
    $('kpiFinish').textContent = pct(uo.completionRate);
    $('kpiFinishSub').textContent = num(uo.completedGames) + ' of ' + num(uo.totalGames) + ' finished';
    $('kpiProblems').textContent = num((ho.totalErrors || 0) + (ho.audioFailures || 0));
    $('kpiProblemsSub').textContent = num(ho.clientCrashes) + ' browser crashes';

    var funnel = web.funnel || {};
    var steps = [
      { label: 'Landing visitors', n: funnel.landingVisitors || 0 },
      { label: 'Game page visitors', n: funnel.gameVisitors || 0 },
      { label: 'Games started', n: funnel.gamesStarted || 0 },
      { label: 'Games finished', n: funnel.gamesCompleted || 0 },
    ];
    var first = steps[0].n || 1;
    $('overviewFunnel').innerHTML = steps.map(function (s, i) {
      var prev = i > 0 ? steps[i - 1].n : null;
      var dropText = prev === null ? 'start of funnel'
        : prev === 0 ? 'no one at previous step'
        : Math.round((s.n / prev) * 100) + '% of previous step';
      return '<div class="funnel-step">'
        + '<div class="muted">' + esc(s.label) + '</div>'
        + '<div class="n">' + num(s.n) + '</div>'
        + '<div class="muted">' + esc(dropText) + '</div>'
        + '<div class="bar" style="width:' + Math.max(4, Math.round((s.n / Math.max(1, first)) * 100)) + '%"></div>'
        + '</div>';
    }).join('');

    var aligned = alignSeries([
      (web.timeSeries || {}).viewsOverTime || [],
      (usage.timeSeries || {}).gamesOverTime || [],
    ], state.grain);
    lineChart('overviewTrendChart', aligned.labels, [
      { label: 'Page views', data: aligned.data[0], color: '#1f6feb' },
      { label: 'Games started', data: aligned.data[1], color: '#2ea043' },
    ]);

    barList('overviewCountries', vis.byCountry || [], { labeller: countryLabel, limit: 10 });
    barList('overviewChannels', (web.channels || []).map(function (c) { return [c.channel, c.views]; }), { limit: 10 });
    doughnut('overviewDeviceChart', Object.fromEntries(vis.byDevice || []));
    doughnut('overviewModeChart', (usage.distributions || {}).gameMode || {});
  }

  // --- Acquisition ---------------------------------------------------------
  function renderAcquisition() {
    var web = state.data.web || {};
    var usage = state.data.usage || {};
    var wo = web.overview || {};

    $('acqViews').textContent = num(wo.totalViews);
    $('acqNew').textContent = num(wo.newVisitors);
    $('acqNewSub').textContent = num(wo.returningVisitors) + ' returning';
    $('acqAppStore').textContent = num(wo.appStoreClicks);
    $('acqAppStoreSub').textContent = wo.uniqueVisitors
      ? Math.round((wo.appStoreClicks / wo.uniqueVisitors) * 100) + '% of visitors' : '';
    $('acqBrowser').textContent = num(wo.browserPlayClicks);
    $('acqBrowserSub').textContent = wo.uniqueVisitors
      ? Math.round((wo.browserPlayClicks / wo.uniqueVisitors) * 100) + '% of visitors' : '';

    var channels = web.channels || [];
    $('acqChannelsTbody').innerHTML = channels.length ? channels.map(function (c) {
      var rate = c.visitors > 0 ? Math.round((c.ctaClicks / c.visitors) * 100) : 0;
      return '<tr>'
        + '<td>' + esc(c.channel) + '</td>'
        + '<td class="num">' + num(c.views) + '</td>'
        + '<td class="num">' + num(c.visitors) + '</td>'
        + '<td class="num">' + num(c.ctaClicks) + '</td>'
        + '<td class="num">' + num(c.appStore) + '</td>'
        + '<td class="num">' + num(c.browserPlay) + '</td>'
        + '<td class="num ' + (rate >= 10 ? 'success' : '') + '">' + rate + '%</td>'
        + '</tr>';
    }).join('') : '<tr><td colspan="7" class="muted">No data</td></tr>';

    var ts = web.timeSeries || {};
    var aligned = alignSeries([ts.newVisitorsOverTime || [], ts.returningVisitorsOverTime || []], state.grain);
    lineChart('acqVisitorTrendChart', aligned.labels, [
      { label: 'New', data: aligned.data[0], color: '#2ea043' },
      { label: 'Returning', data: aligned.data[1], color: '#8957e5' },
    ]);

    barList('acqCampaignGames', objToEntries((usage.distributions || {}).campaignSource));
    barList('acqReferrers', web.referrers || []);
    barList('acqUtmSources', web.utmSources || []);
    barList('acqUtmCampaigns', web.utmCampaigns || []);
    barList('acqUtmMediums', web.utmMediums || []);
    barList('acqUtmContents', web.utmContents || []);
    barList('acqTopPages', web.topPages || []);
    barList('acqCtaBreakdown', web.ctaBreakdown || [], { limit: 20 });
  }

  // --- Audience ------------------------------------------------------------
  function renderAudience() {
    var vis = state.data.visitors || {};
    var vo = vis.overview || {};

    $('audTotal').textContent = num(vo.totalVisitors);
    $('audReturn').textContent = num(vo.returned);
    $('audReturnSub').textContent = pct(vo.returnRate) + ' came back at least once';
    $('audPlayers').textContent = num(vo.players);
    $('audPlayersSub').textContent = pct(vo.visitorToPlayerRate) + ' of visitors played';
    $('audRepeat').textContent = num(vo.repeatPlayers);
    $('audRepeatSub').textContent = pct(vo.repeatPlayerRate) + ' of players came back';
    $('audActive').textContent = num(vo.activeLast7);
    $('audChurned').textContent = num(vo.churned);

    var lc = vis.lifecycle || {};
    doughnut('audLifecycleChart', {
      'Active (0-7 days)': lc.active || 0,
      'Cooling (8-14 days)': lc.cooling || 0,
      'Dormant (15-30 days)': lc.dormant || 0,
      'Churned (30+ days)': lc.churned || 0,
    });

    var dn = vis.dayNRetention || {};
    var elig = dn.eligible || {};
    $('audDayN').innerHTML = [
      ['Day 1', dn.d1, elig.d1],
      ['Day 7', dn.d7, elig.d7],
      ['Day 30', dn.d30, elig.d30],
    ].map(function (r) {
      var value = r[1] === null || r[1] === undefined ? null : r[1];
      return '<div>'
        + '<div class="row" style="justify-content:space-between;">'
        + '<span>' + r[0] + '</span>'
        + '<span><b>' + (value === null ? 'not enough history' : value + '%') + '</b> '
        + '<span class="muted">' + num(r[2]) + ' eligible</span></span></div>'
        + '<div style="height:6px; background:#0b0f14; border-radius:3px; margin-top:4px; overflow:hidden;">'
        + '<div style="height:100%; width:' + (value || 0) + '%; background:#2ea043;"></div></div>'
        + '</div>';
    }).join('');

    barList('audVisitFrequency', objToEntries(vis.visitFrequency));
    barList('audGamesPerPlayer', objToEntries(vis.gamesPerPlayer));
    barList('audCountries', vis.byCountry || [], { labeller: countryLabel, limit: 20 });
    barList('audDevices', vis.byDevice || []);
    barList('audBrowsers', vis.byBrowser || []);
    barList('audOS', vis.byOS || []);
    barList('audFirstSource', vis.byFirstSource || [], { limit: 20 });

    var cohorts = vis.retentionCohorts || [];
    $('audCohortTbody').innerHTML = cohorts.length ? cohorts.map(function (c) {
      var cells = c.rates.map(function (rate, i) {
        if (i === 0) return '<td class="muted">100%</td>';
        var alpha = Math.min(0.75, rate / 100);
        return '<td style="background:rgba(46,160,67,' + alpha.toFixed(2) + ')">'
          + (rate > 0 ? rate + '%' : '–') + '</td>';
      }).join('');
      return '<tr><td class="label">' + esc(c.cohort) + '</td><td class="num">' + num(c.size) + '</td>' + cells + '</tr>';
    }).join('') : '<tr><td colspan="7" class="muted">No data</td></tr>';

    var top = vis.topVisitors || [];
    $('audVisitorsTbody').innerHTML = top.length ? top.map(function (v) {
      return '<tr>'
        + '<td class="mono" style="font-size:11px;">' + esc(String(v.vid).slice(0, 8)) + '…</td>'
        + '<td class="nowrap">' + esc(countryLabel(v.country)) + '</td>'
        + '<td>' + esc(v.device) + '</td>'
        + '<td>' + esc(v.source) + '</td>'
        + '<td class="num">' + num(v.days) + '</td>'
        + '<td class="num">' + num(v.views) + '</td>'
        + '<td class="num">' + num(v.games) + '</td>'
        + '<td class="nowrap">' + esc(shortDate(v.first)) + '</td>'
        + '<td class="nowrap">' + esc(shortDate(v.last)) + '</td>'
        + '</tr>';
    }).join('') : '<tr><td colspan="9" class="muted">No data</td></tr>';
  }

  // --- Games ---------------------------------------------------------------
  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function renderGames() {
    var usage = state.data.usage || {};
    var uo = usage.overview || {};
    var dist = usage.distributions || {};

    $('gmTotal').textContent = num(uo.totalGames);
    $('gmTotalSub').textContent = num(uo.multiplayerGames) + ' multiplayer · ' + num(uo.soloGames) + ' solo';
    $('gmFinished').textContent = num(uo.completedGames);
    $('gmFinishedSub').textContent = pct(uo.completionRate) + ' of games';
    $('gmPlayers').textContent = num(uo.identifiedPlayers || uo.uniquePlayers);
    $('gmPlayersSub').textContent = num(uo.uniquePlayers) + ' distinct names used';
    $('gmDuration').textContent = secs(uo.medianDuration);
    $('gmDurationSub').textContent = 'average ' + secs(uo.avgDuration);
    $('gmRounds').textContent = num(uo.avgRounds);
    $('gmRoundsSub').textContent = num(uo.totalRounds) + ' rounds in total';
    $('gmAbandon').textContent = pct(uo.abandonRate);
    $('gmAbandonSub').textContent = num(uo.abandonedGames) + ' games left unfinished';

    var ts = usage.timeSeries || {};
    var aligned = alignSeries([ts.multiplayerOverTime || [], ts.soloOverTime || []], state.gameGrain);
    lineChart('gmTrendChart', aligned.labels, [
      { label: 'Multiplayer', data: aligned.data[0], color: '#1f6feb' },
      { label: 'Solo', data: aligned.data[1], color: '#8957e5' },
    ]);

    bars('gmPlayerCountChart', dist.playerCount, 'Games');
    doughnut('gmDifficultyChart', dist.difficulty);
    doughnut('gmMusicChart', dist.musicMode);
    bars('gmWinConditionChart', dist.winCondition, 'Games');
    bars('gmHourChart', dist.hourOfDay, 'Games', function (h) { return h + ':00'; });
    bars('gmDayChart', dist.dayOfWeek, 'Games', function (d) { return WEEKDAYS[Number(d)] || d; });
  }

  async function loadSessions() {
    try {
      var query = gameFilterQuery({
        limit: state.perPage,
        offset: state.page * state.perPage,
        sort: state.sort,
      });
      var data = await adminFetch('/api/admin/game-sessions' + query);
      state.sessionsTotal = data.total || 0;
      state.lastSessions = data.items || [];

      var rows = state.lastSessions;
      $('gmSessionsTbody').innerHTML = rows.length ? rows.map(function (s) {
        var mode = s.gameMode || 'multiplayer';
        var countries = (s.countries || []).filter(function (c) { return c && c !== 'unknown'; });
        var campaign = s.campaign ? (s.campaign.source || '') + (s.campaign.campaign ? ' / ' + s.campaign.campaign : '') : '';
        return '<tr>'
          + '<td class="nowrap">' + esc(shortDate(s.startTime)) + '</td>'
          + '<td class="mono">' + esc(s.roomCode || '–') + '</td>'
          + '<td><span class="pill ' + esc(mode) + '">' + esc(mode) + '</span></td>'
          + '<td><span class="pill ' + esc(s.status) + '">' + esc(String(s.status).replace('_', ' ')) + '</span>'
          + (s.endReason && s.status === 'abandoned' ? '<div class="muted">' + esc(s.endReason) + '</div>' : '') + '</td>'
          + '<td class="num">' + num(s.playerCount) + '</td>'
          + '<td>' + esc((s.playerNames || []).join(', ')) + '</td>'
          + '<td>' + esc(s.clientMix || 'unknown') + '</td>'
          + '<td class="nowrap">' + (countries.length ? countries.map(countryLabel).map(esc).join(' ') : '<span class="muted">–</span>') + '</td>'
          + '<td>' + (campaign ? esc(campaign) : '<span class="muted">–</span>') + '</td>'
          + '<td class="num">' + num(s.totalRounds) + '</td>'
          + '<td class="num">' + num(s.winCondition) + '</td>'
          + '<td>' + esc(s.winnerName || '–') + '</td>'
          + '<td class="num">' + (s.duration ? secs(s.duration) : '–') + '</td>'
          + '<td>' + esc(s.difficulty || '–') + '</td>'
          + '<td>' + esc(s.musicMode || '–') + '</td>'
          + '</tr>';
      }).join('') : '<tr><td colspan="15" class="muted">No sessions match these filters</td></tr>';

      var start = state.page * state.perPage;
      $('gmSessionsCount').textContent = num(state.sessionsTotal) + ' sessions match';
      $('gmPageInfo').textContent = state.sessionsTotal
        ? 'Showing ' + (start + 1) + '–' + Math.min(start + rows.length, state.sessionsTotal)
        : '';
      $('gmPrevBtn').disabled = state.page === 0;
      $('gmNextBtn').disabled = start + state.perPage >= state.sessionsTotal;
    } catch (e) {
      showStatus('Could not load sessions: ' + e.message, 'error');
    }
  }

  // --- Health --------------------------------------------------------------
  function renderHealth() {
    var health = state.data.health || {};
    var ho = health.overview || {};

    $('hlErrors').textContent = num(ho.totalErrors);
    $('hlErrorsSub').textContent = num(ho.serverErrors) + ' server · ' + num(ho.clientCrashes) + ' browser';
    $('hlCrashes').textContent = num(ho.clientCrashes);
    $('hlAudio').textContent = num(ho.audioFailures);
    $('hlAbandon').textContent = pct(ho.abandonRate);
    $('hlAbandonSub').textContent = num(ho.abandonedGames) + ' of ' + num(ho.gamesStarted) + ' games';
    $('hlZero').textContent = num(ho.zeroRoundGames);
    $('hlZeroSub').textContent = pct(ho.zeroRoundRate) + ' never played a round';
    $('hlPerGame').textContent = ho.errorsPerGame || 0;

    var aligned = alignSeries([health.errorsOverTime || []], state.grain);
    lineChart('hlErrorTrendChart', aligned.labels, [
      { label: 'Errors', data: aligned.data[0], color: '#da3633' },
    ]);

    barList('hlErrorTypes', health.errorTypes || []);
    barList('hlAbandonByRound', objToEntries(health.abandonByRound));
    barList('hlAbandonReasons', objToEntries(health.abandonReasons));
    barList('hlAbandonByClient', objToEntries(health.abandonByClient));
    barList('hlAudioReasons', health.audioFailureReasons || []);
    barList('hlAudioBrowsers', health.audioFailureBrowsers || []);

    var issues = health.topIssues || [];
    $('hlIssuesTbody').innerHTML = issues.length ? issues.map(function (i) {
      return '<tr>'
        + '<td class="num"><b>' + num(i.count) + '</b></td>'
        + '<td class="nowrap">' + esc(i.errorType) + '</td>'
        + '<td class="mono" style="font-size:12px;">' + esc(i.message) + '</td>'
        + '<td class="nowrap muted">' + esc(shortDate(i.firstSeen)) + '</td>'
        + '<td class="nowrap">' + esc(shortDate(i.lastSeen)) + '</td>'
        + '<td class="mono">' + esc((i.sample && i.sample.roomCode) || '–') + '</td>'
        + '</tr>';
    }).join('') : '<tr><td colspan="6" class="muted">Nothing broken in this range</td></tr>';

    var typeFilter = $('hlErrorTypeFilter');
    var current = typeFilter.value;
    typeFilter.innerHTML = '<option value="">All types</option>'
      + (health.errorTypes || []).map(function (t) {
        return '<option value="' + esc(t[0]) + '">' + esc(t[0]) + ' (' + t[1] + ')</option>';
      }).join('');
    typeFilter.value = current;
  }

  async function loadErrorLog() {
    try {
      var query = baseQuery({ limit: 200, errorType: $('hlErrorTypeFilter').value });
      var data = await adminFetch('/api/admin/error-logs' + query);
      state.lastErrors = data.items || [];
      $('hlErrorsTbody').innerHTML = state.lastErrors.length ? state.lastErrors.map(function (e) {
        var ctx = e.context ? (typeof e.context === 'string' ? e.context : JSON.stringify(e.context)) : '';
        return '<tr>'
          + '<td class="nowrap muted">' + esc(shortDate(e.timestamp)) + '</td>'
          + '<td class="nowrap">' + esc(e.errorType) + '</td>'
          + '<td class="mono" style="font-size:12px;">' + esc(String(e.message).slice(0, 200)) + '</td>'
          + '<td class="mono">' + esc(e.roomCode || '–') + '</td>'
          + '<td>' + esc(e.playerName || '–') + '</td>'
          + '<td class="muted mono" style="font-size:11px;">' + esc(ctx.slice(0, 220)) + '</td>'
          + '</tr>';
      }).join('') : '<tr><td colspan="6" class="muted">No errors</td></tr>';
    } catch (e) {
      showStatus('Could not load error log: ' + e.message, 'error');
    }
  }

  async function loadFeedback() {
    try {
      var data = await adminFetch('/api/admin/feedback?limit=50');
      var items = data.items || [];
      $('hlFeedbackTbody').innerHTML = items.length ? items.map(function (f) {
        return '<tr>'
          + '<td class="nowrap muted">' + esc(shortDate(f.timestamp || f.createdAt)) + '</td>'
          + '<td>' + esc(f.message) + '</td>'
          + '<td class="muted">' + esc(f.context || '') + '</td>'
          + '</tr>';
      }).join('') : '<tr><td colspan="3" class="muted">No feedback yet</td></tr>';
    } catch (e) {
      $('hlFeedbackTbody').innerHTML = '<tr><td colspan="3" class="muted">Could not load feedback</td></tr>';
    }
  }

  // --- Wiring --------------------------------------------------------------
  function switchTab(tab) {
    state.tab = tab;
    ['overview', 'acquisition', 'audience', 'games', 'health'].forEach(function (t) {
      $('tab-' + t).style.display = (t === tab) ? 'block' : 'none';
    });
    Array.prototype.forEach.call(document.querySelectorAll('#tabBar .tab'), function (el) {
      el.classList.toggle('active', el.dataset.tab === tab);
    });
    location.hash = tab;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Chip groups behave like radio buttons within their own row.
  function wireChipGroup(attr, onPick) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-' + attr + ']'), function (chip) {
      chip.addEventListener('click', function () {
        var siblings = chip.parentElement.querySelectorAll('[data-' + attr + ']');
        Array.prototype.forEach.call(siblings, function (s) { s.classList.remove('active'); });
        chip.classList.add('active');
        onPick(chip.dataset[attr]);
      });
    });
  }

  function wire() {
    Array.prototype.forEach.call(document.querySelectorAll('#tabBar .tab'), function (el) {
      el.addEventListener('click', function () { switchTab(el.dataset.tab); });
    });

    wireChipGroup('range', function (v) {
      state.rangeDays = v === 'all' ? null : Number(v);
      state.page = 0;
      loadAll();
    });
    wireChipGroup('grain', function (v) { state.grain = v; renderOverview(); renderAcquisition(); renderHealth(); });
    wireChipGroup('gamegrain', function (v) { state.gameGrain = v; renderGames(); });
    wireChipGroup('gamemode', function (v) { state.gameMode = v; state.page = 0; loadAll(); });
    wireChipGroup('clientmix', function (v) { state.clientMix = v; state.page = 0; loadAll(); });
    wireChipGroup('status', function (v) { state.status = v; state.page = 0; loadAll(); });

    $('filterCountry').addEventListener('change', function (e) {
      state.country = e.target.value; state.page = 0; loadAll();
    });
    $('filterDevice').addEventListener('change', function (e) {
      state.device = e.target.value; state.page = 0; loadAll();
    });
    $('filterDifficulty').addEventListener('change', function (e) {
      state.difficulty = e.target.value; state.page = 0; loadAll();
    });
    $('filterSort').addEventListener('change', function (e) {
      state.sort = e.target.value; state.page = 0; loadSessions();
    });
    $('gmPerPage').addEventListener('change', function (e) {
      state.perPage = Number(e.target.value); state.page = 0; loadSessions();
    });

    var searchTimer = null;
    $('filterSearch').addEventListener('input', function (e) {
      clearTimeout(searchTimer);
      var value = e.target.value;
      searchTimer = setTimeout(function () {
        state.search = value; state.page = 0; loadAll();
      }, 350);
    });

    $('gmPrevBtn').addEventListener('click', function () {
      if (state.page > 0) { state.page--; loadSessions(); }
    });
    $('gmNextBtn').addEventListener('click', function () {
      if ((state.page + 1) * state.perPage < state.sessionsTotal) { state.page++; loadSessions(); }
    });

    $('clearFiltersBtn').addEventListener('click', function () {
      state.country = ''; state.device = ''; state.gameMode = ''; state.clientMix = '';
      state.status = ''; state.difficulty = ''; state.search = ''; state.page = 0;
      $('filterSearch').value = '';
      Array.prototype.forEach.call(document.querySelectorAll('[data-gamemode],[data-clientmix],[data-status]'), function (c) {
        c.classList.toggle('active', c.dataset.gamemode === '' || c.dataset.clientmix === '' || c.dataset.status === '');
      });
      loadAll();
    });

    $('refreshBtn').addEventListener('click', loadAll);
    $('hlErrorTypeFilter').addEventListener('change', loadErrorLog);

    $('exportSessionsBtn').addEventListener('click', function () {
      var rows = [['Started', 'Room', 'Mode', 'Outcome', 'EndReason', 'Players', 'Names', 'Platform',
        'Countries', 'CampaignSource', 'Campaign', 'Rounds', 'Target', 'Winner', 'Seconds', 'Difficulty', 'MusicMode']];
      (state.lastSessions || []).forEach(function (s) {
        rows.push([s.startTime, s.roomCode, s.gameMode, s.status, s.endReason || '', s.playerCount,
          (s.playerNames || []).join(' | '), s.clientMix, (s.countries || []).join(' '),
          (s.campaign && s.campaign.source) || '', (s.campaign && s.campaign.campaign) || '',
          s.totalRounds, s.winCondition, s.winnerName || '', s.duration || '', s.difficulty, s.musicMode]);
      });
      csvDownload('beatably-sessions.csv', rows);
    });

    $('exportVisitorsBtn').addEventListener('click', function () {
      var rows = [['Visitor', 'Country', 'Device', 'FirstSource', 'ActiveDays', 'Views', 'Games', 'FirstSeen', 'LastSeen']];
      (((state.data.visitors || {}).topVisitors) || []).forEach(function (v) {
        rows.push([v.vid, v.country, v.device, v.source, v.days, v.views, v.games, v.first, v.last]);
      });
      csvDownload('beatably-visitors.csv', rows);
    });

    $('exportErrorsBtn').addEventListener('click', function () {
      var rows = [['Time', 'Type', 'Message', 'Room', 'Player', 'Context']];
      (state.lastErrors || []).forEach(function (e) {
        rows.push([e.timestamp, e.errorType, e.message, e.roomCode || '', e.playerName || '',
          e.context ? JSON.stringify(e.context) : '']);
      });
      csvDownload('beatably-errors.csv', rows);
    });

    $('clearOldBtn').addEventListener('click', async function () {
      if (!confirm('Delete all analytics data older than 90 days? This cannot be undone.')) return;
      try {
        var r = await adminSend('/api/admin/analytics-data?olderThanDays=90', 'DELETE');
        showStatus('Removed ' + r.sessionsRemoved + ' sessions, ' + r.errorsRemoved + ' errors, '
          + r.pageviewsRemoved + ' pageviews, ' + (r.visitorsRemoved || 0) + ' visitors.', 'success');
        loadAll();
      } catch (e) {
        showStatus('Clear failed: ' + e.message, 'error');
      }
    });

    $('signOutBtn').addEventListener('click', function () {
      setSecret('');
      location.reload();
    });

    $('authSubmitBtn').addEventListener('click', submitAuth);
    $('authInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitAuth();
    });
  }

  async function submitAuth() {
    setSecret($('authInput').value.trim());
    await ensureAuthenticated();
  }

  async function ensureAuthenticated() {
    if (!getSecret()) {
      $('authModal').style.display = 'flex';
      $('content').style.display = 'none';
      return;
    }
    try {
      await adminFetch('/api/admin/usage-stats?limit=1');
      $('authModal').style.display = 'none';
      $('content').style.display = 'block';
      loadAll();
    } catch (e) {
      $('authModal').style.display = 'flex';
      $('content').style.display = 'none';
    }
  }

  // --- Boot ----------------------------------------------------------------
  wire();
  var initialTab = (location.hash || '').replace('#', '');
  if (['overview', 'acquisition', 'audience', 'games', 'health'].indexOf(initialTab) !== -1) {
    switchTab(initialTab);
  }
  ensureAuthenticated();
})();
