export const layers = [
  { id: 'solar', label: 'Solar irrigation', color: '#e5a336', icon: 'Submersible-pump_40676.svg' },
  { id: 'canals', label: 'Canal rehabilitation', color: '#3288ce', icon: 'Water-source_40584.svg' },
  { id: 'inputs', label: 'Agricultural inputs', color: '#02a38a', icon: 'Agriculture_40570.svg' },
  { id: 'finance', label: 'Agricultural finance', color: '#757af0', icon: 'Financing_40523.svg' },
  { id: 'women', label: 'Women & inclusion', color: '#e0529e', icon: 'Gender_40433.svg' },
  { id: 'jobs', label: 'Employment', color: '#59ba47', icon: 'Livelihood_40554.svg' },
  { id: 'markets', label: 'Markets & value chains', color: '#bf8b2e', icon: 'Trade-and-market_40669.svg' },
  { id: 'partners', label: 'Partner-supported stories', color: '#60d4f2', icon: 'Partnership_40563.svg' },
  { id: 'stories', label: 'Field stories', color: '#006eb5', icon: 'Reporting_40532.svg' },
];

export function projectLayer(project, enabledLayers) {
  const type = project.interventionType.find(id => enabledLayers.includes(id));
  return layers.find(layer => layer.id === type);
}

export function filterProjects(projects, { state = 'all', search = '', enabledLayers = layers.map(l => l.id), stage = 'all' } = {}) {
  const query = search.trim().toLocaleLowerCase();
  return projects.filter(project =>
    (state === 'all' || project.state === state) &&
    (stage === 'all' || stage === 'risk' || stage === 'recovery' || project.stages.includes(stage)) &&
    project.interventionType.some(type => enabledLayers.includes(type)) &&
    (!query || `${project.name} ${project.state} ${project.locality}`.toLocaleLowerCase().includes(query)));
}

export function loanRows(finance, { state = 'all', activity = 'all', gender = 'all' } = {}) {
  if (activity !== 'all' && gender !== 'all') {
    throw new Error('The publication does not supply gender by loan activity cross-tabulations.');
  }
  return finance.byState.filter(row => state === 'all' || row.state === state).map(row => ({
    state: row.state,
    count: gender === 'women' ? row.women : gender === 'men' ? row.total - row.women
      : activity === 'crops' ? row.crops : activity === 'livestock' ? row.livestock : row.total,
  }));
}

export function groupFootprint(projects) {
  return Array.from(new Set(projects.map(p => p.state))).map(state => ({
    state,
    count: projects.filter(p => p.state === state).length,
  }));
}

export async function fetchJSON(name) {
  const response = await fetch(`data/${name}`);
  if (!response.ok) throw new Error(`Could not load ${name} (HTTP ${response.status}).`);
  return response.json();
}

export function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}
