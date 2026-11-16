import * as d3 from 'd3';
import { escapeHTML, loanRows } from './model.js';
import { enhanceDropdowns } from './dropdowns.js';

function renderFinance(container, data) {
  const repayment = Math.round(data.instalmentsPaidOnTime / data.instalmentsDue * 100);
  container.innerHTML = `
    <div class="finance-grid"><div class="finance-overview">
    <p class="eyebrow">REPORTED / NOVEMBER 2026</p><h3>What the loan book shows</h3>
    <p class="chart-intro">Through the Credit Guarantee Scheme, Al-Ibdaa Bank provided farmer loans in Kassala, Gedaref and Northern State.</p>
    <dl class="result-summary">
      <div><dt>Farmer loans</dt><dd>${data.loans}</dd></div>
      <div><dt>Total lent</dt><dd><small>SDG</small> ${(data.amountSDG / 1e6).toLocaleString('en')}<small> million</small></dd></div>
      <div><dt>Due instalments paid on time</dt><dd>${repayment}%</dd></div>
    </dl>
    <p class="result-explanation"><strong>What does ${repayment}% repayment mean?</strong> All ${data.instalmentsDue} instalments due were paid on time. ${data.loansInRepayment} loans had entered repayment. It does not mean all ${data.loans} loans were fully repaid.</p>
    </div><div class="loan-explorer">
      <div class="explorer-heading"><h4>The farmer loan book at a glance</h4><span class="pill">November 2026</span></div>
      <div class="loan-controls">
        <label>State<select id="loan-state"><option value="all">All three states</option>${data.byState.map(s => `<option>${escapeHTML(s.state)}</option>`).join('')}</select></label>
        <label>Show<select id="loan-breakdown" aria-describedby="loan-limit"><option value="all">All farmer loans</option><option value="crops">Crops & inputs</option><option value="livestock">Livestock & poultry</option><option value="women">Women borrowers</option><option value="men">Men borrowers</option></select></label>
      </div>
      <p class="source-note" id="loan-limit">Choose one breakdown at a time. The report does not publish loan activity by gender.</p>
      <p class="loan-result" role="status"><strong id="loan-total">${data.loans}</strong><span id="loan-selection"></span></p>
      <table class="data-table loan-bars"><caption>Number of farmer loans by state. Bars use the same scale for every selection.</caption><thead><tr><th scope="col">State</th><th scope="col">Loans</th></tr></thead><tbody id="loan-table"></tbody></table>
    </div></div>
    <details class="evidence-method"><summary>How the Credit Guarantee Scheme works</summary>
      <ol><li>A guarantee shares the bank's lending risk.</li><li>Al-Ibdaa Bank lends to farmers for inputs, labour and production.</li><li>Farmers repay the instalments due on their loans.</li></ol>
      <p>This describes the financing mechanism, not measured money flows between partners.</p>
    </details>
    <p class="source-note">Source: publication, Stop 4, Table 2 and Figure 3. Published aggregates; no borrower-level records supplied. The headline figures describe the full loan book; the filters change only the table below them.</p>`;
  const state = container.querySelector('#loan-state');
  const breakdown = container.querySelector('#loan-breakdown');
  const maximum = d3.max(data.byState, row => row.total);
  function update() {
    const rows = loanRows(data, {
      state: state.value,
      activity: ['crops', 'livestock'].includes(breakdown.value) ? breakdown.value : 'all',
      gender: ['women', 'men'].includes(breakdown.value) ? breakdown.value : 'all',
    });
    container.querySelector('#loan-total').textContent = d3.sum(rows, row => row.count);
    container.querySelector('#loan-selection').textContent =
      `loans in this selection: ${breakdown.selectedOptions[0].textContent.toLowerCase()} / ${state.selectedOptions[0].textContent}`;
    container.querySelector('#loan-table').innerHTML = rows.map(row =>
      `<tr><th scope="row">${escapeHTML(row.state)}</th><td><span class="loan-bar" aria-hidden="true"><i style="width:${row.count / maximum * 100}%"></i></span><strong>${row.count}</strong></td></tr>`).join('');
  }
  [state, breakdown].forEach(select => select.addEventListener('change', update));
  enhanceDropdowns(container);
  update();
}

function renderJobs(container, finance) {
  const additional = finance.jobsProjected - finance.jobsCurrent;
  container.innerHTML = `
    <p class="eyebrow">REPORTED AND PROJECTED / FINANCED FARMS</p><h3>Jobs and employment</h3>
    <p class="chart-intro">The loan book records ${finance.jobsCurrent} jobs on financed farms. Borrowers expect a total of ${finance.jobsProjected} within six months of loan disbursement.</p>
    <dl id="jobs-chart" class="employment-bars">
      <div><dt>Reported at loan disbursement</dt><dd><span class="employment-track" aria-hidden="true"><i style="width:${finance.jobsCurrent / finance.jobsProjected * 100}%"></i></span><strong>${finance.jobsCurrent}</strong><span>jobs</span></dd></div>
      <div class="projected-employment"><dt>Expected total within six months</dt><dd><span class="employment-track" aria-hidden="true"><i style="width:100%"></i></span><strong>${finance.jobsProjected}</strong><span>jobs</span></dd></div>
    </dl>
    <p class="result-explanation"><strong>${additional} additional jobs expected.</strong> The ${finance.jobsProjected} total includes the ${finance.jobsCurrent} already reported. It is a projection, not a measured employment outcome.</p>
    <p class="source-note">Source: farmer loan book, November 2026. Separate from 250 Kalahoot cash-for-work participants. These populations must not be added as unique beneficiaries.</p>`;
}

function renderMarkets(container, markets) {
  container.innerHTML = `<p class="eyebrow">MARKETS: FROM HARVEST TO INCOME</p><h3>From farm gate to buyer</h3>
    <p class="chart-intro">Farmers need somewhere to store their harvest and a way to reach buyers. These are the links described in the report, not measured trade routes.</p>
    <ol id="market-chart" class="evidence-steps">${markets.steps.map(step =>
      `<li><h4>${escapeHTML(step.name)}</h4><p>${escapeHTML(step.detail)}</p></li>`).join('')}</ol>
    <p class="source-note">${escapeHTML(markets.note)} Source: publication, Stop 5, Figure 6.</p>`;
}

function renderPartners(container, partners) {
  container.innerHTML = `<p class="eyebrow">UNDP SUDAN / PARTNERS</p><h3>With the support of</h3>
    <p class="chart-intro">These organisations support implementation, irrigation, finance and market access. The roles below are described in the report; no financial contribution amounts are shown.</p>
    <dl id="partner-roles" class="partner-roles">${partners.nodes.map(node =>
      `<div><dt>${node.logo ? `<img class="partner-logo" src="images/${escapeHTML(node.logo)}.webp" alt="" width="200" height="72">` : ''}<span>${escapeHTML(node.name)}</span></dt><dd>${escapeHTML(node.role)}</dd></div>`).join('')}</dl>
    <p class="source-note">Source: publication, Stops 2, 4 and 5. Roles are not a ranking of contributions. The Alliance's sesame deal remains proposed.</p>`;
}

function renderPathways(container) {
  const pathways = [
    { title: 'Agri-market and value chain analysis', text: 'Identify priority crops, market demand and the barriers facing smallholders.', evidence: "SAMRA's seven priority value chains inform where support goes." },
    { title: 'Improve access to water and inputs', text: 'Provide reliable irrigation, seeds, tools and extension support. Risk protection such as Takaful is a proposed next step.', evidence: '395+ solar irrigation interventions; seed and tools delivered to 15,000 farmers.' },
    { title: 'Access to finance', text: 'Match guarantees, solidarity groups and savings groups to what farmers need. Equipment collateral and leasing are part of the developing framework.', evidence: '122 farmer loans; 100% of instalments due paid on time.' },
    { title: 'Market expansion', text: 'Improve aggregation, storage and links to buyers. Forward purchase agreements can make future demand more predictable.', evidence: 'Intermediary market facilities and a women-led River Nile market with 120 stalls.' },
    { title: 'Trade facilitation', text: 'Support access to domestic and international buyers, quality assurance and simpler trade processes.', evidence: 'The Recovery Alliance sesame deal is proposed; it is not a completed export outcome.' },
  ];
  container.innerHTML = `<p class="eyebrow">THE ROAD AHEAD / STRATEGY</p><h3>Five pathways to scale</h3>
    <p class="chart-intro">These are the report's priorities for expanding support, not five additional results. Each pathway shows the proposed action and the evidence or status described in the report.</p>
    <ol id="pathways-chart" class="evidence-steps">${pathways.map(pathway =>
      `<li><h4>${escapeHTML(pathway.title)}</h4><p>${escapeHTML(pathway.text)}</p><p class="pathway-evidence"><strong>In this story:</strong> ${escapeHTML(pathway.evidence)}</p></li>`).join('')}</ol>
    <div class="future-figures">
      <div><span class="pill">Ambition</span><strong>2 million farmers</strong><p>The ambition of the financing framework, not achieved coverage.</p></div>
      <div><span class="pill">Conditional scenario / 2043</span><strong>4.7 million people</strong><p>Agriculture could lift this many people out of poverty with peace, investment and reforms. A modelled scenario, not an observed result.</p></div>
    </div>
    <p class="source-note">Source: publication, The road ahead; Private Sector Engagement Strategy and Beyond the Conflict analysis.</p>`;
}

export function renderEvidence(tab, container, data) {
  d3.select(container).selectAll('*').interrupt();
  if (tab === 'finance') renderFinance(container, data.finance);
  else if (tab === 'jobs') renderJobs(container, data.finance);
  else if (tab === 'markets') renderMarkets(container, data.markets);
  else if (tab === 'partners') renderPartners(container, data.partners);
  else if (tab === 'pathways') renderPathways(container);
}
