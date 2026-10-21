import { colors } from '@/theme/tokens';

import { pinColor } from './types';

// UMD build with an inline worker, so it runs from an about:blank WebView/iframe.
const MAPLIBRE = 'https://unpkg.com/maplibre-gl@5.24.0/dist';

// USGS National Map tiles: public domain, no API key.
const USGS = 'https://basemap.nationalmap.gov/arcgis/rest/services';

/** Self-contained map page. Talks to the app through postMessage only. */
export const mapHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="${MAPLIBRE}/maplibre-gl.css">
<style>
  html, body, #map { margin: 0; height: 100%; background: ${colors.ground}; }
  .maplibregl-ctrl-attrib { font: 11px system-ui, sans-serif; }
</style>
</head>
<body>
<div id="map"></div>
<script src="${MAPLIBRE}/maplibre-gl.js"></script>
<script>
(function () {
  function send(m) {
    var s = JSON.stringify(m);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s);
    else if (window.parent !== window) window.parent.postMessage({ birdbrain: s }, '*');
  }
  if (!window.maplibregl) {
    send({ type: 'error', message: 'The map could not load. Check your connection.' });
    return;
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
      sources: {
        topo: { type: 'raster', tileSize: 256, maxzoom: 16,
          tiles: ['${USGS}/USGSTopo/MapServer/tile/{z}/{y}/{x}'],
          attribution: 'USGS The National Map' },
        imagery: { type: 'raster', tileSize: 256, maxzoom: 16,
          tiles: ['${USGS}/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}'],
          attribution: 'USGS The National Map' }
      },
      layers: [
        { id: 'topo', type: 'raster', source: 'topo' },
        { id: 'imagery', type: 'raster', source: 'imagery', layout: { visibility: 'none' } }
      ]
    }
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

  var loaded = false, queue = [], selected = null;
  function apply(m) {
    if (m.type === 'places') map.getSource('places').setData(m.data);
    if (m.type === 'outline') map.getSource('outline').setData(m.geometry ? { type: 'Feature', properties: {}, geometry: m.geometry } : empty);
    if (m.type === 'basemap') {
      map.setLayoutProperty('topo', 'visibility', m.name === 'topo' ? 'visible' : 'none');
      map.setLayoutProperty('imagery', 'visibility', m.name === 'imagery' ? 'visible' : 'none');
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
      send({ type: 'select', id: hits.length ? hits[0].properties.id : null });
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
