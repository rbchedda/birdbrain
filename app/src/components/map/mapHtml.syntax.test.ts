import vm from 'node:vm';
import { mapHtml } from './mapHtml';

// Guards against template-literal escaping bugs that blank the map on device.
it('every inline script in mapHtml parses', () => {
  const scripts = [...mapHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  expect(scripts.length).toBeGreaterThan(0);
  for (const code of scripts) expect(() => new vm.Script(code)).not.toThrow();
});

it('has the species-search rank layer, numbered markers and fit/center messages', () => {
  expect(mapHtml).toContain("id: 'places-rank'");
  expect(mapHtml).toContain("layers: ['places-rank', 'places-circle']");
  expect(mapHtml).toContain('bb-rank');
  expect(mapHtml).toContain("m.type === 'fit'");
  expect(mapHtml).toContain("type: 'center'");
});
