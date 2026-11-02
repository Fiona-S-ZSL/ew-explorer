// app.js ------------------------------------------------------------------
// Extinct-in-the-Wild species explorer (static port of the R Shiny app).
// Loads the spreadsheet as CSV, normalises it exactly as global.R did, then
// renders every view in the browser. No server and no R needed at runtime.
(function () {
  'use strict';

  var CFG = window.EW_CONFIG || {};

  // ---- Constants (from global.R) ---------------------------------------
  var GROUP_COLOURS = {
    Mammal: '#c8772e', Bird: '#2f7fd1', Fish: '#16b6cf', Amphibian: '#3aaf3a',
    Reptile: '#9b59c6', Invertebrate: '#e84d8a', Plant: '#2e9e5b', Other: '#7a8a8d'
  };
  var GROUP_ICONS = {
    Mammal: '🐾', Bird: '🕊️', Fish: '🐟', Amphibian: '🐸',
    Reptile: '🦎', Invertebrate: '🐛', Plant: '🌱', Other: '❓'
  };
  var GROUP_LEVELS = ['Mammal', 'Bird', 'Reptile', 'Amphibian', 'Fish', 'Invertebrate', 'Plant', 'Other'];

  var COUNTRY_ISO_MAP = {
    'Argentina': ['ARG'], 'Argentina and Paraguay': ['ARG', 'PRY'],
    'Belgium, Luxembourg and France,': ['BEL', 'LUX', 'FRA'], 'Bermuda': ['BMU'],
    'Bolivia': ['BOL'], 'Brazil': ['BRA'], 'Chile': ['CHL'],
    'Chile, Bolivia, Peru, Ecuador, Colombia': ['CHL', 'BOL', 'PER', 'ECU', 'COL'],
    'China': ['CHN'], 'Christmas island': ['CXR'], 'Colombia, Equador': ['COL', 'ECU'],
    'Cuba': ['CUB'], 'Ecuador': ['ECU'], 'Ecuador, Columbia': ['ECU', 'COL'],
    'Eswatini': ['SWZ'], 'French Polynesia': ['PYF'], 'Guam': ['GUM'], 'Hawaii': ['USA'],
    'India': ['IND'], 'Indonesia': ['IDN'], 'japan': ['JPN'], 'Kenya': ['KEN'],
    'Madagascar': ['MDG'], 'Marquesas islands': ['PYF'], 'Mauritius': ['MUS'],
    'Menorca, Spain': ['ESP'], 'Mexico': ['MEX'], 'Myanmar': ['MMR'],
    'new Mexico/ USA': ['USA'], 'Pitcairn': ['PCN'], 'Rapa Nui': ['CHL'],
    'South Africa': ['ZAF'], 'Sri Lanka': ['LKA'], 'St Helena': ['SHN'], 'Sumatra': ['IDN'],
    'Taiwan': ['TWN'], 'Tanzania': ['TZA'], 'UK': ['GBR'], 'US': ['USA'], 'USA': ['USA'],
    'Viet Nam': ['VNM']
  };
  var ISO_COUNTRY_NAME = {
    ARG: 'Argentina', PRY: 'Paraguay', BEL: 'Belgium', LUX: 'Luxembourg', FRA: 'France',
    BMU: 'Bermuda', BOL: 'Bolivia', BRA: 'Brazil', CHL: 'Chile', PER: 'Peru', ECU: 'Ecuador',
    COL: 'Colombia', CHN: 'China', CXR: 'Christmas Island', CUB: 'Cuba', SWZ: 'Eswatini',
    PYF: 'French Polynesia', GUM: 'Guam', USA: 'United States', IND: 'India', IDN: 'Indonesia',
    JPN: 'Japan', KEN: 'Kenya', MDG: 'Madagascar', MUS: 'Mauritius', ESP: 'Spain', MEX: 'Mexico',
    MMR: 'Myanmar', PCN: 'Pitcairn Islands', ZAF: 'South Africa', LKA: 'Sri Lanka',
    SHN: 'Saint Helena', TWN: 'Taiwan', TZA: 'Tanzania', GBR: 'United Kingdom', VNM: 'Vietnam',
    NZL: 'New Zealand', ROU: 'Romania'
  };
  var COUNTRY_FALLBACK = { 'Clianthus puniceus': 'NZL', 'Scardinius racovitzai': 'ROU' };

  // Case-insensitive lookups so new free-text entries from contributors still
  // map when the spelling differs only by case / spacing.
  function key(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  var ISO_BY_KEY = {};
  Object.keys(COUNTRY_ISO_MAP).forEach(function (k) { ISO_BY_KEY[key(k)] = COUNTRY_ISO_MAP[k]; });
  var ISO_BY_NAME = {
    'equador': 'ECU', 'columbia': 'COL', 'england': 'GBR', 'scotland': 'GBR', 'wales': 'GBR',
    'united kingdom': 'GBR', 'united states': 'USA', 'united states of america': 'USA',
    'vietnam': 'VNM', 'new zealand': 'NZL', 'romania': 'ROU'
  };
  Object.keys(ISO_COUNTRY_NAME).forEach(function (iso) { ISO_BY_NAME[key(ISO_COUNTRY_NAME[iso])] = iso; });

  // ---- Small helpers ---------------------------------------------------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function titleCase(x) {
    x = (x || '').trim();
    return x ? x.toLowerCase().replace(/(^|[\s\-\/(])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); }) : '';
  }
  function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function colour(g) { return GROUP_COLOURS[g] || '#7a8a8d'; }
  function rgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function splitField(x, re) {
    if (!x) return [];
    return String(x).split(re || /[|,;]/).map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function isUrl(x) { return /^https?:\/\//i.test(String(x || '').trim()); }
  function youtubeId(url) {
    var m = String(url || '').trim().match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : '';
  }
  function asCount(x) {
    var n = parseFloat(String(x == null ? '' : x).trim());
    return isFinite(n) ? Math.round(n) : null;
  }
  function paragraphs(text) {
    return String(text).split(/\n+/).filter(function (p) { return p.trim(); })
      .map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
  }
  function displayName(s) { return s.common_name || s.scientific_name; }
  function labelHtml(s) {
    return s.common_name
      ? '<strong>' + esc(s.common_name) + '</strong><br><em>' + esc(s.scientific_name) + '</em>'
      : '<em>' + esc(s.scientific_name) + '</em>';
  }
  function unique(arr) { return Array.from(new Set(arr)); }
  function sortStr(arr) { return arr.slice().sort(function (a, b) { return a.localeCompare(b); }); }
  function countBy(arr, fn) {
    var m = new Map();
    arr.forEach(function (x) { var k = fn(x); m.set(k, (m.get(k) || 0) + 1); });
    return m;
  }

  function deriveGroup(kingdom, cls) {
    var k = (kingdom || '').toUpperCase(), c = (cls || '').toUpperCase();
    if (k === 'PLANTAE') return 'Plant';
    if (c === 'MAMMALIA') return 'Mammal';
    if (c === 'AVES') return 'Bird';
    if (c === 'ACTINOPTERYGII') return 'Fish';
    if (c === 'AMPHIBIA') return 'Amphibian';
    if (c === 'REPTILIA') return 'Reptile';
    if (c === 'GASTROPODA' || c === 'INSECTA' || c === 'MALACOSTRACA') return 'Invertebrate';
    return 'Other';
  }

  // ---- Data loading ----------------------------------------------------
  function fetchCsv(url) {
    return new Promise(function (resolve, reject) {
      Papa.parse(url, {
        download: true, header: true, skipEmptyLines: 'greedy',
        complete: function (res) { resolve(res.data); },
        error: function (err) { reject(err); }
      });
    });
  }

  function rowGetter(row) {
    var m = {};
    Object.keys(row).forEach(function (k) { m[key(k).replace(/ /g, '')] = row[k]; });
    return function (name) {
      var v = m[key(name).replace(/ /g, '')];
      return v == null ? '' : String(v).trim();
    };
  }

  var ISSUES = { unmappedCountry: [], noCommon: [], dupes: [], badYear: [] };

  function mapCountries(sp) {
    var raw = sp.country.trim(), iso = null;
    if (raw) {
      iso = ISO_BY_KEY[key(raw)];
      if (!iso) {
        // Try splitting a multi-country string and mapping each part.
        var found = [];
        raw.split(/,|;|\/|\band\b/i).forEach(function (part) {
          var k = key(part);
          if (!k) return;
          var hit = ISO_BY_KEY[k] || (ISO_BY_NAME[k] ? [ISO_BY_NAME[k]] : null);
          if (hit) found = found.concat(hit);
        });
        if (found.length) iso = unique(found);
      }
    }
    if (!iso && COUNTRY_FALLBACK[sp.scientific_name]) iso = [COUNTRY_FALLBACK[sp.scientific_name]];
    if (!iso) ISSUES.unmappedCountry.push(sp);
    return iso || [];
  }

  function buildSpecies(rows, commonRows) {
    var common = {};
    (commonRows || []).forEach(function (r) {
      var g = rowGetter(r);
      if (g('scientific_name') && g('common_name')) common[key(g('scientific_name'))] = g('common_name');
    });

    var seen = {}, out = [];
    rows.forEach(function (r) {
      var g = rowGetter(r);
      if (!g('className')) return;                     // drop blank / name-only rows
      var sci = g('scientificName');
      if (!sci) return;
      var sp = {
        scientific_name: sci,
        authority: g('authority'),
        kingdom: titleCase(g('kingdomName')),
        phylum: titleCase(g('phylumName')),
        taxon_class: titleCase(g('className')),
        taxon_order: titleCase(g('orderName')),
        taxon_family: titleCase(g('familyName')),
        taxon_genus: titleCase(g('genusName')),
        group_type: deriveGroup(g('kingdomName'), g('className')),
        year_published: parseInt(g('yearPublished'), 10),
        assessment_date: g('assessmentDate').replace(/^(\d{4}-\d{2}-\d{2}).*$/, '$1'),
        year_last_seen: g('yearLastSeen'),
        country: g('Country'),
        realm: g('realm'),
        systems: g('systems'),
        taxonomic_notes: g('taxonomicNotes'),
        rationale: g('rationale'), habitat: g('habitat'), threats: g('threats'),
        population: g('population'), range: g('range'), use_trade: g('useTrade'),
        conservation_actions: g('conservationActions'),
        ex_situ_population: g('ex situ population size'),
        holders: g('holders'), countries: g('countries'), programmes: g('programmes'),
        recent_news: g('Recent news'), media: g('Media'),
        common_name: g('commonName') || common[key(sci)] || ''
      };
      sp.systems_list = splitField(sp.systems, /\|/);
      var id = slug(sci), n = 2, base = id;
      while (seen[id]) { ISSUES.dupes.push(sp); id = base + '-' + n++; }
      seen[id] = true;
      sp.id = id;
      sp.isos = mapCountries(sp);
      if (!isFinite(sp.year_published)) { sp.year_published = null; ISSUES.badYear.push(sp); }
      if (!sp.common_name) ISSUES.noCommon.push(sp);
      out.push(sp);
    });
    return out;
  }

  // ---- State -----------------------------------------------------------
  var S = [];                 // all species
  var BY_ID = {};
  var rendered = {};          // lazily rendered views
  var state = {
    tab: 'overview', sub: 'map', prevTab: 'overview', detailId: null,
    sort: { key: 'group_type', dir: 1 },
    mapGroup: '', mapIso: ''
  };

  // ---- Router ----------------------------------------------------------
  function go(tab, arg) {
    location.hash = arg ? tab + '/' + arg : tab;
  }
  function route() {
    var parts = location.hash.replace(/^#/, '').split('/');
    var tab = parts[0] || 'overview';
    if (tab === 'map') { state.sub = 'map'; tab = 'overview'; }   // old World map address
    if (tab === 'detail' && !(parts[1] && BY_ID[parts[1]])) tab = 'species';
    if (['overview', 'species', 'analytics', 'detail', 'check'].indexOf(tab) < 0) tab = 'overview';
    if (tab === 'detail') { state.detailId = parts[1]; }
    if (state.tab !== 'detail' && tab === 'detail') state.prevTab = state.tab;
    showTab(tab);
  }

  function showTab(tab) {
    state.tab = tab;
    $$('.ew-panel').forEach(function (p) { p.classList.toggle('active', p.id === 'panel-' + tab); });
    $$('.ew-tab').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === tab); });
    $('#tab-detail-btn').hidden = !state.detailId;
    if (tab === 'detail') renderDetail();
    else if (tab === 'overview') { ensure('overview'); showSub(state.sub); }
    else if (tab === 'species') ensure('species');
    else if (tab === 'analytics') { ensure('analytics'); resizePlots('#panel-analytics'); }
    else if (tab === 'check') renderCheck();
    window.scrollTo(0, 0);
    postHeight();
  }

  var INIT = {
    overview: initOverview, species: initSpecies, analytics: initAnalytics, map: initMap
  };
  function ensure(name) {
    if (rendered[name]) return;
    rendered[name] = true;
    INIT[name]();
  }
  function resizePlots(sel) {
    // Plotly sizes to 0 in hidden panels; nudge after the panel becomes visible.
    setTimeout(function () {
      $$(sel + ' .ew-plot').forEach(function (d) { if (d.data) Plotly.Plots.resize(d); });
      postHeight();
    }, 30);
  }

  // ---- Overview --------------------------------------------------------
  function initOverview() {
    $('#hero-title').textContent = 'The ' + S.length + ' Extinct-in-the-Wild species';

    var counts = countBy(S, function (s) { return s.group_type; });
    var groups = Array.from(counts.entries()).sort(function (a, b) { return b[1] - a[1]; });
    var html = '<div class="ew-stat" style="background:#003b46"><div class="ew-stat-icon">🌍</div>' +
      '<div><div class="ew-stat-title">EW species (total)</div><div class="ew-stat-value">' + S.length + '</div></div></div>';
    groups.forEach(function (e) {
      html += '<div class="ew-stat" style="background:' + colour(e[0]) + '"><div class="ew-stat-icon">' +
        (GROUP_ICONS[e[0]] || '🌿') + '</div><div><div class="ew-stat-title">' + esc(e[0]) +
        '</div><div class="ew-stat-value">' + e[1] + '</div></div></div>';
    });
    $('#stat-cards').innerHTML = html;

    $$('.ew-subtab').forEach(function (b) {
      b.addEventListener('click', function () { showSub(b.getAttribute('data-sub')); });
    });
    initFind();
  }

  function showSub(name) {
    state.sub = name;
    $$('.ew-subtab').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-sub') === name); });
    $$('.ew-subpanel').forEach(function (p) { p.classList.toggle('active', p.id === 'sub-' + name); });
    if (name === 'map') { ensure('map'); resizePlots('#sub-map'); }
    if (name === 'sunburst') { drawSunburst(); }
    postHeight();
  }

  function hierarchy() {
    var nodes = new Map();
    function bump(id, label, parent, group, v) {
      var n = nodes.get(id);
      if (!n) { n = { id: id, label: label, parent: parent, group: group, value: 0 }; nodes.set(id, n); }
      n.value += v;
    }
    bump('root', 'All EW species', '', 'Other', 0);
    S.forEach(function (s) {
      var g = s.group_type, o = s.taxon_order || '(unranked order)', f = s.taxon_family || '(unranked family)',
        ge = s.taxon_genus || '(unranked genus)';
      var iG = 'g||' + g, iO = iG + '||o||' + o, iF = iO + '||f||' + f, iGe = iF + '||ge||' + ge,
        iS = iGe + '||s||' + s.scientific_name;
      bump('root', '', '', 'Other', 1);
      bump(iG, g, 'root', g, 1);
      bump(iO, o, iG, g, 1);
      bump(iF, f, iO, g, 1);
      bump(iGe, ge, iF, g, 1);
      bump(iS, s.common_name ? esc(s.common_name) + '<br>' + esc(s.scientific_name) : esc(s.scientific_name), iGe, g, 1);
    });
    return Array.from(nodes.values());
  }

  function drawSunburst() {
    var h = hierarchy();
    Plotly.newPlot('sunburst', [{
      type: 'sunburst',
      ids: h.map(function (n) { return n.id; }),
      labels: h.map(function (n) { return n.label; }),
      parents: h.map(function (n) { return n.parent; }),
      values: h.map(function (n) { return n.value; }),
      branchvalues: 'total',
      marker: { colors: h.map(function (n) { return colour(n.group); }), line: { color: '#fff', width: 1 } },
      insidetextorientation: 'radial',
      hovertemplate: '<b>%{label}</b><br>%{value} species<extra></extra>',
      maxdepth: 3
    }], { margin: { l: 0, r: 0, t: 0, b: 0 }, paper_bgcolor: 'rgba(0,0,0,0)', font: { family: 'Inter, sans-serif' } },
    { responsive: true, displayModeBar: false });
  }

  function initFind() {
    var list = $('#find-list');
    var opts = S.slice().sort(function (a, b) { return displayName(a).toLowerCase().localeCompare(displayName(b).toLowerCase()); });
    var map = {};
    list.innerHTML = opts.map(function (s) {
      var lbl = s.common_name ? s.common_name + ' (' + s.scientific_name + ')' : s.scientific_name;
      map[lbl.toLowerCase()] = s.id;
      return '<option value="' + esc(lbl) + '"></option>';
    }).join('');
    function show() {
      var v = $('#find-input').value.trim().toLowerCase();
      var s = BY_ID[map[v]];
      if (!s) {
        s = S.filter(function (x) { return x.scientific_name.toLowerCase() === v || (x.common_name && x.common_name.toLowerCase() === v); })[0];
      }
      renderFind(s);
    }
    $('#find-input').addEventListener('input', show);
    $('#find-input').addEventListener('change', show);
    renderFind(null);
  }

  function renderFind(s) {
    if (!s) {
      $('#find-facts').innerHTML = '<div class="ew-muted" style="margin-top:1rem">Pick a species to see its classification and a quick fact card.</div>';
      $('#find-lineage').innerHTML = '<div class="ew-muted" style="margin-top:1rem">The selected species\' taxonomic lineage will appear here.</div>';
      return;
    }
    var col = colour(s.group_type);
    function fact(l, v) { return v ? '<div class="ew-fact"><span>' + l + '</span><strong>' + esc(v) + '</strong></div>' : ''; }
    $('#find-facts').innerHTML =
      '<div class="ew-sub-card" style="border-top:5px solid ' + col + '"><div class="bd">' +
      '<h4 style="margin:0">' + (GROUP_ICONS[s.group_type] || '') + ' ' + esc(displayName(s)) + '</h4>' +
      '<em class="ew-muted" style="display:block;margin-bottom:.6rem">' + esc(s.scientific_name) + '</em>' +
      fact('Group', s.group_type) + fact('Country of origin', s.country) +
      (hidden('years') ? '' : fact('Year assessed', s.year_published ? String(s.year_published) : '')) +
      fact('Systems', s.systems_list.join(', ')) +
      '<a class="ew-btn ew-btn-sm" style="margin-top:.8rem" href="#detail/' + esc(s.id) + '">View full dashboard &rarr;</a>' +
      '</div></div>';

    var lin = [['Kingdom', s.kingdom], ['Phylum', s.phylum], ['Class', s.taxon_class], ['Order', s.taxon_order],
      ['Family', s.taxon_family], ['Genus', s.taxon_genus], ['Species', s.scientific_name]];
    var steps = lin.map(function (p, i) {
      var last = i === lin.length - 1, v = p[1] || '(unranked)';
      var val = last
        ? '<em>' + esc(v) + '</em>' + (s.common_name ? '<span class="ew-muted" style="margin-left:.5rem">— ' + esc(s.common_name) + '</span>' : '')
        : esc(v);
      return '<div class="ew-step"><div class="ew-step-bar" style="background:' + (last ? col : rgba(col, 0.33)) + '"></div>' +
        '<div style="padding:.4rem 0"><div class="ew-step-rank">' + p[0] + '</div>' +
        '<div style="font-size:' + (last ? '1.15rem' : '1rem') + ';font-weight:' + (last ? 700 : 500) + (last ? '' : ';color:#33474b') + '">' + val + '</div></div></div>';
    }).join('');
    $('#find-lineage').innerHTML = '<div class="ew-sub-card"><div class="hd">Taxonomic map</div><div class="bd">' + steps + '</div></div>';
    postHeight();
  }

  // ---- Species grid ----------------------------------------------------
  var GRID_COLS = [
    { k: 'label', t: 'Species', sort: function (s) { return displayName(s).toLowerCase(); } },
    { k: 'group_type', t: 'Group' }, { k: 'taxon_class', t: 'Class' }, { k: 'taxon_family', t: 'Family' },
    { k: 'realm', t: 'Realm' }, { k: 'systems', t: 'System' }, { k: 'country', t: 'Country' },
    { k: 'year_published', t: 'Year published' }
  ];

  function fillSelect(id, values) {
    $(id).innerHTML = '<option value="">All</option>' + values.map(function (v) {
      return '<option>' + esc(v) + '</option>';
    }).join('');
  }

  function initSpecies() {
    fillSelect('#f-group', sortStr(unique(S.map(function (s) { return s.group_type; }))));
    fillSelect('#f-class', sortStr(unique(S.map(function (s) { return s.taxon_class; }).filter(Boolean))));
    fillSelect('#f-realm', sortStr(unique(S.map(function (s) { return s.realm; }).filter(Boolean))));
    fillSelect('#f-system', sortStr(unique([].concat.apply([], S.map(function (s) { return s.systems_list; })))));
    fillSelect('#f-country', sortStr(unique(S.map(function (s) { return s.country; }).filter(Boolean))));
    ['#f-group', '#f-class', '#f-realm', '#f-system', '#f-country'].forEach(function (id) {
      $(id).addEventListener('change', renderGrid);
    });
    $('#f-search').addEventListener('input', renderGrid);
    $('#f-reset').addEventListener('click', function () {
      ['#f-group', '#f-class', '#f-realm', '#f-system', '#f-country'].forEach(function (id) { $(id).value = ''; });
      $('#f-search').value = '';
      renderGrid();
    });
    $('#grid').addEventListener('click', function (e) {
      var th = e.target.closest('th');
      if (th) {
        var k = th.getAttribute('data-k');
        state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : 1 };
        return renderGrid();
      }
      var tr = e.target.closest('tr[data-id]');
      if (tr) go('detail', tr.getAttribute('data-id'));
    });
    renderGrid();
  }

  function renderGrid() {
    var g = $('#f-group').value, c = $('#f-class').value, r = $('#f-realm').value,
      sy = $('#f-system').value, co = $('#f-country').value, q = $('#f-search').value.trim().toLowerCase();
    var rows = S.filter(function (s) {
      return (!g || s.group_type === g) && (!c || s.taxon_class === c) && (!r || s.realm === r) &&
        (!sy || s.systems_list.indexOf(sy) >= 0) && (!co || s.country === co) &&
        (!q || s.scientific_name.toLowerCase().indexOf(q) >= 0 || s.common_name.toLowerCase().indexOf(q) >= 0);
    });
    var col = GRID_COLS.filter(function (x) { return x.k === state.sort.key; })[0] || GRID_COLS[1];
    var val = col.sort || function (s) { return s[col.k] == null ? '' : s[col.k]; };
    rows.sort(function (a, b) {
      var x = val(a), y = val(b), d;
      d = (typeof x === 'number' && typeof y === 'number') ? x - y : String(x).localeCompare(String(y));
      return (d || displayName(a).toLowerCase().localeCompare(displayName(b).toLowerCase())) * state.sort.dir;
    });
    $('#grid-count').textContent = 'Extinct-in-the-Wild species (' + rows.length + ' of ' + S.length + ')';
    var showYear = !hidden('years');
    var head = '<thead><tr>' + GRID_COLS.filter(function (x) { return showYear || x.k !== 'year_published'; }).map(function (x) {
      var arrow = x.k === state.sort.key ? '<span class="arrow">' + (state.sort.dir > 0 ? '▲' : '▼') + '</span>' : '';
      return '<th data-k="' + x.k + '">' + x.t + arrow + '</th>';
    }).join('') + '</tr></thead>';
    var body = rows.length ? rows.map(function (s) {
      return '<tr data-id="' + esc(s.id) + '"><td>' + labelHtml(s) + '</td><td>' + esc(s.group_type) + '</td><td>' + esc(s.taxon_class) +
        '</td><td>' + esc(s.taxon_family) + '</td><td>' + esc(s.realm) + '</td><td>' + esc(s.systems_list.join(', ')) +
        '</td><td>' + esc(s.country) + '</td>' + (showYear ? '<td>' + (s.year_published || '') + '</td>' : '') + '</tr>';
    }).join('') : '<tr><td colspan="8" class="ew-empty">No species match these filters.</td></tr>';
    $('#grid').innerHTML = head + '<tbody>' + body + '</tbody>';
    postHeight();
  }

  // ---- Analytics -------------------------------------------------------
  function plotBar(div, entries, colours, xTitle) {
    entries.sort(function (a, b) { return a[1] - b[1]; });
    Plotly.newPlot(div, [{
      type: 'bar', orientation: 'h',
      x: entries.map(function (e) { return e[1]; }),
      y: entries.map(function (e) { return e[0]; }),
      marker: { color: typeof colours === 'function' ? entries.map(function (e) { return colours(e[0]); }) : colours },
      hovertemplate: '%{y}: %{x}<extra></extra>'
    }], {
      xaxis: { title: xTitle || 'Number of species' }, yaxis: { title: '', automargin: true },
      margin: { l: 10, r: 10, t: 10, b: 40 }, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
      font: { family: 'Inter, sans-serif' }
    }, { responsive: true, displayModeBar: false });
  }

  function initAnalytics() {
    function entries(fn) { return Array.from(countBy(S.filter(function (s) { return fn(s) !== ''; }), fn).entries()); }
    plotBar('ch-group', entries(function (s) { return s.group_type; }), colour);
    plotBar('ch-class', entries(function (s) { return s.taxon_class; }), '#006272');
    plotBar('ch-realm', entries(function (s) { return s.realm; }), '#006272');
    var sys = new Map();
    S.forEach(function (s) { s.systems_list.forEach(function (x) { sys.set(x, (sys.get(x) || 0) + 1); }); });
    plotBar('ch-system', Array.from(sys.entries()), '#2e7d32');

    if (hidden('years')) { $('#card-year').hidden = true; return; }
    var yrs = countBy(S.filter(function (s) { return s.year_published; }), function (s) { return s.year_published; });
    var ys = Array.from(yrs.keys()).sort(function (a, b) { return a - b; });
    Plotly.newPlot('ch-year', [{
      type: 'bar', x: ys, y: ys.map(function (y) { return yrs.get(y); }), marker: { color: '#b30000' },
      hovertemplate: '%{x}: %{y}<extra></extra>'
    }], {
      xaxis: { title: 'Year published', dtick: 1 }, yaxis: { title: 'Number of species' },
      margin: { l: 50, r: 10, t: 10, b: 50 }, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
      font: { family: 'Inter, sans-serif' }
    }, { responsive: true, displayModeBar: false });
  }

  // ---- World map -------------------------------------------------------
  function mapSpecies() {
    return state.mapGroup ? S.filter(function (s) { return s.group_type === state.mapGroup; }) : S;
  }
  function countryCounts(df) {
    var m = new Map();
    df.forEach(function (s) {
      s.isos.forEach(function (iso) { m.set(iso, (m.get(iso) || 0) + 1); });
    });
    return Array.from(m.entries()).map(function (e) {
      return { iso: e[0], name: ISO_COUNTRY_NAME[e[0]] || e[0], n: e[1] };
    }).sort(function (a, b) { return b.n - a.n; });
  }

  function initMap() {
    $('#map-country').addEventListener('change', function () { state.mapIso = this.value; renderMapList(); });
    $('#map-pills').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-g]');
      if (!b) return;
      state.mapGroup = b.getAttribute('data-g'); state.mapIso = '';
      drawMap();
    });
    $('#map-species').addEventListener('click', function (e) {
      var a = e.target.closest('a[data-id]');
      if (a) { e.preventDefault(); go('detail', a.getAttribute('data-id')); }
    });
    drawMap();
  }

  function drawMap() {
    var df = mapSpecies(), cc = countryCounts(df), g = state.mapGroup;

    var present = GROUP_LEVELS.filter(function (x) { return S.some(function (s) { return s.group_type === x; }); });
    function pill(value, label, col) {
      var on = state.mapGroup === value;
      return '<button class="ew-pill" data-g="' + esc(value) + '" style="border-color:' + col + ';' +
        (on ? 'background:' + col + ';color:#fff' : 'color:' + col) + '">' + esc(label) + '</button>';
    }
    $('#map-pills').innerHTML = '<span class="ew-muted" style="font-weight:600">Show:</span>' + pill('', 'All groups', '#003b46') +
      present.map(function (x) { return pill(x, x, colour(x)); }).join('');

    $('#map-title').textContent = g ? 'EW ' + g.toLowerCase() + 's by country of origin' : 'EW species by country of origin';

    var byName = cc.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    $('#map-country').innerHTML = '<option value="">Click the map…</option>' + byName.map(function (c) {
      return '<option value="' + c.iso + '">' + esc(c.name) + ' (' + c.n + ')</option>';
    }).join('');
    $('#map-country').value = state.mapIso;

    var scale = g
      ? [[0, '#f4efe6'], [0.5, rgba(colour(g), 0.67)], [1, colour(g)]]
      : [[0, '#fde725'], [0.25, '#5ec962'], [0.5, '#21918c'], [0.75, '#3b528b'], [1, '#440154']];
    Plotly.newPlot('map', [{
      type: 'choropleth', locations: cc.map(function (c) { return c.iso; }), z: cc.map(function (c) { return c.n; }),
      text: cc.map(function (c) { return c.name + ': ' + c.n + ' species'; }), hoverinfo: 'text',
      colorscale: scale, marker: { line: { color: '#ffffff', width: 0.6 } },
      colorbar: { title: 'Species', thickness: 12, len: 0.7 }
    }], {
      paper_bgcolor: 'rgba(0,0,0,0)', margin: { l: 0, r: 0, t: 0, b: 0 }, font: { family: 'Inter, sans-serif' },
      geo: {
        showframe: false, showcoastlines: true, coastlinecolor: '#cdd9da', showland: true, landcolor: '#eef3f2',
        showocean: true, oceancolor: '#dcebef', lakecolor: '#dcebef', showlakes: true,
        bgcolor: 'rgba(0,0,0,0)', projection: { type: 'natural earth' }
      }
    }, { responsive: true, displayModeBar: false }).then(function (gd) {
      gd.on('plotly_click', function (ev) {
        var iso = ev.points && ev.points[0] && ev.points[0].location;
        if (iso) { state.mapIso = iso; $('#map-country').value = iso; renderMapList(); }
      });
    });
    renderMapList();
  }

  function renderMapList() {
    var box = $('#map-species'), iso = state.mapIso;
    if (!iso) { box.innerHTML = '<div class="ew-muted">No country selected yet.</div>'; return; }
    var rows = mapSpecies().filter(function (s) { return s.isos.indexOf(iso) >= 0; })
      .sort(function (a, b) { return displayName(a).toLowerCase().localeCompare(displayName(b).toLowerCase()); });
    if (!rows.length) { box.innerHTML = '<div class="ew-muted">No EW species recorded for this country.</div>'; return; }
    box.innerHTML = '<h4 style="margin-top:.6rem;font-size:1rem">' + esc(ISO_COUNTRY_NAME[iso] || iso) + ' (' + rows.length + ' species)</h4>' +
      '<div class="ew-list">' + rows.map(function (s) {
        return '<a href="#detail/' + esc(s.id) + '" data-id="' + esc(s.id) + '" style="border-left-color:' + colour(s.group_type) + '">' +
          (s.common_name ? '<strong>' + esc(s.common_name) + '</strong><br><em>' + esc(s.scientific_name) + '</em>' : '<em>' + esc(s.scientific_name) + '</em>') + '</a>';
      }).join('') + '</div>';
    postHeight();
  }

  // ---- Species detail --------------------------------------------------
  function dl(label, value) {
    return value ? '<dt>' + label + '</dt><dd>' + esc(value) + '</dd>' : '';
  }
  function acc(title, text, open) {
    return text ? '<details class="ew-acc"' + (open ? ' open' : '') + '><summary>' + title + '</summary>' + paragraphs(text) + '</details>' : '';
  }
  function vbox(title, value, bg, icon) {
    return '<div class="ew-stat" style="background:' + bg + '"><div class="ew-stat-icon">' + icon + '</div><div><div class="ew-stat-title">' +
      title + '</div><div class="ew-stat-value" style="font-size:' + (String(value).length > 8 ? '1.2rem' : '2rem') + '">' + esc(value) + '</div></div></div>';
  }

  // Sections switched off in config.js (hiddenSections).
  function hidden(name) { return (CFG.hiddenSections || []).indexOf(name) >= 0; }

  function renderDetail() {
    var s = BY_ID[state.detailId], box = $('#detail');
    if (!s) { box.innerHTML = '<div class="ew-muted" style="padding:2rem">Select a species from the Species page to view its dashboard.</div>'; return; }
    var back = state.prevTab && state.prevTab !== 'detail' ? state.prevTab : 'species';
    var col = colour(s.group_type);
    var holders = asCount(s.holders), nCountries = asCount(s.countries), programmes = splitField(s.programmes);
    var news = splitField(s.recent_news, /\|/), media = splitField(s.media, /\|/);

    var html = '<p style="margin:.8rem 0 0"><a href="#' + back + '">&larr; Back</a></p>' +
      '<div class="ew-detail-head">' +
      (s.common_name ? '<div><h3>' + esc(s.common_name) + '</h3><em class="ew-muted">' + esc(s.scientific_name) + '</em></div>'
        : '<h3><em>' + esc(s.scientific_name) + '</em></h3>') +
      (s.authority ? '<span class="ew-muted">' + esc(s.authority) + '</span>' : '') +
      '<span class="ew-badge" style="background:' + col + '">' + esc(s.group_type) + '</span></div>';

    html += '<div class="ew-detail-grid">' +
      '<div class="ew-card"><div class="ew-card-head"><span>Taxonomy &amp; distribution</span></div><div class="ew-card-body"><dl class="ew-dl">' +
      dl('Kingdom', s.kingdom) + dl('Phylum', s.phylum) + dl('Class', s.taxon_class) + dl('Order', s.taxon_order) +
      dl('Family', s.taxon_family) + dl('Genus', s.taxon_genus) + dl('Group', s.group_type) +
      dl('Systems', s.systems_list.join(', ')) + dl('Realm', s.realm) + dl('Country', s.country) + '</dl>' +
      '<a target="_blank" rel="noopener" href="https://www.iucnredlist.org/search?query=' + encodeURIComponent(s.scientific_name) + '&searchType=species">Search on IUCN Red List</a></div></div>' +
      (hidden('assessment') ? '' :
        '<div class="ew-card"><div class="ew-card-head"><span>Assessment</span></div><div class="ew-card-body"><dl class="ew-dl">' +
        dl('Year published', s.year_published ? String(s.year_published) : '') + dl('Assessment date', s.assessment_date) + dl('Year last seen', s.year_last_seen) + '</dl>' +
        (s.taxonomic_notes ? '<strong>Taxonomic notes</strong>' + paragraphs(s.taxonomic_notes) : '') + '</div></div>') + '</div>';

    if (!hidden('narrative')) html += '<div class="ew-card" style="margin-bottom:1rem"><div class="ew-card-head"><span>IUCN narrative</span></div><div class="ew-card-body">' +
      acc('Rationale', s.rationale, true) + acc('Population', s.population) + acc('Habitat &amp; ecology', s.habitat) +
      acc('Range', s.range) + acc('Threats', s.threats) + acc('Use &amp; trade', s.use_trade) +
      acc('Conservation actions', s.conservation_actions) + '</div></div>';

    if (!hidden('exsitu')) html += '<div class="ew-card" style="margin-bottom:1rem"><div class="ew-card-head"><span>Ex-situ conservation &amp; participation</span></div><div class="ew-card-body">' +
      '<div class="ew-vboxes">' +
      vbox('Ex-situ population size', s.ex_situ_population || 'Not recorded', '#006272', '❤️') +
      vbox('Holding institutions', holders != null ? holders : 'Not recorded', '#00879b', '🏛️') +
      vbox('Holding countries', nCountries != null ? nCountries : 'Not recorded', '#2e9e5b', '🌎') + '</div>' +
      '<h5 style="margin-top:.8rem;font-size:1rem">Programmes</h5>' +
      (programmes.length ? '<ul>' + programmes.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>'
        : '<div class="ew-muted">No programmes recorded yet.</div>') + '</div></div>';

    if (news.length) {
      html += '<div class="ew-card" style="margin-bottom:1rem"><div class="ew-card-head"><span>📰 Recent news</span></div><div class="ew-card-body"><ul style="list-style:none;padding:0;margin:0">' +
        news.map(function (n) {
          return '<li style="margin-bottom:.5rem">' + (isUrl(n) ? '<a href="' + esc(n) + '" target="_blank" rel="noopener">' + esc(n) + '</a>' : esc(n)) + '</li>';
        }).join('') + '</ul></div></div>';
    }
    if (media.length) {
      html += '<div class="ew-card"><div class="ew-card-head"><span>🎬 Media</span></div><div class="ew-card-body">' +
        '<p class="ew-muted">Videos open in a new browser tab.</p><div class="ew-media-grid">' + media.map(function (u) {
          var v = youtubeId(u);
          return v
            ? '<a class="ew-media-tile" href="' + esc(u) + '" target="_blank" rel="noopener"><div class="ew-media-thumb"><img loading="lazy" alt="Video thumbnail" src="https://img.youtube.com/vi/' + v + '/hqdefault.jpg"><div class="ew-media-play"><span>▶</span></div></div><span class="ew-media-label">Watch on YouTube</span></a>'
            : '<a class="ew-btn ew-btn-sm ew-btn-ghost" href="' + esc(u) + '" target="_blank" rel="noopener">Open media</a>';
        }).join('') + '</div></div></div>';
    }
    box.innerHTML = html;
  }

  // ---- Data check (#check) ---------------------------------------------
  function renderCheck() {
    function section(title, list, fmt, hint) {
      return '<div class="ew-card" style="margin-bottom:1rem"><div class="ew-card-head"><span>' + title + ' (' + list.length + ')</span></div><div class="ew-card-body">' +
        '<p class="ew-muted ew-small">' + hint + '</p>' +
        (list.length ? '<ul>' + list.map(function (s) { return '<li>' + fmt(s) + '</li>'; }).join('') + '</ul>' : '<p>✅ None</p>') + '</div></div>';
    }
    $('#check').innerHTML =
      '<p><strong>' + S.length + '</strong> species loaded from <code>' + esc(state.source || '') + '</code>.</p>' +
      section('Country not recognised', ISSUES.unmappedCountry, function (s) { return '<em>' + esc(s.scientific_name) + '</em>: "' + esc(s.country) + '"'; },
        'These species will not appear on the world map. Use a standard country name (e.g. "Brazil"), or add the spelling to COUNTRY_ISO_MAP in app.js.') +
      section('No common name', ISSUES.noCommon, function (s) { return '<em>' + esc(s.scientific_name) + '</em>'; },
        'Shown by scientific name only. Add a row to the common names sheet (or a commonName column in the master sheet).') +
      section('Duplicate scientific names', ISSUES.dupes, function (s) { return '<em>' + esc(s.scientific_name) + '</em>'; },
        'Each species should appear once.') +
      section('Missing or invalid yearPublished', ISSUES.badYear, function (s) { return '<em>' + esc(s.scientific_name) + '</em>'; },
        'These species are left out of the "assessments per year" chart.');
    postHeight();
  }

  // ---- Embedding: tell the parent page how tall we are -----------------
  var lastH = 0;
  function postHeight() {
    if (window.parent === window) return;
    requestAnimationFrame(function () {
      var h = document.documentElement.scrollHeight;
      if (Math.abs(h - lastH) > 2) { lastH = h; window.parent.postMessage({ type: 'ew-height', height: h }, '*'); }
    });
  }

  // ---- Boot ------------------------------------------------------------
  function notice(msg) { var n = $('#ew-notice'); n.textContent = msg; n.hidden = false; }

  function load() {
    return Promise.all([fetchCsv(CFG.masterCsv), CFG.commonNamesCsv ? fetchCsv(CFG.commonNamesCsv).catch(function () { return []; }) : []])
      .then(function (r) { state.source = CFG.masterCsv; return r; })
      .catch(function (err) {
        if (CFG.fallbackMasterCsv && CFG.fallbackMasterCsv !== CFG.masterCsv) {
          notice('The live data source could not be reached, so the last uploaded copy of the data is being shown.');
          return Promise.all([fetchCsv(CFG.fallbackMasterCsv), fetchCsv(CFG.fallbackCommonNamesCsv).catch(function () { return []; })])
            .then(function (r) { state.source = CFG.fallbackMasterCsv; return r; });
        }
        throw err;
      });
  }

  function boot() {
    $('#iucn-link').href = CFG.iucnUrl || 'https://www.iucnredlist.org/';
    $$('.ew-tab').forEach(function (b) {
      b.addEventListener('click', function () { go(b.getAttribute('data-tab'), b.getAttribute('data-tab') === 'detail' ? state.detailId : ''); });
    });
    load().then(function (r) {
      S = buildSpecies(r[0], r[1]);
      S.forEach(function (s) { BY_ID[s.id] = s; });
      if (!S.length) throw new Error('No species rows found in the data.');
      $('#ew-loading').hidden = true;
      $('#ew-main').hidden = false;
      window.addEventListener('hashchange', route);
      route();
      if (window.ResizeObserver) new ResizeObserver(postHeight).observe(document.body);
    }).catch(function (err) {
      $('#ew-loading').innerHTML = 'Sorry, the species data could not be loaded. Please try again later.';
      if (window.console) console.error(err);
    });
  }

  boot();
})();
