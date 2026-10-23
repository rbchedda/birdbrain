import { colors } from '@/theme/tokens';

import { pinColor } from './types';
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
export const mapHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>${maplibreCss}</style>
<style>
  html, body, #map { margin: 0; height: 100%; background: ${colors.ground}; }
  .maplibregl-ctrl-attrib { font: 11px system-ui, sans-serif; }
</style>
</head>
<body>
<div id="map"></div>
<script>${maplibreJs}</script>
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
      sources: {
        topo: { type: 'raster', tileSize: 256, maxzoom: 16,
          tiles: ['${USGS}/USGSTopo/MapServer/tile/{z}/{y}/{x}'],
          attribution: '${USGS_ATTRIBUTION}' },
        satellite: { type: 'raster', tileSize: 256, maxzoom: 16,
          tiles: ['${USGS}/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'],
          attribution: '${USGS_IMAGERY_ATTRIBUTION} ${USGS_ATTRIBUTION}' }
      },
      layers: [
        { id: 'topo', type: 'raster', source: 'topo' },
        { id: 'satellite', type: 'raster', source: 'satellite', layout: { visibility: 'none' } }
      ]
    }
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

  var loaded = false, queue = [], selected = null;
  function apply(m) {
    if (m.type === 'places') map.getSource('places').setData(m.data);
    if (m.type === 'parks') map.getSource('parks').setData(m.data);
    if (m.type === 'outline') map.getSource('outline').setData(m.geometry ? { type: 'Feature', properties: {}, geometry: m.geometry } : empty);
    if (m.type === 'basemap') {
      // Unknown or not-yet-built basemaps (terrain before PR 2) fall back to topo.
      var name = GROUPS[m.name] && GROUPS[m.name].length ? m.name : 'topo';
      Object.keys(GROUPS).forEach(function (g) {
        GROUPS[g].forEach(function (id) { map.setLayoutProperty(id, 'visibility', g === name ? 'visible' : 'none'); });
      });
      send({ type: 'basemap', name: name });
    }
    if (m.type === 'select') {
      selected = m.id;
      map.setFilter('places-selected', ['==', ['get', 'id'], m.id || '']);
      if (m.id === null) map.getSource('outline').setData(empty);
    }
    if (m.type === 'focus') map.easeTo({ center: m.center, zoom: Math.max(map.getZoom(), 11), duration: 600 });
  }
  window.bbReceive = function (m) { if (loaded) apply(m); else queue.push(m); };
  window.addEventListener('message', function (e) {
    if (e.data && e.data.birdbrain) window.bbReceive(JSON.parse(e.data.birdbrain));
  });

  map.on('load', function () {
    map.addSource('places', { type: 'geojson', data: empty });
    map.addSource('outline', { type: 'geojson', data: empty });
    // State parks (DCNR): own source and style. Blue dashed outline with a near-clear fill
    // (fill exists only as a tap target), so a park never reads as hunt-open land. No labels.
    map.addSource('parks', { type: 'geojson', data: empty });
    map.addLayer({ id: 'parks-fill', type: 'fill', source: 'parks', paint: { 'fill-color': '${colors.park}', 'fill-opacity': 0.04 } });
    map.addLayer({ id: 'parks-line', type: 'line', source: 'parks',
      paint: { 'line-color': '${colors.park}', 'line-width': 2, 'line-dasharray': [3, 2] } });
    map.addLayer({ id: 'outline-fill', type: 'fill', source: 'outline', paint: { 'fill-color': '${colors.accent}', 'fill-opacity': 0.15 } });
    map.addLayer({ id: 'outline-line', type: 'line', source: 'outline', paint: { 'line-color': '${colors.accent}', 'line-width': 2 } });
    map.addLayer({ id: 'places-selected', type: 'circle', source: 'places', filter: ['==', ['get', 'id'], ''],
      paint: { 'circle-radius': 14, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-width': 3, 'circle-stroke-color': '${colors.text}' } });
    map.addLayer({ id: 'places-circle', type: 'circle', source: 'places', paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 5, 11, 9],
      'circle-color': ['match', ['get', 'type'],
        'stocking', '${pinColor.stocking}', 'dove_field', '${pinColor.dove_field}', '${pinColor.game_land}'],
      'circle-opacity': ['case', ['get', 'open'], 1, 0.55],
      'circle-stroke-width': 2, 'circle-stroke-color': '${colors.ground}' } });
    // Generous hit box so pins are easy to tap with a glove on.
    map.on('click', function (e) {
      var p = e.point;
      var hits = map.queryRenderedFeatures([[p.x - 16, p.y - 16], [p.x + 16, p.y + 16]], { layers: ['places-circle'] });
      if (hits.length) return send({ type: 'select', id: hits[0].properties.id });
      var parks = map.queryRenderedFeatures(p, { layers: ['parks-fill'] });
      if (parks.length) return send({ type: 'selectPark', id: parks[0].properties.id });
      send({ type: 'select', id: null });
    });
    map.on('mousemove', function (e) {
      var hits = map.queryRenderedFeatures(e.point, { layers: ['places-circle'] });
      map.getCanvas().style.cursor = hits.length ? 'pointer' : '';
    });
    loaded = true;
    queue.splice(0).forEach(apply);
    send({ type: 'ready' });
  });
})();
</script>
</body>
</html>`;
