import { act, renderHook } from '@testing-library/react-native';

import { mapHtml } from '@/components/map/mapHtml';
import type { PlaceMapProps } from '@/components/map/types';
import { useMapBridge, windMessage } from '@/components/map/useMapBridge';

const base = { places: [], basemap: 'topo', onSelect: jest.fn() };

describe('map bridge: wind layer', () => {
  it('validates viewport messages before calling onViewportChange', async () => {
    const onViewportChange = jest.fn();
    const onCenterChange = jest.fn();
    const props = { ...base, onViewportChange, onCenterChange } as unknown as PlaceMapProps;
    const { result } = await renderHook(() => useMapBridge(jest.fn(), props));
    for (const bad of [
      { bounds: null, zoom: 8, center: [-77, 41] },
      { bounds: [[-78, 40]], zoom: 8, center: [-77, 41] },
      { bounds: [[-78, 40], [-76, 42]], zoom: 'x', center: [-77, 41] },
      { bounds: [[-78, 40], [-76, 42]], zoom: 8, center: null },
    ])
      await act(async () => result.current.receive(JSON.stringify({ type: 'viewport', ...bad })));
    expect(onViewportChange).not.toHaveBeenCalled();
    await act(async () => result.current.receive(JSON.stringify({ type: 'viewport', bounds: [[-78, 40], [-76, 42]], zoom: 8.5, center: [-77, 41] })));
    expect(onViewportChange).toHaveBeenCalledWith({ bounds: [[-78, 40], [-76, 42]], zoom: 8.5, center: { lng: -77, lat: 41 } });
    // Existing center message still works alongside it.
    await act(async () => result.current.receive(JSON.stringify({ type: 'center', center: [-77, 41] })));
    expect(onCenterChange).toHaveBeenCalledWith({ lng: -77, lat: 41 });
  });

  it('posts wind samples after ready and clears with null', async () => {
    const post = jest.fn();
    let wind: PlaceMapProps['wind'] = [{ lng: -77, lat: 41, fromDeg: 315, mph: 12.4 }];
    const { result, rerender } = await renderHook(() => useMapBridge(post, { ...base, wind } as unknown as PlaceMapProps));
    expect(post.mock.calls.some((c) => c[0].type === 'wind')).toBe(false);
    await act(async () => result.current.receive(JSON.stringify({ type: 'ready' })));
    expect(post).toHaveBeenCalledWith({ type: 'wind', samples: [{ lng: -77, lat: 41, fromDeg: 315, mph: 12 }] });
    wind = null;
    await rerender({});
    expect(post).toHaveBeenLastCalledWith({ type: 'wind', samples: [] });
  });

  it('drops non-finite samples', () => {
    expect(windMessage([{ lng: NaN, lat: 1, fromDeg: 0, mph: 1 }, { lng: -77, lat: 41, fromDeg: null, mph: null }]).samples).toEqual([
      { lng: -77, lat: 41, fromDeg: null, mph: null },
    ]);
  });

  it('page draws wind markers and reports the viewport', () => {
    expect(mapHtml).toContain("m.type === 'wind'");
    expect(mapHtml).toContain('bb-wind');
    expect(mapHtml).toContain("type: 'viewport'");
    expect(mapHtml).toContain('(w.fromDeg + 180) % 360');
  });
});
