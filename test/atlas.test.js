import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { geoArea, geoBounds, geoContains } from 'd3';
import { filterProjects, groupFootprint, loanRows, layers } from '../src/model.js';
import { stateReference } from '../src/map.js';

const load = async name => JSON.parse(await readFile(new URL(`../public/data/${name}`, import.meta.url), 'utf8'));
const projects = await load('projects.json');
const finance = await load('finance.json');

test('geographic, stage and layer filters compose without double counting multi-layer records', () => {
  const result = filterProjects(projects, { state: 'Gedaref', stage: 'water', enabledLayers: ['solar', 'women'] });
  assert.deepEqual(result.map(p => p.id), ['galabat', 'helat']);
  assert.equal(new Set(result.map(p => p.id)).size, result.length);
  assert.equal(filterProjects(projects, { enabledLayers: [] }).length, 0);
  assert.deepEqual(filterProjects(projects, { search: '  MARAWI  ' }).map(p => p.id), ['marawi']);
  assert.equal(filterProjects(projects, { state: 'Khartoum' }).length, 0);
  assert.equal(filterProjects(projects, { stage: 'inputs', enabledLayers: ['inputs'] }).length, 2);
});

test('published loan aggregates are preserved and unsupported intersections are rejected', () => {
  const sum = rows => rows.reduce((total, row) => total + row.count, 0);
  assert.equal(sum(loanRows(finance)), 122);
  assert.equal(sum(loanRows(finance, { gender: 'women' })), 55);
  assert.equal(sum(loanRows(finance, { gender: 'men' })), 67);
  assert.equal(sum(loanRows(finance, { activity: 'crops' })), 67);
  assert.equal(sum(loanRows(finance, { activity: 'livestock' })), 55);
  assert.deepEqual(loanRows(finance, { state: 'Gedaref', gender: 'women' }), [{ state: 'Gedaref', count: 35 }]);
  assert.deepEqual(loanRows(finance, { state: 'Northern', activity: 'livestock' }), [{ state: 'Northern', count: 16 }]);
  assert.throws(() => loanRows(finance, { gender: 'women', activity: 'crops' }), /does not supply/);
  assert.equal(finance.instalmentsDue, finance.instalmentsPaidOnTime);
  assert.ok(finance.loansInRepayment < finance.loans);
});

test('map footprint counts story records, not mixed beneficiary units', () => {
  const grouped = groupFootprint(projects);
  assert.equal(grouped.length, 5);
  assert.equal(grouped.reduce((sum, state) => sum + state.count, 0), projects.length);
  assert.equal(grouped.find(g => g.state === 'River Nile').count, 3);
  assert.equal(groupFootprint(filterProjects(projects, { enabledLayers: [] })).length, 0);
});

test('boundaries render as Sudan, preserve supplied areas and cover all project states', async () => {
  const geo = await load('sudan-states.geojson');
  assert.equal(geo.features.length, 19);
  assert.ok(geo.features.some(f => f.properties.name === 'Abyei PCA'));
  const names = new Set(geo.features.map(f => f.properties.name));
  for (const project of projects) assert.ok(names.has(project.state), project.state);
  for (const feature of geo.features) {
    assert.ok(geoArea(feature) < 1, `${feature.properties.name} has reversed spherical winding`);
    const [[west, south], [east, north]] = geoBounds(feature);
    assert.ok(west > 20 && east < 40 && south > 8 && north < 24, feature.properties.name);
    const [longitude, latitude] = stateReference(feature);
    assert.ok(longitude >= west && longitude <= east && latitude >= south && latitude <= north,
      `${feature.properties.name} needs a usable bubble position when coverage expands beyond the five focus states`);
  }
});

test('regional basemap contains correctly oriented neighboring countries and usable labels', async () => {
  const region = await load('sudan-region.geojson');
  assert.deepEqual(region.features.map(country => country.properties.code).sort(),
    ['CAF', 'EGY', 'ERI', 'ETH', 'LBY', 'SAU', 'SSD', 'TCD']);
  assert.equal(region.source.name, 'Natural Earth');
  assert.equal(region.source.license, 'Public domain');
  for (const country of region.features) {
    assert.ok(country.properties.name && !country.properties.name.includes('\0'));
    assert.ok(geoArea(country) > 0 && geoArea(country) < 1, `${country.properties.name}: incorrect spherical winding`);
    assert.ok(geoContains(country, country.properties.labelAt), `${country.properties.name}: label must be inside the country`);
  }
});

test('state boundaries contain no collapsed rings or retraced edges', async () => {
  const geo = await load('sudan-states.geojson');
  for (const feature of geo.features) {
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    for (const polygon of polygons) {
      for (const ring of polygon) {
        assert.deepEqual(ring[0], ring.at(-1), `${feature.properties.name}: ring must be closed`);
        assert.ok(new Set(ring.map(point => point.join(','))).size >= 3, `${feature.properties.name}: collapsed ring`);
        const area = geoArea({ type: 'Polygon', coordinates: [ring] });
        assert.ok(area > 0 && area < 4 * Math.PI, `${feature.properties.name}: zero-area ring`);
        const points = ring.slice(0, -1);
        for (let i = 0; i < points.length; i++) {
          const previous = points[(i + points.length - 1) % points.length];
          const next = points[(i + 1) % points.length];
          assert.notDeepEqual(previous, points[i], `${feature.properties.name}: duplicate vertex`);
          assert.notDeepEqual(previous, next, `${feature.properties.name}: retraced spike`);
        }
      }
    }
  }
});

test('state union retains source locality coverage in former false holes', async () => {
  const geo = await load('sudan-states.geojson');
  const probes = [
    { state: 'Aj Jazirah', point: [32.57965200524597, 14.801123826483817] },
    { state: 'North Darfur', point: [26.470524405795462, 12.981945075156224] },
    { state: 'Central Darfur', point: [23.183393395705583, 12.658876470162234] },
  ];
  for (const { state, point } of probes) {
    assert.ok(geoContains(geo.features.find(feature => feature.properties.name === state), point),
      `${state}: land covered by the original locality polygons must not become a hole during dissolution`);
  }
});

test('all story references resolve and uncertain data retains its precision and units', async () => {
  const photos = await load('photos.json');
  const partners = await load('partners.json');
  const stories = await load('story_content.json');
  const cases = await load('case_studies.json');
  const ids = new Set();
  for (const project of projects) {
    assert.ok(!ids.has(project.id)); ids.add(project.id);
    assert.ok(project.coordinatePrecision.startsWith('Approximate'));
    assert.ok(project.source && project.beneficiaryUnit);
    assert.ok(Number.isFinite(project.latitude) && Number.isFinite(project.longitude));
    assert.ok(project.womenBeneficiaries === null || project.womenBeneficiaries <= project.beneficiaries);
    for (const type of project.interventionType) assert.ok(layers.some(layer => layer.id === type));
    for (const partner of project.partner) assert.ok(partners.nodes.some(node => node.id === partner));
    for (const image of project.mediaReferences) {
      assert.ok(photos.photos.some(photo => photo.id === image));
      await access(new URL(`../public/images/${image}.webp`, import.meta.url));
    }
  }
  for (const item of cases) assert.ok(ids.has(item.projectId));
  assert.equal(stories.length, 6);
  for (const story of stories) {
    assert.ok(photos.photos.some(photo => photo.id === story.photo));
    assert.ok(filterProjects(projects, { state: story.state, stage: story.id, enabledLayers: story.layers }).length > 0);
  }
});
