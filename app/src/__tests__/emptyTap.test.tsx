import { act, fireEvent, renderHook, renderRouter, screen } from 'expo-router/testing-library';
import { Keyboard } from 'react-native';
import { Script } from 'node:vm';

import { mapHtml } from '@/components/map/mapHtml';
import type { PlaceMapProps } from '@/components/map/types';
import { useMapBridge } from '@/components/map/useMapBridge';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});
const mapProps: PlaceMapProps[] = [];
jest.mock('@/components/map/PlaceMap', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    PlaceMap: (p: PlaceMapProps) => {
      mapProps.push(p);
      return <View testID="place-map" />;
    },
  };
});

const square = { type: 'Polygon', coordinates: [[[-78, 40], [-77, 40], [-77, 41], [-78, 41], [-78, 40]]] } as PlaceMapProps['outline'];

describe('map page: click handler', () => {
  it('uses map.on("click") + queryRenderedFeatures and posts emptyTap only when nothing is hit', () => {
    expect(mapHtml).toContain("map.on('click'");
    expect(mapHtml).toContain('queryRenderedFeatures');
    const click = mapHtml.slice(mapHtml.indexOf("map.on('click'"), mapHtml.indexOf("map.on('mousemove'"));
    // Every hit path returns before the emptyTap post.
    expect(click.indexOf("type: 'emptyTap'")).toBeGreaterThan(click.lastIndexOf('return'));
    expect(click).not.toContain('\\');
  });
  it('inline scripts still parse (vm.Script)', () => {
    const scripts = [...mapHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(scripts.length).toBeGreaterThan(0);
    for (const s of scripts) expect(() => new Script(s)).not.toThrow();
  });
});

describe('bridge: emptyTap validation', () => {
  const setup = async (extra: Partial<PlaceMapProps> = {}) => {
    const onSelect = jest.fn();
    const onEmptyTap = jest.fn();
    const { result } = await renderHook(() => useMapBridge(jest.fn(), { places: [], basemap: 'topo', onSelect, onEmptyTap, ...extra }));
    const send = (m: unknown) => act(async () => result.current.receive(typeof m === 'string' ? m : JSON.stringify(m)));
    return { onSelect, onEmptyTap, send };
  };
  it('calls onEmptyTap for a valid empty tap', async () => {
    const t = await setup();
    await t.send({ type: 'emptyTap', lngLat: [-76, 40.5] });
    await t.send({ type: 'emptyTap' });
    expect(t.onEmptyTap).toHaveBeenCalledTimes(2);
    expect(t.onSelect).not.toHaveBeenCalled();
  });
  it('ignores malformed messages', async () => {
    const t = await setup();
    for (const m of ['not json', 'null', '42', '"emptyTap"', JSON.stringify({ type: 1 }), JSON.stringify({ kind: 'emptyTap' })]) await t.send(m);
    expect(t.onEmptyTap).not.toHaveBeenCalled();
  });
  it('a tap inside the selected outline is a boundary tap, not empty', async () => {
    const t = await setup({ outline: square });
    await t.send({ type: 'emptyTap', lngLat: [-77.5, 40.5] });
    expect(t.onEmptyTap).not.toHaveBeenCalled();
    await t.send({ type: 'emptyTap', lngLat: [-75, 40.5] });
    await t.send({ type: 'emptyTap', lngLat: ['x', 1] });
    expect(t.onEmptyTap).toHaveBeenCalledTimes(2);
  });
  it('falls back to deselecting without onEmptyTap', async () => {
    const t = await setup({ onEmptyTap: undefined });
    await t.send({ type: 'emptyTap', lngLat: [-75, 40] });
    expect(t.onSelect).toHaveBeenCalledWith(null);
  });
});

describe('map screen: one empty tap closes everything', () => {
  it('closes the layers menu, dismisses the keyboard, deselects and collapses; the notice stays', async () => {
    const kb = jest.spyOn(Keyboard, 'dismiss');
    await renderRouter('./src/app', { initialUrl: '/' });
    await screen.findByText('6 spots nearby');
    await fireEvent.press(screen.getByLabelText('Expand details'));
    await fireEvent.press(screen.getByLabelText('State Game Lands (sample A)'));
    await screen.findByLabelText('Back to list');
    await fireEvent.press(screen.getByLabelText('Map layers'));
    await act(async () => mapProps.at(-1)!.onEmptyTap!());
    expect(kb).toHaveBeenCalled();
    expect(screen.queryByLabelText('Back to list')).toBeNull();
    expect(screen.getByLabelText('Expand details')).toBeTruthy();
    expect(screen.queryByText('6 spots nearby')).toBeTruthy();
    expect(screen.getByTestId('map-banner')).toBeTruthy();
    kb.mockRestore();
  });
});
