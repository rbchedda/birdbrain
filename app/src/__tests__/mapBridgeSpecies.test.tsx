import { act, renderHook } from '@testing-library/react-native';

import { isLngLat, useMapBridge } from '@/components/map/useMapBridge';
import type { PlaceMapProps } from '@/components/map/types';
import type { Place } from '@/data/types';

const place: Place = { id: 'a', name: 'A', type: 'game_land', county: null, species: [], center: { lng: -77, lat: 41 }, acres: null, access: 'state_game_land' };

describe('map bridge: species search', () => {
  it('validates center messages before calling onCenterChange', async () => {
    const onCenterChange = jest.fn();
    const props = { places: [], basemap: 'topo', onSelect: jest.fn(), onCenterChange } as unknown as PlaceMapProps;
    const { result } = await renderHook(() => useMapBridge(jest.fn(), props));
    for (const bad of [null, [1], ['x', 2], [Infinity, 1], [200, 10], { lng: 1, lat: 2 }])
      await act(async () => result.current.receive(JSON.stringify({ type: 'center', center: bad })));
    expect(onCenterChange).not.toHaveBeenCalled();
    await act(async () => result.current.receive(JSON.stringify({ type: 'center', center: [-77.5, 40.9] })));
    expect(onCenterChange).toHaveBeenCalledWith({ lng: -77.5, lat: 40.9 });
    expect(isLngLat([-77, 40])).toBe(true);
  });

  it('sends ranks on place features and fit bounds', async () => {
    const post = jest.fn();
    const fit = { bounds: [[-78, 40], [-77, 41]] as [[number, number], [number, number]], key: 1 };
    const props = { places: [place], basemap: 'topo', onSelect: jest.fn(), ranks: { a: 3 }, fit } as unknown as PlaceMapProps;
    const { result } = await renderHook(() => useMapBridge(post, props));
    await act(async () => result.current.receive(JSON.stringify({ type: 'ready' })));
    const places = post.mock.calls.map((c) => c[0]).find((m) => m.type === 'places');
    expect(places.data.features[0].properties.rank).toBe(3);
    expect(post).toHaveBeenCalledWith({ type: 'fit', bounds: fit.bounds });
  });
});
