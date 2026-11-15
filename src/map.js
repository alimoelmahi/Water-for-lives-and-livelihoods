import * as d3 from 'd3';
import { fetchJSON, groupFootprint, layers, projectLayer } from './model.js';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const anchors = {
  Northern: [29.5, 19.5], 'River Nile': [33.7, 18.4], Gedaref: [35.3, 14.1],
  Kassala: [35.6, 15.9], 'White Nile': [32.5, 13.8],
};

export function stateReference(feature) {
  return anchors[feature.properties.name] || d3.geoCentroid(feature);
}

export function createMap(container, geo, { region, onState, onProject, onError }) {
  const width = 900;
  const height = 650;
  const svg = d3.select(container).append('svg').attr('viewBox', `0 0 ${width} ${height}`)
    .attr('aria-label', 'Interactive map of Sudan. Select a state or use the state selector for keyboard navigation.')
    .attr('role', 'group');
  svg.append('title').text('Sudan intervention footprint');
  const projection = d3.geoMercator().fitExtent([[95, 55], [780, 600]], geo);
  const path = d3.geoPath(projection);
  const statesByName = new Map(geo.features.map(feature => [feature.properties.name, feature]));
  const scene = svg.append('g').attr('class', 'map-geography');
  scene.append('g').attr('class', 'regional-countries').attr('aria-hidden', 'true')
    .selectAll('path').data(region.features).join('path')
    .attr('class', 'regional-country').attr('data-country', d => d.properties.name).attr('d', path);
  const graticule = d3.geoGraticule().step([2, 2]).extent([[20, 7], [40, 24]]);
  scene.append('path').datum(graticule()).attr('d', path).attr('class', 'graticule');
  const stateGroup = scene.append('g');
  const statePaths = stateGroup.selectAll('path').data(geo.features).join('path')
    .attr('d', path).attr('class', 'state-shape')
    .attr('data-state', d => d.properties.name)
    .on('click', (_, d) => onState(d.properties.name));
  statePaths.append('title').text(d => `${d.properties.name}: select to explore documented stories`);
  const localityGroup = scene.append('g').attr('class', 'locality-boundaries');

  const labels = scene.append('g').attr('class', 'state-labels');
  labels.selectAll('text').data(geo.features).join('text')
    .attr('transform', d => `translate(${projection(stateReference(d))})`)
    .text(d => d.properties.name.toUpperCase())
    .attr('class', d => anchors[d.properties.name] ? 'map-label priority-label' : 'map-label');
  const bubbles = scene.append('g').attr('class', 'footprint-bubbles');
  const points = scene.append('g').attr('class', 'project-points');
  const contextLabels = [
    ...region.features.map(feature => ({
      name: feature.properties.label || feature.properties.name.toUpperCase(), at: feature.properties.labelAt,
    })),
    { name: 'RED SEA', at: [38, 20], sea: true },
  ];
  const context = scene.append('g').attr('class', 'context-labels').selectAll('text').data(contextLabels).join('text')
    .attr('class', d => `map-label${d.sea ? ' sea-label' : ''}`)
    .attr('transform', d => `translate(${projection(d.at)})`).text(d => d.name);
  svg.append('text').attr('class', 'north-arrow').attr('x', 830).attr('y', 64).text('N');
  svg.append('path').attr('d', 'M830 76 L824 96 L830 91 L836 96 Z').attr('fill', '#55606e');
  const khartoum = scene.append('g').attr('transform', `translate(${projection([32.53, 15.6])})`).attr('class', 'capital');
  khartoum.append('circle').attr('r', 3);
  khartoum.append('text').attr('class', 'map-label').attr('x', -8).attr('y', 14).text('Khartoum');

  let camera = d3.zoomIdentity;
  const zoom = d3.zoom().scaleExtent([1, 7]).translateExtent([[-250, -200], [width + 250, height + 200]])
    .extent([[0, 0], [width, height]]).on('zoom', event => {
      camera = event.transform;
      renderCamera();
    });
  svg.call(zoom).on('dblclick.zoom', null);
  let localities;
  let localitiesRequest;
  let selected = 'all';
  let currentProjects = [];
  let currentTheme = 'footprint';
  let currentLayers = layers.map(layer => layer.id);
  let localityVisible = false;
  const markerLayer = project => projectLayer(project, currentLayers);

  function renderCamera() {
    const viewport = svg.node().getBoundingClientRect();
    const pixelScale = Math.min(viewport.width / width, viewport.height / height);
    if (!pixelScale) return;
    const inverseScale = 1 / (camera.k * pixelScale);
    const at = coordinates => `translate(${projection(coordinates)}) scale(${inverseScale})`;
    scene.attr('transform', camera);
    labels.selectAll('text').attr('transform', d => at(stateReference(d)));
    context.attr('transform', d => at(d.at));
    khartoum.attr('transform', at([32.53, 15.6]));
    points.selectAll('.project-pin').attr('transform', d => at([d.longitude, d.latitude]));
    bubbles.selectAll('.state-bubble')
      .attr('transform', d => at(stateReference(statesByName.get(d.state))));
    layoutLabels(viewport);
  }

  function layoutLabels(viewport) {
    const intersects = (a, b) => a.left < b.right + 3 && a.right + 3 > b.left &&
      a.top < b.bottom + 3 && a.bottom + 3 > b.top;
    const occupied = scene.selectAll('.bubble-halo, .bubble-core, .project-pin, .capital circle').nodes()
      .map(node => node.getBoundingClientRect());
    const bubbleStates = new Set(bubbles.selectAll('.state-bubble').data().map(d => d.state));
    const candidates = [
      ...bubbles.selectAll('.bubble-state').nodes().map(node => ({ node, priority: 90 })),
      ...labels.selectAll('text').nodes()
        .filter(node => !bubbleStates.has(node.__data__.properties.name))
        .map(node => ({ node, priority: node.__data__.properties.name === selected ? 100 : 50 })),
      { node: khartoum.select('text').node(), priority: 40 },
      ...context.nodes().map(node => ({ node, priority: 10 })),
    ].sort((a, b) => b.priority - a.priority);
    scene.selectAll('.map-label').style('visibility', 'hidden');
    for (const { node } of candidates) {
      for (const offset of [0, -12, 12, -24, 24]) {
        d3.select(node).attr('dy', offset);
        const bounds = node.getBoundingClientRect();
        const inside = bounds.left >= viewport.left + 8 && bounds.right <= viewport.right - 8 &&
          bounds.top >= viewport.top + 48 && bounds.bottom <= viewport.bottom - 44;
        if (inside && !occupied.some(other => intersects(bounds, other))) {
          d3.select(node).style('visibility', 'visible');
          occupied.push(bounds);
          break;
        }
      }
    }
  }
  new ResizeObserver(renderCamera).observe(container);

  function applyLocalities() {
    localityGroup.selectAll('path').data(localityVisible && localities
      ? localities.features.filter(f => selected === 'all' || f.properties.state === selected) : [])
      .join('path').attr('d', path);
  }

  function update(projects, state = 'all', theme = 'footprint', enabledLayers = currentLayers) {
    currentProjects = projects;
    currentTheme = theme;
    currentLayers = enabledLayers;
    const changedState = selected !== state;
    selected = state;
    const groups = groupFootprint(projects);
    const counts = new Map(groups.map(g => [g.state, g.count]));
    const max = d3.max(groups, d => d.count) || 1;
    statePaths.classed('priority-state', d => anchors[d.properties.name] !== undefined)
      .classed('selected-state', d => state === d.properties.name)
      .style('fill', d => {
        const n = counts.get(d.properties.name) || 0;
        if (state === d.properties.name) return '#7fbeea';
        if (!n) return '#e8e8e8';
        return theme === 'women'
          ? d3.interpolateRgb('#f6e8f1', '#c885b2')(projects.filter(p => p.state === d.properties.name && p.womenBeneficiaries !== null).length / max)
          : d3.interpolateRgb('#cde8ed', '#8cc6df')(n / max);
      });
    bubbles.selectAll('.state-bubble').data(state === 'all' ? groups : [], d => d.state).join(enter => {
      const g = enter.append('g').attr('class', 'state-bubble')
        .attr('role', 'button').attr('tabindex', 0)
        .on('click', (_, d) => onState(d.state))
        .on('keydown', (event, d) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onState(d.state); }
        });
      g.append('rect').attr('class', 'marker-hit').attr('height', 36).attr('y', -18);
      g.append('rect').attr('class', 'bubble-halo').attr('height', 24).attr('y', -12).attr('rx', 6);
      g.append('g').attr('class', 'bubble-icons');
      g.append('circle').attr('class', 'bubble-core').attr('r', 7);
      g.append('text').attr('class', 'bubble-count');
      g.append('text').attr('class', 'bubble-state map-label').attr('y', 30);
      g.append('title');
      return g;
    }).attr('transform', d => `translate(${projection(stateReference(statesByName.get(d.state)))})`)
      .attr('aria-label', d => `${d.state}: ${d.count} documented stories. Explore state.`)
      .each(function(d) {
        const icons = [...new Set(projects.filter(project => project.state === d.state).map(markerLayer))];
        const markerWidth = icons.length * 18 + 24;
        const group = d3.select(this);
        group.select('.marker-hit').attr('x', -markerWidth / 2).attr('width', markerWidth);
        group.select('.bubble-halo').attr('x', -markerWidth / 2).attr('width', markerWidth);
        group.select('.bubble-icons').selectAll('image').data(icons, layer => layer.id).join('image')
          .attr('href', layer => `icons/ocha/${layer.icon}`)
          .attr('x', (_, i) => -markerWidth / 2 + 5 + i * 18).attr('y', -7)
          .attr('width', 14).attr('height', 14).attr('aria-hidden', 'true');
        group.select('.bubble-core').attr('cx', markerWidth / 2 - 9);
        group.select('.bubble-count').text(d.count).attr('x', markerWidth / 2 - 9).attr('y', 0).attr('dy', '.35em');
        group.select('.bubble-state').text(d.state.toUpperCase());
        group.select('title').text(`${d.state}: ${d.count} documented stories, not total interventions\n${icons.map(layer => layer.label).join(', ')}`);
      });

    points.selectAll('.project-pin').data(state === 'all' ? [] : projects, d => d.id).join(enter => {
      const pin = enter.append('g').attr('class', 'project-pin');
      pin.append('circle').attr('class', 'marker-hit').attr('r', 18);
      pin.append('circle').attr('class', 'pin-surface').attr('r', 12);
      pin.append('image').attr('x', -8).attr('y', -8).attr('width', 16).attr('height', 16).attr('aria-hidden', 'true');
      pin.append('title');
      return pin;
    })
      .attr('tabindex', 0).attr('role', 'button').attr('aria-label', d => `${d.name}. Approximate location. Open story.`)
      .on('click', (_, d) => onProject(d.id))
      .on('keydown', (event, d) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onProject(d.id); }
      })
      .each(function(d) {
        const layer = markerLayer(d);
        d3.select(this).select('image').attr('href', `icons/ocha/${layer.icon}`);
        d3.select(this).select('title').text(`${d.name}\n${layer.label}\n${d.coordinatePrecision}`);
      });
    applyLocalities();
    renderCamera();
    if (changedState) focus(state);
  }

  function focus(state) {
    const feature = geo.features.find(f => f.properties.name === state);
    let transform = d3.zoomIdentity;
    if (feature) {
      const [[x0, y0], [x1, y1]] = path.bounds(feature);
      const k = Math.min(3.2, 0.75 / Math.max((x1 - x0) / width, (y1 - y0) / height));
      transform = d3.zoomIdentity.translate(width / 2, height / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    }
    svg.transition().duration(reducedMotion() ? 0 : 650).call(zoom.transform, transform);
  }

  return {
    update,
    zoomIn: () => svg.transition().duration(reducedMotion() ? 0 : 250).call(zoom.scaleBy, 1.5),
    zoomOut: () => svg.transition().duration(reducedMotion() ? 0 : 250).call(zoom.scaleBy, 1 / 1.5),
    reset: () => { onState('all'); focus('all'); },
    async showLocalities(show) {
      localityVisible = show;
      if (show && !localities) {
        try {
          localitiesRequest ??= fetchJSON('sudan-localities.geojson');
          localities = await localitiesRequest;
        } catch (error) {
          localitiesRequest = undefined;
          localityVisible = false;
          onError(`Locality boundaries could not be loaded. ${error.message}`);
          return false;
        }
      }
      applyLocalities();
      return true;
    },
    setTheme(theme) { update(currentProjects, selected, theme); },
    getTheme: () => currentTheme,
    getLocalities: () => localityGroup.selectAll('path').data(),
  };
}
