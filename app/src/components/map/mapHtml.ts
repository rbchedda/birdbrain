import { colors } from '@/theme/tokens';

import { AWS_TERRARIUM, CONTOUR_THRESHOLDS_FT, DEM_ATTRIBUTION, DEM_MAXZOOM, mapAssets, type MapAssets } from '@/lib/mapConfig';

import { selectedOutlineLayers, terrainLayers } from './terrainStyle';
import { pinColor, terrainBasemapEnabled } from './types';
import { contourJs, pmtilesJs } from './vendor/terrainLibs';
// UMD build with an inline worker, bundled into the page (no CDN at runtime), so it
// runs from an about:blank WebView/iframe. Regenerate with app/scripts/vendor-maplibre.mjs.
import { maplibreCss, maplibreJs } from './vendor/maplibreGl';

// USGS National Map tiles: public domain, no API key.
export const USGS = 'https://basemap.nationalmap.gov/arcgis/rest/services';
/** Credit line USGS asks for (usgs.gov FAQ: terms of use for The National Map). */
export const USGS_ATTRIBUTION = 'Map services and data available from U.S. Geological Survey, National Geospatial Program.';
/** USGSImageryOnly service copyright (NAIP orthoimagery). */
export const USGS_IMAGERY_ATTRIBUTION = 'USDA, USGS The National Map: Orthoimagery.';

/**
 * Layer ids per basemap. Only one group is visible at a time; MapLibre only
 * requests tiles for sources with a visible layer, so hidden basemaps cost nothing.
 * Terrain is empty until PR 2 (brand terrain on Protomaps + 3DEP).
 */
export const basemapLayers = { topo: ['topo'], satellite: ['satellite'], terrain: [] as string[] };

/** Self-contained map page. Talks to the app through postMessage only. */
/**
 * Offline copies of the raster basemaps, read through the bboffline:// protocol
 * (RN answers from downloaded packs; a miss falls back to the network URL). Satellite
 * packs stop at z15, so its offline source overzooms past that.
 */
export const offlineLayers = {
  topo: { maxzoom: 16, network: `${USGS}/USGSTopo/MapServer/tile/{z}/{y}/{x}` },
  satellite: { maxzoom: 15, network: `${USGS}/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}` },
} as const;

/**
 * Terrain config for the page. Remote assets (EXPO_PUBLIC_MAP_ASSETS_URL) win; otherwise
 * the bundled French Creek extract plus AWS DEM. Loaded lazily so tests that never build
 * the page don't pay for the 7 MB bundle.
 */
function terrainConfig(enabled: boolean, assets: MapAssets | null) {
  if (!enabled) return { terrain: null, bundle: null };
  const base = { layers: terrainLayers(), thresholds: CONTOUR_THRESHOLDS_FT, demMaxzoom: DEM_MAXZOOM, demAttribution: DEM_ATTRIBUTION };
  if (assets) return { terrain: { ...base, pmtiles: `pmtiles://${assets.pmtiles}`, dem: assets.dem, glyphs: assets.glyphs }, bundle: null };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { frenchCreekTerrain } = require('./frenchCreekTerrain') as typeof import('./frenchCreekTerrain');
  return {
    terrain: { ...base, pmtiles: 'pmtiles://frenchcreek', dem: AWS_TERRARIUM, glyphs: 'bbglyph://{fontstack}/{range}' },
    bundle: frenchCreekTerrain,
  };
}

export function buildMapHtml(opts: { terrain?: boolean; assets?: MapAssets | null } = {}) {
  const { terrain, bundle } = terrainConfig(opts.terrain ?? terrainBasemapEnabled, opts.assets === undefined ? mapAssets : opts.assets);
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="referrer" content="no-referrer">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>${maplibreCss}</style>
<style>
  html, body, #map { margin: 0; height: 100%; background: ${colors.ground}; }
  .bb-rank { width: 26px; height: 26px; border-radius: 13px; background: ${colors.accent}; color: ${colors.onAccent};
    font: 700 13px system-ui, sans-serif; display: flex; align-items: center; justify-content: center;
    border: 2px solid ${colors.ground}; pointer-events: none; }
  .maplibregl-ctrl-attrib { font: 11px system-ui, sans-serif; }
</style>
</head>
<body>
<div id="map"></div>
<script>${maplibreJs}</script>
${terrain ? `<script>${pmtilesJs}</script>\n<script>${contourJs}</script>` : ''}
<script>
(function () {
  function send(m) {
    var s = JSON.stringify(m);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s);
    else if (window.parent !== window) window.parent.postMessage({ birdbrain: s }, '*');
  }
  if (!window.maplibregl) {
    send({ type: 'error', message: 'The map could not load.' });
    return;
  }
  var GROUPS = ${JSON.stringify(basemapLayers)};
  var OFFLINE = ${JSON.stringify(offlineLayers)};
  var offline = [], current = 'topo', basemapChosen = false;
  // Offline packs: tiles come from the app over the bridge. Esri is never a pack source.
  var tileId = 0, pending = {};
  function b64ToBuffer(b64) {
    var bin = atob(b64), n = bin.length, out = new Uint8Array(n);
    for (var i = 0; i < n; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
  function networkTile(url) {
    // No backslashes here: this runs inside a template literal, which would strip them.
    var m = /^bboffline:[/][/]([a-z]+)[/]([0-9]+)[/]([0-9]+)[/]([0-9]+)$/.exec(url);
    if (!m || !OFFLINE[m[1]]) return null;
    return OFFLINE[m[1]].network.replace('{z}', m[2]).replace('{x}', m[3]).replace('{y}', m[4]);
  }
  maplibregl.addProtocol('bboffline', function (params, abort) {
    return new Promise(function (resolve, reject) {
      var id = ++tileId;
      pending[id] = function (b64) {
        if (b64) return resolve({ data: b64ToBuffer(b64) });
        var net = networkTile(params.url);
        if (!net) return reject(new Error('no tile'));
        fetch(net, { signal: abort.signal }).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.arrayBuffer();
        }).then(function (data) { resolve({ data: data }); }, reject);
      };
      abort.signal.addEventListener('abort', function () { delete pending[id]; reject(new Error('aborted')); });
      send({ type: 'tile', id: id, url: params.url });
    });
  });
  // Terrain (green/orange): Protomaps vectors + Terrarium DEM (tint, hillshade, maplibre-contour).
  // No backslashes in this block: it runs inside a template literal.
  var TERRAIN = ${JSON.stringify(terrain)};
  var BUNDLE = ${JSON.stringify(bundle)};
  var terrainOk = false, demSource = null;
  try {
    if (TERRAIN && window.pmtiles && window.mlcontour) {
      var proto = new pmtiles.Protocol();
      if (BUNDLE) {
        // French Creek extract in memory: decoded on first read, served by byte range.
        var pmBytes = null;
        proto.add(new pmtiles.PMTiles({
          getKey: function () { return 'frenchcreek'; },
          getBytes: function (off, len) {
            if (!pmBytes) pmBytes = new Uint8Array(b64ToBuffer(BUNDLE.pmtiles));
            return Promise.resolve({ data: pmBytes.slice(off, off + len).buffer });
          }
        }));
        // Bundled DEM tiles answer the AWS URL first (works offline); others go to the network.
        var realFetch = window.fetch.bind(window);
        var DEM_RE = /elevation-tiles-prod[/]terrarium[/]([0-9]+)[/]([0-9]+)[/]([0-9]+)[.]png$/;
        window.fetch = function (input, init) {
          var u = typeof input === 'string' ? input : (input && input.url) || '';
          var m = DEM_RE.exec(u);
          var hit = m && BUNDLE.dem[m[1] + '/' + m[2] + '/' + m[3]];
          if (hit) return Promise.resolve(new Response(new Blob([b64ToBuffer(hit)], { type: 'image/png' })));
          return realFetch(input, init);
        };
        maplibregl.addProtocol('bbglyph', function (params) {
          var m = /^bbglyph:[/][/](.+)[/]([0-9]+-[0-9]+)$/.exec(params.url);
          var g = m && BUNDLE.glyphs[decodeURIComponent(m[1]) + '/' + m[2]];
          // Unknown ranges get an empty glyph set (valid PBF) rather than an error.
          return Promise.resolve({ data: g ? b64ToBuffer(g) : new ArrayBuffer(0) });
        });
      }
      maplibregl.addProtocol('pmtiles', proto.tile);
      // worker: false so DEM fetches go through the page's fetch (bundled tiles above).
      demSource = new mlcontour.DemSource({ url: TERRAIN.dem, encoding: 'terrarium', maxzoom: TERRAIN.demMaxzoom, worker: false });
      demSource.setupMaplibre(maplibregl);
      GROUPS.terrain = TERRAIN.layers.map(function (l) { return l.id; });
      terrainOk = true;
    }
  } catch (e) {
    terrainOk = false;
  }
  function addTerrain() {
    if (!terrainOk) return;
    try {
      map.addSource('dem', { type: 'raster-dem', encoding: 'terrarium', tileSize: 256, maxzoom: TERRAIN.demMaxzoom,
        tiles: [demSource.sharedDemProtocolUrl], attribution: TERRAIN.demAttribution });
      map.addSource('contours', { type: 'vector', maxzoom: 15, tiles: [demSource.contourProtocolUrl({
        multiplier: 3.28084, overzoom: 1, thresholds: TERRAIN.thresholds,
        elevationKey: 'ele', levelKey: 'level', contourLayer: 'contours' })] });
      map.addSource('protomaps', { type: 'vector', url: TERRAIN.pmtiles,
        attribution: '\u00a9 OpenStreetMap contributors \u00b7 Protomaps' });
      TERRAIN.layers.forEach(function (l) { map.addLayer(l); });
    } catch (e) {
      GROUPS.terrain = [];
      terrainOk = false;
    }
  }
  function showBasemap(name) {
    current = name;
    Object.keys(GROUPS).forEach(function (g) {
      GROUPS[g].forEach(function (id) {
        var useOffline = OFFLINE[id] && offline.indexOf(id) >= 0;
        map.setLayoutProperty(id, 'visibility', g === name && !useOffline ? 'visible' : 'none');
        if (OFFLINE[id]) map.setLayoutProperty(id + '-offline', 'visibility', g === name && useOffline ? 'visible' : 'none');
      });
    });
  }
  var empty = { type: 'FeatureCollection', features: [] };
  var map = new maplibregl.Map({
    container: 'map',
    // Pennsylvania, clear of the header chips and the bottom sheet.
    bounds: [[-80.52, 39.72], [-74.69, 42.27]],
    fitBoundsOptions: { padding: { top: 120, bottom: 170, left: 12, right: 12 } },
    maxZoom: 16,
    attributionControl: { compact: true },
    style: {
      version: 8,
      glyphs: TERRAIN ? TERRAIN.glyphs : undefined,
      sources: {
        topo: { type: 'raster', tileSize: 256, maxzoom: 16,
          tiles: ['${USGS}/USGSTopo/MapServer/tile/{z}/{y}/{x}'],
          attribution: '${USGS_ATTRIBUTION}' },
        satellite: { type: 'raster', tileSize: 256, maxzoom: 16,
          tiles: ['${USGS}/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'],
          attribution: '${USGS_IMAGERY_ATTRIBUTION} ${USGS_ATTRIBUTION}' },
        'topo-offline': { type: 'raster', tileSize: 256, maxzoom: ${offlineLayers.topo.maxzoom},
          tiles: ['bboffline://topo/{z}/{x}/{y}'],
          attribution: '${USGS_ATTRIBUTION}' },
        'satellite-offline': { type: 'raster', tileSize: 256, maxzoom: ${offlineLayers.satellite.maxzoom},
          tiles: ['bboffline://satellite/{z}/{x}/{y}'],
          attribution: '${USGS_IMAGERY_ATTRIBUTION} ${USGS_ATTRIBUTION}' }
      },
      layers: [
        // Hidden until the app picks a basemap, so terrain never requests USGS tiles.
        { id: 'topo', type: 'raster', source: 'topo', layout: { visibility: 'none' } },
        { id: 'satellite', type: 'raster', source: 'satellite', layout: { visibility: 'none' } },
        { id: 'topo-offline', type: 'raster', source: 'topo-offline', layout: { visibility: 'none' } },
        { id: 'satellite-offline', type: 'raster', source: 'satellite-offline', layout: { visibility: 'none' } }
      ]
    }
  });
  // No +/- control: bottom-right sits under the sheet and the header owns the top.
  // Pinch (touch) and scroll/double-click (web) zoom; 'center on me' handles recentering.

  var loaded = false, queue = [], selected = null;
  function apply(m) {
    if (m.type === 'places') map.getSource('places').setData(m.data);
    if (m.type === 'parks') map.getSource('parks').setData(m.data);
    if (m.type === 'outline') map.getSource('outline').setData(m.geometry ? { type: 'Feature', properties: {}, geometry: m.geometry } : empty);
    if (m.type === 'basemap') {
      // Unknown or not-yet-built basemaps (terrain before PR 2) fall back to topo.
      var name = GROUPS[m.name] && GROUPS[m.name].length ? m.name : 'topo';
      basemapChosen = true;
      showBasemap(name);
      send({ type: 'basemap', name: name });
    }
    if (m.type === 'offline') {
      offline = m.basemaps || [];
      if (basemapChosen) showBasemap(current);
    }
    if (m.type === 'select') {
      selected = m.id;
      map.setFilter('places-selected', ['==', ['get', 'id'], m.id || '']);
      if (m.id === null) map.getSource('outline').setData(empty);
    }
    if (m.type === 'me') {
      map.getSource('me').setData(m.center ? { type: 'FeatureCollection', features: [
        { type: 'Feature', properties: { kind: 'accuracy' }, geometry: circle(m.center, m.accuracy) },
        { type: 'Feature', properties: { kind: 'dot' }, geometry: { type: 'Point', coordinates: m.center } }
      ] } : empty);
    }
    if (m.type === 'fit' && Array.isArray(m.bounds) && m.bounds.length === 2) {
      map.fitBounds(m.bounds, { padding: m.padding || { top: 140, bottom: 200, left: 40, right: 40 }, maxZoom: 14, duration: 600 });
    }
    if (m.type === 'places') drawRanks(m.data);
    if (m.type === 'focus') map.easeTo({ center: m.center, zoom: Math.max(map.getZoom(), m.zoom || 11), duration: 600 });
  }
  // Species search: numbered pins (rank 1-10) as DOM markers, so they need no glyphs and work offline.
  var rankMarkers = [];
  function drawRanks(fc) {
    rankMarkers.forEach(function (mk) { mk.remove(); });
    rankMarkers = [];
    (fc.features || []).forEach(function (f) {
      var r = f.properties.rank;
      if (!(r >= 1 && r <= 10)) return;
      var el = document.createElement('div');
      el.className = 'bb-rank';
      el.textContent = String(r);
      el.setAttribute('data-rank', String(r));
      rankMarkers.push(new maplibregl.Marker({ element: el }).setLngLat(f.geometry.coordinates).addTo(map));
    });
  }
  // Accuracy ring as a 64-point polygon, meters to degrees on a sphere.
  function circle(c, meters) {
    var pts = [], r = Math.max(meters, 1) / 6371008.8, lat = c[1] * Math.PI / 180;
    for (var i = 0; i <= 64; i++) {
      var a = (i / 64) * 2 * Math.PI;
      pts.push([c[0] + (r * Math.sin(a) / Math.cos(lat)) * 180 / Math.PI, c[1] + (r * Math.cos(a)) * 180 / Math.PI]);
    }
    return { type: 'Polygon', coordinates: [pts] };
  }
  window.bbReceive = function (m) {
    // Tile replies can't wait for 'load': the style's own tiles are requested before it.
    if (m.type === 'tileData') {
      var cb = pending[m.id];
      delete pending[m.id];
      if (cb) cb(m.data);
      return;
    }
    if (loaded) apply(m); else queue.push(m);
  };
  window.addEventListener('message', function (e) {
    if (e.data && e.data.birdbrain) window.bbReceive(JSON.parse(e.data.birdbrain));
  });

  map.on('load', function () {
    // Terrain group first so every overlay draws above it. Hidden until chosen.
    addTerrain();
    map.addSource('places', { type: 'geojson', data: empty });
    map.addSource('outline', { type: 'geojson', data: empty });
    // State parks (DCNR): own source and style. Blue dashed outline with a near-clear fill
    // (fill exists only as a tap target), so a park never reads as hunt-open land. No labels.
    map.addSource('parks', { type: 'geojson', data: empty });
    map.addLayer({ id: 'parks-fill', type: 'fill', source: 'parks', paint: { 'fill-color': '${colors.park}', 'fill-opacity': 0.04 } });
    map.addLayer({ id: 'parks-line', type: 'line', source: 'parks',
      paint: { 'line-color': '${colors.park}', 'line-width': 2, 'line-dasharray': [3, 2] } });
    // Selected place: orange line over a dark casing, no fill (RBChedda, Oct 22).
    ${JSON.stringify(selectedOutlineLayers())}.forEach(function (l) { map.addLayer(l); });
    map.addLayer({ id: 'places-selected', type: 'circle', source: 'places', filter: ['==', ['get', 'id'], ''],
      paint: { 'circle-radius': 14, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-width': 3, 'circle-stroke-color': '${colors.text}' } });
    map.addLayer({ id: 'places-circle', type: 'circle', source: 'places', paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 5, 11, 9],
      'circle-color': ['match', ['get', 'type'],
        'stocking', '${pinColor.stocking}', 'dove_field', '${pinColor.dove_field}', '${pinColor.game_land}'],
      'circle-opacity': ['case', ['get', 'open'], 1, 0.55],
      'circle-stroke-width': 2, 'circle-stroke-color': '${colors.ground}' } });
    // Species search: results ranked 11-20 stay small dots; ranked pins get a bigger orange tap target.
    map.addLayer({ id: 'places-rank', type: 'circle', source: 'places',
      filter: ['all', ['>=', ['get', 'rank'], 1], ['<=', ['get', 'rank'], 10]],
      paint: { 'circle-radius': 13, 'circle-color': '${colors.accent}', 'circle-opacity': 0 } });
    map.addSource('me', { type: 'geojson', data: empty });
    map.addLayer({ id: 'me-accuracy', type: 'fill', source: 'me', filter: ['==', ['get', 'kind'], 'accuracy'],
      paint: { 'fill-color': '#2F80ED', 'fill-opacity': 0.15, 'fill-outline-color': '#2F80ED' } });
    map.addLayer({ id: 'me-dot', type: 'circle', source: 'me', filter: ['==', ['get', 'kind'], 'dot'],
      paint: { 'circle-radius': 7, 'circle-color': '#2F80ED', 'circle-stroke-width': 3, 'circle-stroke-color': '#FFFFFF' } });
    // Generous hit box so pins are easy to tap with a glove on.
    map.on('click', function (e) {
      var p = e.point;
      var hits = map.queryRenderedFeatures([[p.x - 16, p.y - 16], [p.x + 16, p.y + 16]], { layers: ['places-rank', 'places-circle'] });
      if (hits.length) return send({ type: 'select', id: hits[0].properties.id });
      var parks = map.queryRenderedFeatures(p, { layers: ['parks-fill'] });
      if (parks.length) return send({ type: 'selectPark', id: parks[0].properties.id });
      // Any other boundary (selected outline) also counts as a hit; only truly empty map closes things.
      var lines = map.getStyle().layers.filter(function (l) { return l.id.indexOf('outline') === 0; }).map(function (l) { return l.id; });
      if (lines.length && map.queryRenderedFeatures(p, { layers: lines }).length) return;
      send({ type: 'emptyTap', lngLat: [e.lngLat.lng, e.lngLat.lat] });
    });
    map.on('mousemove', function (e) {
      var hits = map.queryRenderedFeatures(e.point, { layers: ['places-circle'] });
      map.getCanvas().style.cursor = hits.length ? 'pointer' : '';
    });
    map.on('moveend', function () {
      var c = map.getCenter();
      send({ type: 'center', center: [c.lng, c.lat] });
    });
    loaded = true;
    queue.splice(0).forEach(apply);
    send({ type: 'ready', terrain: terrainOk });
    // Fallback if the app never sends a basemap: show topo.
    setTimeout(function () { if (!basemapChosen) showBasemap(current); }, 1500);
  });
})();
</script>
</body>
</html>`;
}

export const mapHtml = buildMapHtml();
