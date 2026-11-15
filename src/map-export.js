import { geoMercator, geoPath } from 'd3';
import { groupFootprint, layers, projectLayer } from './model.js';

const namespace = 'http://www.w3.org/2000/svg';

function append(parent, tag, attributes = {}, text) {
  const element = document.createElementNS(namespace, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  if (text !== undefined) element.textContent = text;
  parent.append(element);
  return element;
}

function dataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('The map image could not be read.'));
    reader.readAsDataURL(blob);
  });
}

function mapPanel(parent, geo, focus, box, colors, region) {
  const svg = append(parent, 'svg', { ...box, viewBox: `0 0 ${box.width} ${box.height}`, overflow: 'hidden' });
  append(svg, 'rect', { width: box.width, height: box.height, fill: '#ffffff' });
  const projection = geoMercator().fitExtent([[45, 60], [box.width - 45, box.height - 45]], {
    type: 'FeatureCollection', features: focus,
  });
  const path = geoPath(projection);
  const backgroundCountries = append(svg, 'g', { class: 'report-regional-countries' });
  for (const country of region.features) {
    append(backgroundCountries, 'path', {
      class: 'report-regional-country', 'data-country': country.properties.name, d: path(country),
      fill: '#f7f7f7', stroke: '#c5cace', 'stroke-width': 1.2, 'stroke-linejoin': 'round',
    });
  }
  for (const feature of geo.features) {
    const name = feature.properties.name;
    append(svg, 'path', {
      class: 'report-state', 'data-state': name, d: path(feature),
      fill: colors.get(name) || '#e8e8e8', stroke: '#aeb4b8', 'stroke-width': 1.2,
    });
  }
  const northX = box.width - 28;
  append(svg, 'text', { x: northX, y: 25, 'font-size': 16, 'text-anchor': 'middle' }, 'N');
  append(svg, 'path', { d: `M${northX} 33 l-6 22 6-6 6 6 Z`, fill: '#53656f' });
  return { svg, projection, path, width: box.width, height: box.height };
}

function mapLabels(panel, geo, focusNames, context, occupied = [], locator = false) {
  const features = [...geo.features].sort((a, b) =>
    Number(focusNames.has(b.properties.name)) - Number(focusNames.has(a.properties.name)));
  for (const feature of features) {
    const country = Boolean(feature.properties.labelAt);
    const name = country ? feature.properties.label || feature.properties.name.toUpperCase() : feature.properties.name;
    const focused = focusNames.has(name);
    const size = locator ? 13 : focused ? 20 : 16;
    context.font = `${size}px Segoe UI, Arial, sans-serif`;
    const width = context.measureText(name).width;
    const [x, centerY] = country ? panel.projection(feature.properties.labelAt) : panel.path.centroid(feature);
    for (const offset of [0, -24, 24, -48, 48]) {
      const y = centerY + offset;
      const bounds = { left: x - width / 2 - 4, right: x + width / 2 + 4, top: y - size, bottom: y + 5 };
      if (bounds.left < 8 || bounds.right > panel.width - 8 || bounds.top < 35 || bounds.bottom > panel.height - 8) continue;
      if (occupied.some(other => bounds.left < other.right && bounds.right > other.left &&
        bounds.top < other.bottom && bounds.bottom > other.top)) continue;
      append(panel.svg, 'text', {
        x, y, 'font-size': size, 'text-anchor': 'middle', 'font-weight': focused ? 600 : 400,
        fill: country ? '#92999d' : focused ? '#334e60' : '#6b7074',
        stroke: '#ffffff', 'stroke-width': 3, 'paint-order': 'stroke',
      }, name);
      occupied.push(bounds);
      break;
    }
  }
}

function scaleBar(parent, panel, x, y) {
  const [, latitude] = panel.projection.invert([panel.width / 2, panel.height / 2]);
  const kilometersPerPixel = 6371.0088 * Math.cos(latitude * Math.PI / 180) / panel.projection.scale();
  const maximumSegment = (panel.width - 90) * kilometersPerPixel / 4;
  const magnitude = 10 ** Math.floor(Math.log10(maximumSegment));
  const segmentKilometers = Math.max(...[1, 2, 2.5, 5].map(value => value * magnitude)
    .filter(value => value <= maximumSegment));
  const segmentWidth = segmentKilometers / kilometersPerPixel;
  const group = append(parent, 'g', { class: 'report-scale-bar', transform: `translate(${x},${y})` });
  for (let index = 0; index < 4; index++) {
    append(group, 'rect', {
      x: index * segmentWidth, y: 0, width: segmentWidth, height: 10,
      fill: index % 2 ? '#ffffff' : '#000000', stroke: '#000000', 'stroke-width': 1,
    });
  }
  for (let index = 0; index <= 4; index++) {
    append(group, 'text', {
      class: 'scale-tick', x: index * segmentWidth, y: 30, 'font-size': 15, 'text-anchor': 'middle',
    }, String(index * segmentKilometers));
  }
  append(group, 'text', { x: 0, y: 56, 'font-size': 16 }, `Kilometers (scale at ${latitude.toFixed(1)} N)`);
}

export async function downloadMapPNG(source, { state, theme, enabledLayers, search, projects, geo, region, storyStates, localities }) {
  if (!source || !geo.features.length) throw new Error('The map is not ready to export.');
  const width = 1800;
  const padding = 40;
  const contentWidth = width - padding * 2;
  const focusNames = new Set(state !== 'all' ? [state] : projects.length ? projects.map(project => project.state) : storyStates);
  const focus = geo.features.filter(feature => focusNames.has(feature.properties.name));
  if (!focus.length) throw new Error('No state boundary is available for this selection.');
  const colors = new Map([...source.querySelectorAll('.state-shape')]
    .filter(shape => focusNames.has(shape.getAttribute('data-state')))
    .map(shape => [shape.getAttribute('data-state'), shape.style.fill]));

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser does not support map image export.');
  const report = document.createElementNS(namespace, 'svg');
  report.setAttribute('xmlns', namespace);
  report.setAttribute('width', width);
  report.setAttribute('font-family', 'Segoe UI, Arial, sans-serif');
  report.setAttribute('fill', '#334752');
  const background = append(report, 'rect', { width, fill: '#ffffff' });

  let y = 52;
  function text(value, size = 20, color = '#53656f') {
    context.font = `${size}px Segoe UI, Arial, sans-serif`;
    let line = '';
    for (const word of value.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && context.measureText(candidate).width > contentWidth) {
        append(report, 'text', { x: padding, y, 'font-size': size, fill: color }, line);
        y += size + 8;
        line = '';
      }
      for (const character of (line ? ` ${word}` : word)) {
        if (context.measureText(line + character).width > contentWidth) {
          append(report, 'text', { x: padding, y, 'font-size': size, fill: color }, line);
          y += size + 8;
          line = '';
        }
        line += character;
      }
    }
    append(report, 'text', { x: padding, y, 'font-size': size, fill: color }, line);
    y += size + 8;
  }

  text('Water for Lives and Livelihoods | Sudan Impact Atlas', 34, '#173f58');
  const place = state === 'all' ? 'All Sudan' : state;
  text(`${place} | ${projects.length} documented ${projects.length === 1 ? 'story' : 'stories'} | Focused state detail`);
  if (search.trim()) text(`Search: ${search.trim()}`);
  y += 12;
  append(report, 'text', { x: padding, y, 'font-size': 20, 'font-weight': 600 }, 'DETAIL / SELECTED STORY STATES');
  const mapY = y + 20;
  const detail = mapPanel(report, geo, focus, {
    class: 'report-detail-map', x: padding, y: mapY, width: 1100, height: 900,
  }, colors, region);
  for (const feature of localities.filter(feature => focusNames.has(feature.properties.state))) {
    append(detail.svg, 'path', {
      class: 'report-locality', d: detail.path(feature), fill: 'none',
      stroke: '#8f9ba3', 'stroke-width': 0.9, 'stroke-dasharray': '4 3',
    });
  }
  const occupied = [];
  for (const project of projects) {
    const [x, pointY] = detail.projection([project.longitude, project.latitude]);
    const layer = projectLayer(project, enabledLayers);
    const pin = append(detail.svg, 'g', { class: 'report-pin', transform: `translate(${x},${pointY})` });
    append(pin, 'circle', { r: 16, fill: '#ffffffcc' });
    append(pin, 'image', { href: `icons/ocha/${layer.icon}`, x: -11, y: -11, width: 22, height: 22 });
    occupied.push({ left: x - 18, right: x + 18, top: pointY - 18, bottom: pointY + 18 });
  }
  mapLabels(detail, geo, focusNames, context, occupied);
  mapLabels(detail, region, new Set(), context, occupied);
  const locator = mapPanel(report, geo, geo.features, {
    class: 'report-locator-map', x: 1176, y: mapY, width: 584, height: 780,
  }, new Map(), region);
  const locatorLabels = [];
  mapLabels(locator, geo, new Set(), context, locatorLabels, true);
  mapLabels(locator, region, new Set(), context, locatorLabels, true);
  scaleBar(report, locator, 1221, mapY + 820);
  y = mapY + 940;

  text('LEGEND / SELECTED INTERVENTION LAYERS', 22, '#173f58');
  const selectedLayers = layers.filter(layer => enabledLayers.includes(layer.id));
  selectedLayers.forEach((layer, index) => {
    const x = padding + (index % 3) * (contentWidth / 3);
    const rowY = y + Math.floor(index / 3) * 38;
    append(report, 'image', { href: `icons/ocha/${layer.icon}`, x, y: rowY - 19, width: 24, height: 24 });
    append(report, 'text', { x: x + 36, y: rowY, 'font-size': 20 }, layer.label);
  });
  if (selectedLayers.length) y += Math.ceil(selectedLayers.length / 3) * 38;
  else text('No intervention layers selected.');
  y += 8;

  const max = Math.max(0, ...groupFootprint(projects).map(group => group.count));
  if (max) {
    const gradient = append(append(report, 'defs'), 'linearGradient', { id: 'report-shading' });
    const colors = theme === 'women' ? ['#f6e8f1', '#c885b2'] : ['#cde8ed', '#8cc6df'];
    colors.forEach((color, index) => append(gradient, 'stop', { offset: `${index * 100}%`, 'stop-color': color }));
    text(theme === 'women' ? 'State shading: matching stories with published women counts' : 'State shading: matching story count');
    append(report, 'rect', { x: padding, y: y - 10, width: 240, height: 16, fill: 'url(#report-shading)' });
    append(report, 'text', { x: padding + 254, y: y + 4, 'font-size': 18 }, `0 to ${max} stories`);
    y += 34;
  }
  append(report, 'rect', { x: padding, y: y - 16, width: 20, height: 20, fill: '#e8e8e8' });
  append(report, 'text', { x: padding + 32, y, 'font-size': 18 }, 'Other states / no matching stories');
  if (state !== 'all') {
    append(report, 'rect', { x: padding + 370, y: y - 16, width: 20, height: 20, fill: '#7fbeea' });
    append(report, 'text', { x: padding + 402, y, 'font-size': 18 }, 'Selected state (highlight overrides shading)');
  }
  y += 34;
  if (localities.length) text('Dashed lines: locality boundaries (March 2020).', 18);
  text('Locations are approximate reference points, not verified project sites. Story counts are not total programme coverage.', 18);
  text('Source: UNDP Sudan, Water for Lives and Livelihoods (2026). Boundaries: March 2020 locality dataset. Regional basemap: Natural Earth.', 18);
  text(`Boundaries do not imply official endorsement. Icons: OCHA. Exported ${new Date().toISOString().slice(0, 10)}.`, 18);
  const height = Math.ceil(y + 16);
  report.setAttribute('height', height);
  background.setAttribute('height', height);

  const assets = new Map();
  await Promise.all([...report.querySelectorAll('image')].map(async image => {
    const url = image.getAttribute('href');
    if (!assets.has(url)) {
      assets.set(url, (async () => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Could not load a map icon (HTTP ${response.status}).`);
        return dataURL(await response.blob());
      })());
    }
    image.setAttribute('href', await assets.get(url));
  }));
  const picture = new Image();
  picture.src = await dataURL(new Blob([new XMLSerializer().serializeToString(report)], { type: 'image/svg+xml;charset=utf-8' }));
  await picture.decode();
  canvas.width = width;
  canvas.height = height;
  context.drawImage(picture, 0, 0);
  const blob = await new Promise((resolve, reject) => canvas.toBlob(result => {
    if (result) resolve(result);
    else reject(new Error('The browser could not create the PNG image.'));
  }, 'image/png'));
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `sudan-atlas-${place.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
