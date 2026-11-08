import vm from 'node:vm';
import { colors } from '@/theme/tokens';
import { buildMapHtml, mapHtml } from './mapHtml';
import { unpublishedPinStroke } from './types';

// Guards against template-literal escaping bugs that blank the map on device.
it('every inline script in mapHtml parses', () => {
  const scripts = [...mapHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  expect(scripts.length).toBeGreaterThan(0);
  for (const code of scripts) expect(() => new vm.Script(code)).not.toThrow();
});

// Terrain must not fetch USGS tiles: topo starts hidden and is shown only once a basemap is chosen.
it('topo layer starts hidden and waits for a basemap choice', () => {
  expect(mapHtml).toContain("{ id: 'topo', type: 'raster', source: 'topo', layout: { visibility: 'none' } }");
  expect(mapHtml).toContain('if (basemapChosen) showBasemap(current);');
  expect(mapHtml).toContain('if (!basemapChosen) showBasemap(current);');
});

it('has the species-search rank layer, numbered markers and fit/center messages', () => {
  expect(mapHtml).toContain("id: 'places-rank'");
  expect(mapHtml).toContain("layers: ['places-rank', 'places-circle']");
  expect(mapHtml).toContain('bb-rank');
  expect(mapHtml).toContain("m.type === 'fit'");
  expect(mapHtml).toContain("type: 'center'");
});

// Unpublished pins need a distinct ring, not a barely perceptible fade.
it('keeps unpublished pins fully opaque with a fixed high-contrast stroke; closed pins stay faded', () => {
  expect(unpublishedPinStroke).toBe('#2A4A38');
  const html = buildMapHtml();
  expect(html).toContain("'circle-opacity': ['case', ['get', 'open'], 1, ['to-boolean', ['get', 'unknown']], 1, 0.55]");
  expect(html).toContain("'circle-stroke-width': 2");
  expect(html).toContain(`'circle-stroke-color': ['case', ['to-boolean', ['get', 'unknown']], '${unpublishedPinStroke}', '${colors.ground}']`);
});
