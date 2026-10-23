import vm from 'node:vm';
import { buildMapHtml } from './mapHtml';

// Runs the page's own script against a stub MapLibre to check the no-basemap fallback timing.
function boot() {
  const html = buildMapHtml({ terrain: false });
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const app = scripts.find((s) => s.includes('basemapChosen'));
  if (!app) throw new Error('app script not found');
  const visibility: Record<string, string> = {};
  const handlers: Record<string, (() => void)[]> = {};
  const sent: { type: string }[] = [];
  const any: unknown = new Proxy(function () {}, { get: () => any, apply: () => any });
  class StubMap {
    constructor(opts: { style: { layers: { id: string; layout?: { visibility?: string } }[] } }) {
      opts.style.layers.forEach((l) => { visibility[l.id] = l.layout?.visibility ?? 'visible'; });
      // Methods the stub doesn't define (addSource, addLayer, ...) are no-ops.
      return new Proxy(this, { get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : () => any) });
    }
    on(ev: string, a: unknown, b?: unknown) { const cb = (typeof a === 'function' ? a : b) as () => void; (handlers[ev] ||= []).push(cb); }
    setLayoutProperty(id: string, k: string, v: string) { if (k === 'visibility') visibility[id] = v; }
    getSource() { return { setData() {} }; }
    getCanvas() { return { style: {} }; }
    getCenter() { return { lng: 0, lat: 0 }; }
    getZoom() { return 7; }
  }
  const win: Record<string, unknown> = {
    maplibregl: { addProtocol() {}, Map: StubMap, Marker: any, Popup: any, LngLatBounds: any },
    ReactNativeWebView: { postMessage: (s: string) => sent.push(JSON.parse(s)) },
    addEventListener() {}, setTimeout, clearTimeout, atob, fetch: () => Promise.reject(new Error('offline')),
  };
  win.window = win;
  win.parent = win;
  const ctx = vm.createContext(new Proxy(win, { has: () => true, get: (t, k) => (k in t ? t[k as string] : k === Symbol.unscopables ? undefined : (globalThis as Record<string | symbol, unknown>)[k] ?? any) }));
  vm.runInContext(app, ctx);
  (handlers.load || []).forEach((cb) => cb());
  return { visibility, sent, receive: (m: unknown) => (win.bbReceive as (m: unknown) => void)(m) };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('shows topo 1.5 s after ready when no basemap message arrives', () => {
  const page = boot();
  expect(page.sent.some((m) => m.type === 'ready')).toBe(true);
  expect(page.visibility.topo).toBe('none');
  jest.advanceTimersByTime(1499);
  expect(page.visibility.topo).toBe('none');
  jest.advanceTimersByTime(1);
  expect(page.visibility.topo).toBe('visible');
  expect(page.visibility.satellite).toBe('none');
});

it('never shows topo when a basemap is chosen before the fallback fires', () => {
  const page = boot();
  page.receive({ type: 'basemap', name: 'satellite' });
  page.receive({ type: 'offline', basemaps: [] });
  jest.advanceTimersByTime(5000);
  expect(page.visibility.topo).toBe('none');
  expect(page.visibility.satellite).toBe('visible');
});

it('an offline message before any basemap does not reveal topo early', () => {
  const page = boot();
  page.receive({ type: 'offline', basemaps: [] });
  expect(page.visibility.topo).toBe('none');
});
