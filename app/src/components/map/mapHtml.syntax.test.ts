import vm from 'node:vm';
import { mapHtml } from './mapHtml';

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
