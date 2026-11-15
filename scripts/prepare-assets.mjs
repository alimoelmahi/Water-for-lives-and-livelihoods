import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import sharp from 'sharp';
import * as shapefile from 'shapefile';
import { topology } from 'topojson-server';
import { feature } from 'topojson-client';
import clipping from 'polygon-clipping';
import { presimplify, simplify, quantile } from 'topojson-simplify';
import { geoArea } from 'd3';
import { layers } from '../src/model.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'public');
await mkdir(path.join(out, 'images'), { recursive: true });
await mkdir(path.join(out, 'data'), { recursive: true });
await mkdir(path.join(out, 'icons'), { recursive: true });
await copyFile(path.join(root, 'Assessts', 'ocha-icons', 'Agriculture_40570.svg'), path.join(out, 'icons', 'agriculture.svg'));
await mkdir(path.join(out, 'icons', 'ocha'), { recursive: true });
for (const layer of layers) {
  await copyFile(path.join(root, 'Assessts', 'ocha-icons', layer.icon), path.join(out, 'icons', 'ocha', layer.icon));
}

const document = unzipSync(await readFile(path.join(root, 'Water_for_Lives_and_Livelihoods-9 1.docx')));
await copyFile(path.join(root, 'Water_for_Lives_and_Livelihoods-9 1.docx'), path.join(out, 'publication.docx'));
const photos = Object.entries(document).filter(([name]) => /^word\/media\/image\d+\.(jpg|png)$/.test(name));
for (const [name, bytes] of photos) {
  const basename = path.basename(name, path.extname(name));
  await sharp(bytes).rotate().resize({ width: 1440, withoutEnlargement: true }).webp({ quality: 82 })
    .toFile(path.join(out, 'images', `${basename}.webp`));
}
for (const width of [600, 960]) {
  await sharp(document['word/media/image58.jpg']).rotate().resize({ width, withoutEnlargement: true })
    .webp({ quality: 82 }).toFile(path.join(out, 'images', `image58-${width}.webp`));
}

if (process.env.CONTACT_SHEET) {
  const tiles = await Promise.all(photos.map(async ([name, bytes], index) => {
    const label = path.basename(name);
    const thumb = await sharp(bytes).resize(180, 110, { fit: 'contain', background: '#e9e9e9' }).png().toBuffer();
    const text = Buffer.from(`<svg width="180" height="24"><rect width="180" height="24" fill="white"/><text x="8" y="17" font-size="13">${label}</text></svg>`);
    return [{ input: thumb, left: (index % 7) * 180, top: Math.floor(index / 7) * 134 },
      { input: text, left: (index % 7) * 180, top: Math.floor(index / 7) * 134 + 110 }];
  }));
  await sharp({ create: { width: 1260, height: Math.ceil(photos.length / 7) * 134, channels: 3, background: '#fff' } })
    .composite(tiles.flat()).png().toFile(process.env.CONTACT_SHEET);
}

const zip = unzipSync(await readFile(path.join(root, 'Assessts', 'Geo Assets', 'Sudan_Localities', 'locality_poly_mar20.zip')));
const exactBuffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const localities = await shapefile.read(exactBuffer(zip['Locality_Poly_Mar20.shp']), exactBuffer(zip['Locality_Poly_Mar20.dbf']), { encoding: 'utf-8' });
const stateNames = [...new Set(localities.features.map(f => f.properties.State_En))];
const sourceStates = { type: 'FeatureCollection', features: stateNames.map(name => ({
  type: 'Feature',
  properties: { name },
  geometry: {
    type: 'MultiPolygon',
    coordinates: clipping.union(...localities.features.filter(f => f.properties.State_En === name).map(f => f.geometry.coordinates)),
  },
})) };
const raw = topology({ states: sourceStates, localities }, 1e5);
const weighted = presimplify(raw);
const topo = simplify(weighted, quantile(weighted, 0.18));
const states = feature(topo, topo.objects.states);
function cleanStateGeometry(feature) {
  const geometry = feature.geometry;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const samePoint = (a, b) => a[0] === b[0] && a[1] === b[1];
  function hasArea(ring) {
    if (ring.length < 4 || new Set(ring.map(point => point.join(','))).size < 3) return false;
    const area = geoArea({ type: 'Polygon', coordinates: [ring] });
    return area > 0 && area < 4 * Math.PI;
  }
  const cleaned = polygons.map(polygon => polygon.map(ring => {
    if (!ring.length) return ring;
    const points = ring.slice();
    if (samePoint(points[0], points[points.length - 1])) points.pop();
    let changed = true;
    while (changed && points.length > 2) {
      changed = false;
      for (let i = 0; i < points.length; i++) {
        const previous = points[(i + points.length - 1) % points.length];
        const next = points[(i + 1) % points.length];
        if (samePoint(previous, points[i]) || samePoint(previous, next)) {
          points.splice(i, 1);
          changed = true;
          break;
        }
      }
    }
    return points.length ? [...points, [...points[0]]] : [];
  })).filter(polygon => polygon.length && hasArea(polygon[0]))
    .map(polygon => [polygon[0], ...polygon.slice(1).filter(hasArea)]);
  if (!cleaned.length) throw new Error(`No valid state polygon remains for ${feature.properties.name}.`);
  geometry.coordinates = geometry.type === 'Polygon' ? cleaned[0] : cleaned;
}
// D3's spherical rendering expects exterior rings clockwise (unlike RFC 7946).
function orient(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of polygons) {
    if (geoArea({ type: 'Polygon', coordinates: polygon }) > 2 * Math.PI) polygon.forEach(ring => ring.reverse());
  }
}
states.features.forEach(f => {
  // Quantization and simplification can collapse very small source rings.
  cleanStateGeometry(f);
  orient(f.geometry);
});
const localityGeo = feature(topo, topo.objects.localities);
localityGeo.features.forEach(f => {
  f.properties = { name: f.properties.Loc_En, state: f.properties.State_En, code: f.properties.HRpcode };
  orient(f.geometry);
});
await writeFile(path.join(out, 'data', 'sudan-states.geojson'), JSON.stringify(states));
await writeFile(path.join(out, 'data', 'sudan-localities.geojson'), JSON.stringify(localityGeo));
const regionalArchive = await readFile(path.join(root, 'Assessts', 'Geo Assets', 'NaturalEarth', 'ne_50m_admin_0_countries.zip'));
const regionalFiles = unzipSync(regionalArchive);
const countries = await shapefile.read(
  exactBuffer(regionalFiles['ne_50m_admin_0_countries.shp']),
  exactBuffer(regionalFiles['ne_50m_admin_0_countries.dbf']),
  { encoding: 'utf-8' },
);
const contextCountries = new Map([
  ['EGY', { labelAt: [29, 23] }],
  ['LBY', { labelAt: [23.8, 21.3] }],
  ['TCD', { labelAt: [21.6, 15.4] }],
  ['CAF', { labelAt: [22, 7.5], label: 'C. AFRICAN REP.' }],
  ['SSD', { labelAt: [29.2, 8.5] }],
  ['ETH', { labelAt: [36.4, 11.6] }],
  ['ERI', { labelAt: [38.5, 16.2] }],
  ['SAU', { labelAt: [40.5, 21.5] }],
]);
const cleanName = name => name.replace(/\0/g, '').trim();
const regionalFeatures = countries.features
  .filter(country => contextCountries.has(cleanName(country.properties.ISO_A3)))
  .map(country => {
    const code = cleanName(country.properties.ISO_A3);
    country.properties = { name: cleanName(country.properties.ADMIN), code, ...contextCountries.get(code) };
    orient(country.geometry);
    return country;
  });
if (regionalFeatures.length !== contextCountries.size) throw new Error('Regional basemap is missing a required neighboring country.');
await writeFile(path.join(out, 'data', 'sudan-region.geojson'), JSON.stringify({
  type: 'FeatureCollection',
  source: {
    name: 'Natural Earth', version: '5.1.1', scale: '1:50m', license: 'Public domain',
    url: 'https://naciscdn.org/naturalearth/50m/cultural/ne_50m_admin_0_countries.zip',
    sha256: createHash('sha256').update(regionalArchive).digest('hex'),
  },
  features: regionalFeatures,
}));
console.log(`Prepared ${photos.length} publication images, ${states.features.length} states and ${localityGeo.features.length} localities.`);
console.log(`Prepared ${regionalFeatures.length} regional context countries from Natural Earth.`);
console.log(`States: ${stateNames.join(', ')}`);
