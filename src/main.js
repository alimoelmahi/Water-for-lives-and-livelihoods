import './styles.css';
import { select, easeCubicInOut } from 'd3';
import { createMap } from './map.js';
import { downloadMapPNG } from './map-export.js';
import { createPreloader } from './preloader.js';
import { initLandingMotion } from './landing-motion.js';
import { createFieldStories, projectEvidence } from './field-stories.js';
import { enhanceDropdowns } from './dropdowns.js';
import { layers, filterProjects, fetchJSON, escapeHTML as esc } from './model.js';

const icons = {
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m3 8 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 18l9 5 9-5"/></svg>',
};

const app = document.querySelector('#app');
const preloader = createPreloader(app);
let datasets;
async function boot() {
  try {
  const [states, projects, stories, geo, photos, indicators, cases, region] = await Promise.all([
    'states.json', 'projects.json', 'story_content.json', 'sudan-states.geojson',
    'photos.json', 'indicators.json', 'case_studies.json', 'sudan-region.geojson',
  ].map(fetchJSON));
  datasets = { states, projects, stories, geo, photos, indicators, cases, region };
  start();
  try {
    await app.querySelector('.hero-photo').decode();
  } catch (error) {
    console.error('The opening photograph could not be loaded.', error);
    app.querySelector('.hero-copy').insertAdjacentHTML('beforeend',
      '<p class="hero-photo-error" role="alert">The opening photograph could not be loaded. The map and report content are still available.</p>');
  }
  preloader.ready();
  } catch (error) {
  app.innerHTML = `<main class="load-error"><p class="eyebrow">SUDAN IMPACT ATLAS</p><h1>The atlas could not be opened.</h1><p>${esc(error.message)}</p><p>Please check your connection and try again.</p><button class="button primary" id="retry">Try again</button></main>`;
  document.querySelector('#retry').addEventListener('click', () => location.reload());
  console.error(error);
  preloader.fail();
  }
}
boot();

function start() {
  const { states, projects, geo, photos, cases, region } = datasets;
  const storyStates = [...new Set(projects.map(project => project.state))].sort();
  const photoById = new Map(photos.photos.map(photo => [photo.id, photo]));
  const photoAlt = id => esc(photoById.get(id)?.alt || 'Photograph from the UNDP Sudan publication');
  let state = 'all';
  let search = '';
  let enabledLayers = layers.map(layer => layer.id);
  let theme = 'footprint';
  let activeTab = 'finance';
  let evidenceData;
  let evidenceLoading;
  let chartModule;
  let dialogTrigger;
  let panelKey;
  let placePanelAnimation;
  const panelMotion = matchMedia('(prefers-reduced-motion: reduce)');
  panelMotion.addEventListener('change', () => {
    if (panelMotion.matches) placePanelAnimation?.cancel();
  });
  const tabs = [
    { id: 'finance', name: 'Finance & investment' },
    { id: 'jobs', name: 'Jobs & employment' },
    { id: 'markets', name: 'Markets' },
    { id: 'partners', name: 'Partners' },
    { id: 'pathways', name: 'Five pathways' },
  ];

  const dividerPaths = '<path class="wave-back" fill="#ffffff" opacity=".45" /><path class="wave-front" />';
  app.innerHTML = `
    <header class="site-header">
      <a class="brand" href="#" aria-label="Water for Lives and Livelihoods home"><img src="images/image2.webp" alt="UNDP" width="32" height="65"><span>United Nations<br>Development Programme<span class="brand-country">SUDAN</span></span></a>
      <nav class="main-nav" aria-label="Main navigation"><a href="#atlas" class="nav-link">The map</a><a href="#stories" class="nav-link">Field impact stories</a><a href="#evidence" class="nav-link">Results</a></nav>
      <a href="publication.docx" download class="report-link">Read the report ${icons.download}<span class="sr-only"> (Word document)</span></a>
    </header>
    <main id="main">
      <section class="hero" aria-labelledby="hero-title">
        <div class="hero-copy page-width"><p class="eyebrow"><span class="live-dot"></span> SUDAN / INTERACTIVE IMPACT ATLAS / 2026</p>
          <h1 id="hero-title">Water for lives<br><span>and livelihoods</span></h1>
          <p class="hero-subtitle">Solar irrigation, finance and markets<br>for agricultural recovery in Sudan</p>
          <p class="hero-description">Follow the people, places and partnerships connecting solar irrigation, finance and markets to agricultural recovery in Sudan.</p>
          <div class="hero-actions"><a class="button primary" href="#atlas">Explore the atlas ${icons.arrow}</a><a class="quiet-link" href="#stories">Field impact stories <span aria-hidden="true">↘</span></a></div>
          <div class="hero-footnote"><span class="small-map-icon"><img src="icons/agriculture.svg" alt="" width="26" height="30"></span><span>Solar irrigation<br><strong>Across five states</strong></span><span class="hero-footnote-rule"></span><span>An impact story<br>from UNDP Sudan</span></div>
        </div>
        <div class="hero-visual">
          <img class="hero-photo" src="images/image58-960.webp" srcset="images/image58-600.webp 600w, images/image58-960.webp 960w, images/image58.webp 1440w" sizes="(max-width: 960px) 1440px, 100vw" alt="${photoAlt('image58')}" fetchpriority="high" width="1440" height="959">
        </div>
        <span class="hero-photo-credit">© UNDP Sudan / White Nile</span>
        <svg class="shape-divider hero-divider" viewBox="0 70 511 98" preserveAspectRatio="none" aria-hidden="true">${dividerPaths}</svg>
      </section>
      <section id="atlas" class="atlas-section page-width" aria-labelledby="atlas-title">
        <div class="section-heading"><div><p class="eyebrow">01 / AGRICULTURAL RECOVERY IN SUDAN</p><h2 id="atlas-title">Solar irrigation, finance and markets</h2><p>Explore the locations and field stories documented in the report.</p></div><div class="section-aside"><span class="live-dot"></span> Five focus states <span class="divider">/</span> Field impact stories</div></div>
        <div class="atlas-shell">
          <div class="atlas-toolbar"><div class="atlas-toolbar-title">${icons.layers}<strong>Intervention footprint</strong><span class="pill">SUDAN</span></div><div class="atlas-actions"><button class="text-button" id="download-map">Download map PNG ${icons.download}</button><button class="text-button" id="download-data">Download data JSON ${icons.download}</button></div><button id="reset-filters" class="text-button">Reset exploration <span aria-hidden="true">↻</span></button></div>
          <div class="atlas-layout">
            <aside class="map-sidebar" aria-label="Atlas filters">
              <label class="search-control">${icons.search}<input id="map-search" type="search" placeholder="Find a place or story" aria-label="Search places and stories"></label>
              <label class="control-label" for="state-select">EXPLORE A STATE</label><select id="state-select"><option value="all">All Sudan</option><option value="" disabled hidden>Select a story state</option>${storyStates.map(name => `<option>${esc(name)}</option>`).join('')}</select>
              <div class="filter-heading"><span class="control-label">INTERVENTION LAYERS</span><button id="toggle-layers" class="text-button">Clear all</button></div>
              <div class="layer-list">${layers.map(layer => `<label class="layer-option"><input type="checkbox" name="map-layer" value="${layer.id}" checked><img class="layer-icon" src="icons/ocha/${layer.icon}" alt="" width="18" height="18"><span>${layer.label}</span></label>`).join('')}</div>
              <div class="sidebar-bottom"><label class="locality-toggle"><input type="checkbox" id="show-localities"> Show locality boundaries</label><p>March 2020 administrative data.<br>Story locations are approximate.</p><button id="map-methodology" class="text-button">About this map ${icons.arrow}</button></div>
            </aside>
            <div class="map-main">
              <div class="map-overline"><span class="map-view-label">SUDAN <span>/</span> NATIONAL VIEW</span><label class="theme-label"><span class="sr-only">Thematic map layer</span><select id="map-theme"><option value="footprint">Story footprint</option><option value="women">Stories with women counts</option></select></label></div>
              <div id="map-canvas" class="map-canvas"></div>
              <div class="map-controls" aria-label="Map controls"><button id="zoom-in" aria-label="Zoom in">+</button><button id="zoom-out" aria-label="Zoom out">−</button><button id="zoom-reset" aria-label="Reset to national view">⌂</button></div>
              <div class="map-legend"><span id="map-legend-text">OCHA icons = interventions; badges = story counts</span><span class="legend-separator">|</span><span>Not total programme coverage</span></div>
              <div class="map-status" id="map-status" role="status"></div>
            </div>
            <aside class="place-panel" id="place-panel" aria-label="Selected geography and stories"></aside>
          </div>
          <div class="atlas-bottom"><span id="map-results" role="status"></span><span>Drag to pan · Scroll to zoom · Select a state to explore</span></div>
        </div>
        <p class="boundary-note">Illustrative story atlas, not an operational site inventory. State circles count documented story records; approximate project references appear on state selection. Boundaries do not imply official endorsement.</p>
      </section>
      <section id="stories" class="field-stories" aria-labelledby="field-stories-title">
        <div class="section-heading page-width"><div><p class="eyebrow">02 / SUDAN / 2025–2026</p><h2 id="field-stories-title" tabindex="-1">Field impact stories</h2><p>Ten field accounts from the report: what was delivered, what farmers reported, and which results are still expected.</p></div><a class="quiet-link" href="#atlas">Find these stories on the map ${icons.arrow}</a></div>
        <div class="story-slider"></div>
      </section>
      <section id="evidence" class="evidence-section page-width" aria-labelledby="evidence-title">
        <div class="section-heading"><div><p class="eyebrow">03 / RESULTS</p><h2 id="evidence-title">What it adds up to</h2></div><p class="heading-description">Farmer loans, jobs, markets and partners, with the report's priorities for scaling up.</p></div>
        <div class="evidence-shell"><div class="evidence-tabs" role="tablist" aria-label="Results and priorities">${tabs.map((tab, i) => `<button id="tab-${tab.id}" role="tab" aria-selected="${i === 0}" aria-controls="evidence-content" tabindex="${i === 0 ? 0 : -1}" data-tab="${tab.id}"><span class="tab-copy"><strong>${tab.name}</strong></span></button>`).join('')}</div><div id="evidence-content" class="evidence-content" role="tabpanel" aria-labelledby="tab-finance"><p role="status">Results load as you reach this section.</p></div></div>
      </section>
      <section class="closing-section"><div class="page-width closing-inner"><div><p class="eyebrow">SCALING UP</p><h2>An invitation to partners</h2><p>From hundreds of farms to the ambition of two million smallholders.<br>Help connect water, energy, finance and markets.</p><a class="button light" href="https://www.undp.org/sudan" target="_blank" rel="noopener noreferrer">Connect with UNDP Sudan ${icons.arrow}</a></div><div class="closing-mark" aria-hidden="true"><span>WATER</span><i>+</i><span>INPUTS</span><i>+</i><span>FINANCE</span><i>+</i><span>MARKETS</span><hr><strong>LIVELIHOOD<br>RECOVERY</strong></div></div></section>
      <section class="sources-section page-width"><div><p class="eyebrow">REFERENCES</p><h3>The analytics behind this story</h3><p>Based on <em>Water for Lives and Livelihoods: Solar Irrigation, Finance and Markets for Agricultural Recovery in Sudan</em>, UNDP Sudan, 2026. Data reflect the supplied publication, including its November 2026 loan-book snapshot.</p><button class="text-button" id="sources-button">Sources, definitions & limitations ${icons.arrow}</button></div><div class="evidence-key"><span><i class="key-dot reported"></i><strong>Reported</strong> Documented in the publication</span><span><i class="key-dot projected"></i><strong>Projected</strong> Expected, not yet measured</span><span><i class="key-dot ambition"></i><strong>Ambition / scenario</strong> Conditional future potential</span></div></section>
    </main>
    <footer class="site-footer page-width"><a class="brand footer-brand" href="https://www.undp.org/sudan"><img src="images/image2.webp" alt="UNDP" width="27" height="55"><span>Water for Lives<br><strong>and Livelihoods</strong></span></a><p>An interactive companion to the UNDP Sudan publication.<br>All photographs © UNDP Sudan. OCHA humanitarian icons.</p><div><a href="publication.docx" download>Download the publication ${icons.download}</a><button class="text-button" id="all-data">Download evidence dataset ${icons.download}</button><span>2026 / SUDAN</span></div></footer>
    <dialog id="detail-dialog" aria-labelledby="dialog-title"><button class="dialog-close" aria-label="Close dialog">×</button><div id="dialog-body"></div></dialog>
    <div id="toast" class="toast" role="status" hidden></div>`;

  document.querySelector('.closing-section').insertAdjacentHTML('beforeend', `
    <svg class="shape-divider" viewBox="0 70 511 98" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="divider-gradient" x1="0" x2="0" y1="70" y2="120" gradientUnits="userSpaceOnUse"><stop stop-color="#006eb5" /><stop offset="1" stop-color="#8cc6df" /></linearGradient></defs>
      <rect x="0" y="70" width="511" height="98" fill="url(#divider-gradient)" />
      ${dividerPaths}
    </svg>`);
  initLandingMotion(app);
  const map = createMap(document.querySelector('#map-canvas'), geo, {
    region,
    onState: selectState,
    onProject: openProject,
    onError: message => { document.querySelector('#map-status').textContent = message; },
  });
  const dialog = document.querySelector('#detail-dialog');
  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => dialogTrigger?.focus());

  function showDialog(html) {
    dialogTrigger = document.activeElement;
    document.querySelector('#dialog-body').innerHTML = html;
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
  }

  function currentProjects() {
    return filterProjects(projects, { state, search, enabledLayers });
  }

  function selectState(name) {
    state = name;
    document.querySelector('#state-select').value = name === 'all' || storyStates.includes(name) ? name : '';
    updateAtlas();
  }

  function updateAtlas() {
    const visible = currentProjects();
    map.update(visible, state, theme, enabledLayers);
    const stateName = state === 'all' ? 'Sudan' : state;
    document.querySelector('#map-results').textContent = `${visible.length} documented ${visible.length === 1 ? 'story' : 'stories'} / ${stateName}`;
    document.querySelector('.map-view-label').textContent = state === 'all' ? 'SUDAN / NATIONAL VIEW' : `${state.toUpperCase()} / STATE VIEW`;
    document.querySelector('#toggle-layers').textContent = enabledLayers.length ? 'Clear all' : 'Select all';
    const place = states.priority.find(s => s.name === state);
    const panel = document.querySelector('#place-panel');
    const nextPanelKey = JSON.stringify([state, visible.map(project => project.id)]);
    if (nextPanelKey === panelKey) return;
    const revealPanel = panelKey !== undefined;
    panelKey = nextPanelKey;
    placePanelAnimation?.cancel();
    if (state === 'all') {
      panel.innerHTML = `<div class="panel-photo"><img src="images/image23.webp" alt="${photoAlt('image23')}" loading="lazy" width="600" height="400"><span>${icons.pin} FIELD STORIES / SUDAN</span></div><div class="place-panel-content"><p class="eyebrow">FIELD IMPACT STORIES</p><h3>Water, finance and markets across five states</h3><p>Select a state to read the field stories and results documented in the report.</p><div class="state-quick-list">${states.priority.map(s => `<button data-state="${s.name}"><span>${s.label}</span>${icons.arrow}</button>`).join('')}</div><p class="panel-small">Select a state on the map or above to explore the stories.</p></div>`;
    } else {
      panel.innerHTML = `${place ? `<div class="panel-photo"><img src="images/${place.photo}.webp" alt="${photoAlt(place.photo)}" loading="lazy" width="600" height="400"><span>${icons.pin} ${esc(state.toUpperCase())}</span></div>` : ''}<div class="place-panel-content"><button id="back-national" class="text-button">← All Sudan</button><p class="eyebrow">${esc(state.toUpperCase())} / FIELD NOTES</p><h3>${esc(place?.focus || state)}</h3><p>${esc(place?.summary || 'The publication does not provide a featured case study for this geography. This does not imply the absence of programmes or needs.')}</p>${place ? `<div class="place-metric"><strong>${place.metric}</strong><span>${place.metricLabel}</span></div>` : ''}<div class="project-list">${visible.map(project => `<button data-project="${project.id}"><span>${esc(project.name)}</span>${icons.arrow}</button>`).join('')}</div><p class="panel-small">${visible.length ? 'Points are approximate reference locations. Open a story for evidence and location precision.' : 'No stories match the current search and layers. Reset exploration to show all documented stories.'}</p>${!visible.length ? '<button class="button small" id="panel-reset">Reset exploration</button>' : ''}</div>`;
    }
    if (state === 'all' && visible.length === 0) {
      panel.querySelector('.place-panel-content').insertAdjacentHTML('afterbegin', '<p class="empty-message" role="status">No stories match these filters. Try another search, select a layer or reset exploration.</p>');
    }
    panel.querySelectorAll('[data-state]').forEach(button => button.addEventListener('click', () => selectState(button.dataset.state)));
    panel.querySelectorAll('[data-project]').forEach(button => button.addEventListener('click', () => openProject(button.dataset.project)));
    panel.querySelector('#back-national')?.addEventListener('click', () => selectState('all'));
    panel.querySelector('#panel-reset')?.addEventListener('click', reset);
    panel.scrollTop = 0;
    if (revealPanel && !panelMotion.matches && !document.hidden) {
      placePanelAnimation = panel.animate([
        { opacity: 0, transform: 'translateY(-6px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ], { duration: 250, easing: 'cubic-bezier(.333333, 1, .666667, 1)' });
    }
  }

  function reset() {
    state = 'all';
    search = '';
    enabledLayers = layers.map(layer => layer.id);
    theme = 'footprint';
    document.querySelector('#map-search').value = '';
    document.querySelector('#state-select').value = 'all';
    document.querySelector('#map-theme').value = theme;
    document.querySelectorAll('[name="map-layer"]').forEach(input => { input.checked = true; });
    document.querySelector('#show-localities').checked = false;
    map.showLocalities(false);
    document.querySelector('#map-status').textContent = '';
    document.querySelector('#map-legend-text').textContent = 'OCHA icons = interventions; badges = story counts';
    map.reset();
    updateAtlas();
  }

  function projectPartnerNames(project) {
    return project.partner.map(partner => evidenceData?.partners.nodes.find(n => n.id === partner)?.name || ({
      eaa: 'Education Above All', silatech: 'Silatech', sdc: 'SDC', kuwait: 'Kuwait Fund', ibdaa: 'Al-Ibdaa Bank', undp: 'UNDP',
    })[partner]).join(' · ');
  }

  function openProject(id) {
    const project = projects.find(p => p.id === id);
    showDialog(`<img class="dialog-image" src="images/${project.mediaReferences[0]}.webp" alt="${photoAlt(project.mediaReferences[0])}" width="1000" height="670"><div class="dialog-content"><p class="eyebrow">${esc(project.state.toUpperCase())} / ${esc(project.locality)}</p><h2 id="dialog-title">${esc(project.name)}</h2>${projectEvidence(project, projectPartnerNames(project))}<p class="source-note">Photo: ${esc(photoById.get(project.mediaReferences[0])?.caption || 'Publication photograph')}. © UNDP Sudan.</p><button class="button primary" id="show-project-map">Explore ${esc(project.state)} ${icons.arrow}</button></div>`);
    document.querySelector('#show-project-map').addEventListener('click', () => {
      dialog.close();
      reset();
      selectState(project.state);
      document.querySelector('#atlas').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    });
  }

  function showSources() {
    showDialog(`<div class="dialog-content sources-dialog"><p class="eyebrow">EVIDENCE & METHODOLOGY</p><h2 id="dialog-title">Sources, definitions and limitations</h2><p>This is a companion to the supplied UNDP Sudan publication, not an independently verified evaluation or a live monitoring system.</p><h3>Report and reference period</h3><p><em>Water for Lives and Livelihoods: Solar Irrigation, Finance and Markets for Agricultural Recovery in Sudan</em>, 2026. Field accounts cover 2025–2026. Finance figures reflect the publication's November 2026 snapshot.</p><h3>Geography</h3><p>${esc(states.source)} ${esc(states.boundaryNote)}</p><p>Project coordinates were not supplied in the report. All project points are approximate locality or state references curated for navigation. They do not locate farms, borrowers or assets precisely. The state layer excludes schematic river overlays and zero-area polygon artifacts; valid boundaries and interior holes are preserved.</p><p>Circle area is proportional to the number of matching story records in a state. The map shows ${projects.length} curated records, not all 395+ interventions. The women theme shades states by the number of matching stories with published women counts, not by a beneficiary rate. Pink does not imply greater total reach.</p><p>The supplied water-project CSV covers a different inventory and has not been merged with agricultural case studies without a verified crosswalk.</p><h3>People and overlapping figures</h3><p>Farmers, members, workers, households, borrowers and market stalls are different units. Project and programme populations overlap and must not be summed. A missing count means not reported, never zero. One feddan is about 0.42 hectares.</p><h3>Finance</h3><p>122 loans, including 67 crops/inputs and 55 livestock/poultry loans. 55 borrowers are women. The report publishes state by activity and state by gender, but not gender by activity or individual loan records. Only supported filters are enabled.</p><p><strong>100% repayment</strong> means all 255 instalments due by mid-November were paid on time, with 111 loans in repayment. It does not mean every loan's full principal has been repaid.</p><h3>Projections and ambitions</h3><p>351 jobs, 835 MT of sorghum and SDG 6.68 billion in production value are expected figures, not measured outcomes. Two million farmers is a financing ambition. The 4.7 million poverty-reduction figure is a conditional scenario for 2043.</p><h3>Data not provided</h3><p>There is no surveyed project inventory, beneficiary microdata, partner contribution ledger or loan-level dataset. Capital costs are not reported for each irrigation system, so no return-on-investment or payback calculation is presented. Conceptual networks do not encode financial or trade volumes.</p><h3>Publication references</h3><ul><li>UNDP–Al-Ibdaa Bank loan database, November 2026, as summarized in the publication.</li><li>UNDP Sudan field impact stories, 2025–2026.</li><li>UNDP and ITC, SAMRA, August 2026.</li><li>UNDP Private Sector Engagement Strategy 2026–2028.</li><li>UNDP Solar Energy Value Chain Study, March 2026.</li><li>UNDP and ISS, Beyond the Conflict, 2026.</li></ul><h3>Photography and identity</h3><p>${esc(photos.credit)} Photograph captions distinguish illustrative images from documented site photographs. OCHA icons come from the supplied assets.</p><a class="button primary" href="publication.docx" download>Download the source publication ${icons.download}</a></div>`);
  }

  function downloadJSON(value, name) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Your evidence download is ready.');
  }

  let toastTimer;
  function notify(message) {
    const toast = document.querySelector('#toast');
    toast.textContent = message; toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 4000);
  }

  async function loadEvidence() {
    const content = document.querySelector('#evidence-content');
    content.setAttribute('aria-busy', 'true');
    try {
      evidenceLoading ??= Promise.all([
        import('./charts.js'),
        ...['finance.json', 'markets.json', 'partners.json', 'beneficiaries.json', 'sites.json'].map(fetchJSON),
      ]);
      const [charts, finance, markets, partners, beneficiaries, sites] = await evidenceLoading;
      chartModule = charts;
      evidenceData = { finance, markets, partners, beneficiaries, sites };
      charts.renderEvidence(activeTab, content, evidenceData);
    } catch (error) {
      evidenceLoading = undefined;
      content.innerHTML = `<div class="inline-error" role="alert"><h3>Evidence could not be loaded.</h3><p>${esc(error.message)}</p><button id="retry-evidence" class="button">Try again</button></div>`;
      content.querySelector('#retry-evidence').addEventListener('click', loadEvidence);
      console.error(error);
    } finally {
      content.setAttribute('aria-busy', 'false');
    }
  }

  document.querySelector('#state-select').addEventListener('change', event => selectState(event.target.value));
  document.querySelector('#map-search').addEventListener('input', event => { search = event.target.value; updateAtlas(); });
  document.querySelectorAll('[name="map-layer"]').forEach(input => input.addEventListener('change', () => {
    enabledLayers = [...document.querySelectorAll('[name="map-layer"]:checked')].map(checkbox => checkbox.value); updateAtlas();
  }));
  document.querySelector('#toggle-layers').addEventListener('click', () => {
    enabledLayers = enabledLayers.length ? [] : layers.map(layer => layer.id);
    document.querySelectorAll('[name="map-layer"]').forEach(input => { input.checked = enabledLayers.includes(input.value); }); updateAtlas();
  });
  document.querySelector('#map-theme').addEventListener('change', event => {
    theme = event.target.value;
    document.querySelector('#map-legend-text').textContent = theme === 'women' ? 'Pink shade = stories with women counts' : 'OCHA icons = interventions; badges = story counts';
    updateAtlas();
  });
  document.querySelector('#show-localities').addEventListener('change', async event => {
    const input = event.target;
    document.querySelector('#map-status').textContent = '';
    input.disabled = true;
    const success = await map.showLocalities(input.checked);
    if (!success) input.checked = false;
    input.disabled = false;
  });
  document.querySelector('#zoom-in').addEventListener('click', map.zoomIn);
  document.querySelector('#zoom-out').addEventListener('click', map.zoomOut);
  document.querySelector('#zoom-reset').addEventListener('click', map.reset);
  document.querySelector('#reset-filters').addEventListener('click', reset);
  document.querySelector('#map-methodology').addEventListener('click', showSources);
  document.querySelector('#sources-button').addEventListener('click', showSources);
  document.querySelector('#download-map').addEventListener('click', async event => {
    const button = event.currentTarget;
    const label = button.innerHTML;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'Preparing PNG...';
    try {
      await downloadMapPNG(document.querySelector('#map-canvas > svg'), {
        state, theme, search, enabledLayers: [...enabledLayers], projects: currentProjects(),
        geo, region, storyStates, localities: map.getLocalities(),
      });
    } catch (error) {
      console.error(error);
      notify(`The map image could not be downloaded. ${error.message}`);
    } finally {
      button.innerHTML = label;
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  });
  document.querySelector('#download-data').addEventListener('click', () => downloadJSON({
    source: 'UNDP Sudan, Water for Lives and Livelihoods, 2026',
    filters: { state, stage: 'all', search, enabledLayers },
    caveat: 'Approximate location references only. Mixed beneficiary units; overlapping populations must not be summed. This is a story selection, not the full programme inventory.',
    projects: currentProjects(),
  }, 'sudan-atlas-selection.json'));
  document.querySelector('#all-data').addEventListener('click', async () => {
    if (!evidenceData) await loadEvidence();
    if (evidenceData) downloadJSON({ ...datasets, ...evidenceData }, 'sudan-atlas-evidence.json');
    else notify('The evidence download failed. Use the retry button in the evidence section.');
  });
  const tabButtons = [...document.querySelectorAll('[role="tab"]')];
  const tabList = document.querySelector('.evidence-tabs');
  const tabContent = document.querySelector('#evidence-content');
  const tabPanels = document.createElement('div');
  tabPanels.className = 'evidence-panels';
  tabContent.before(tabPanels);
  tabPanels.append(tabContent);
  const tabUnderline = document.createElement('span');
  tabUnderline.className = 'tab-underline';
  tabUnderline.setAttribute('aria-hidden', 'true');
  tabList.append(tabUnderline);
  const tabMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const outgoingPanels = new Set();
  let underlinePosition = 0;
  let labelTimer;
  let panelAnimation;

  function positionUnderline() {
    const bounds = tabList.getBoundingClientRect();
    const positions = tabButtons.map(button => {
      const box = button.getBoundingClientRect();
      return { x: box.left - bounds.left + tabList.scrollLeft, y: box.bottom - bounds.top + tabList.scrollTop - 4, width: box.width };
    });
    const from = Math.floor(underlinePosition);
    const to = Math.min(positions.length - 1, from + 1);
    const fraction = underlinePosition - from;
    const interpolate = key => positions[from][key] + (positions[to][key] - positions[from][key]) * fraction;
    tabUnderline.style.transform = `translate(${interpolate('x')}px, ${interpolate('y')}px)`;
    tabUnderline.style.width = `${interpolate('width')}px`;
  }

  function updateTabLabel(button) {
    tabButtons.forEach(tab => tab.setAttribute('aria-selected', String(tab === button)));
    tabContent.setAttribute('aria-labelledby', button.id);
    positionUnderline();
  }

  function finishTabPanels() {
    panelAnimation?.cancel();
    tabContent.inert = false;
    tabPanels.style.minHeight = '';
    outgoingPanels.forEach(panel => {
      panel.getAnimations().forEach(animation => animation.cancel());
      panel.remove();
    });
    outgoingPanels.clear();
  }

  new ResizeObserver(positionUnderline).observe(tabList);
  positionUnderline();
  tabMotion.addEventListener('change', () => {
    if (!tabMotion.matches) return;
    clearTimeout(labelTimer);
    select(tabUnderline).interrupt();
    underlinePosition = tabButtons.findIndex(button => button.dataset.tab === activeTab);
    updateTabLabel(tabButtons[underlinePosition]);
    finishTabPanels();
  });
  tabButtons.forEach((button, index) => {
    button.addEventListener('click', () => {
      if (activeTab === button.dataset.tab) return;
      clearTimeout(labelTimer);
      select(tabUnderline).interrupt();
      const animate = !tabMotion.matches && chartModule && evidenceData;
      let snapshot;
      if (animate) {
        snapshot = tabContent.cloneNode(true);
        const appearance = getComputedStyle(tabContent);
        snapshot.style.opacity = appearance.opacity;
        snapshot.style.transform = appearance.transform;
        snapshot.removeAttribute('id');
        snapshot.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
        snapshot.removeAttribute('role');
        snapshot.removeAttribute('aria-labelledby');
        snapshot.setAttribute('aria-hidden', 'true');
        snapshot.inert = true;
        snapshot.classList.add('tab-panel-outgoing');
        tabPanels.style.minHeight = `${tabPanels.getBoundingClientRect().height}px`;
      }
      panelAnimation?.cancel();
      activeTab = button.dataset.tab;
      tabButtons.forEach(tab => { tab.tabIndex = tab === button ? 0 : -1; });
      if (tabMotion.matches) {
        underlinePosition = index;
      } else {
        select(tabUnderline).transition().duration(250).ease(easeCubicInOut).tween('position', () => {
          const start = underlinePosition;
          return progress => {
            underlinePosition = start + (index - start) * progress;
            positionUnderline();
          };
        });
      }
      if (chartModule && evidenceData) chartModule.renderEvidence(activeTab, tabContent, evidenceData);
      else loadEvidence();
      if (!animate) {
        updateTabLabel(button);
        finishTabPanels();
        return;
      }
      tabPanels.append(snapshot);
      outgoingPanels.add(snapshot);
      const outgoingAnimation = snapshot.animate([{ opacity: snapshot.style.opacity }, { opacity: 0 }], {
        duration: 200, easing: 'linear', fill: 'forwards',
      });
      outgoingAnimation.onfinish = () => { snapshot.remove(); outgoingPanels.delete(snapshot); };
      tabContent.inert = true;
      panelAnimation = tabContent.animate([
        { opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' },
      ], { duration: 200, delay: 100, easing: 'linear', fill: 'backwards' });
      panelAnimation.onfinish = finishTabPanels;
      labelTimer = setTimeout(() => updateTabLabel(button), 100);
    });
    button.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabButtons.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + tabButtons.length) % tabButtons.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabButtons.length - 1;
      if (next !== undefined) { event.preventDefault(); tabButtons[next].focus(); tabButtons[next].click(); }
    });
  });

  const evidenceObserver = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) { loadEvidence(); evidenceObserver.disconnect(); }
  }, { rootMargin: '350px' });
  evidenceObserver.observe(document.querySelector('#evidence'));

  updateAtlas();
  enhanceDropdowns(app);
  createFieldStories(app, projects, cases, photoById, projectPartnerNames, project => {
    reset();
    selectState(project.state);
  });
}
