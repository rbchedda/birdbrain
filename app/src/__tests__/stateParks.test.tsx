import { Linking } from 'react-native';
import { act, render, renderHook } from '@testing-library/react-native';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { mapHtml } from '@/components/map/mapHtml';
import { pinColor } from '@/components/map/types';
import { useMapBridge } from '@/components/map/useMapBridge';
import { StateParkSheet } from '@/components/StateParkSheet';
import { MAP_BANNER } from '@/data/mapNotice';
import {
  DCNR_LAYER_DATE,
  DCNR_SOURCES_TEXT,
  FRENCH_CREEK_HUNTING_MAP_URL,
  STATE_PARK_LINE_1,
  STATE_PARK_LINE_2,
  STATE_PARKS,
  stateParksGeoJSON,
} from '@/data/stateParks';
import { colors } from '@/theme/tokens';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});

const OPEN_WORDING = /\bopen\b|public hunting|open access|hunt(ing)? open|open to hunting/i;
const frenchCreek = STATE_PARKS.find((p) => p.id === 'park:french-creek')!;

describe('approved wording, verbatim', () => {
  it('state park sheet lines', () => {
    expect(STATE_PARK_LINE_1).toBe(
      "State park (DCNR). Hunting allowed only in designated areas; check DCNR's park hunting map before you hunt.",
    );
    expect(STATE_PARK_LINE_2).toBe('Park boundary is approximate, not a survey. Park rules and closures apply.');
  });
  it('full map notice', () => {
    expect(MAP_BANNER).toBe(
      'Boundaries are approximate, not a survey. Shows public land (including state parks, where hunting is allowed only in designated areas) and PGC access-program land. Get permission before entering any other private land.',
    );
  });
  it('DCNR data source line, with the PASDA layer date', () => {
    expect(DCNR_LAYER_DATE).toBe('March 2025');
    expect(DCNR_SOURCES_TEXT(DCNR_LAYER_DATE)).toBe(
      "Source: Pennsylvania Department of Conservation and Natural Resources (DCNR), Bureau of State Parks, state park boundaries, via PASDA (Pennsylvania Spatial Data Access). The publisher describes these as approximate boundaries, not a survey. Shown as published; last updated: March 2025. Provided 'as is' without warranty. Not affiliated with or endorsed by DCNR or PASDA. Official information: dcnr.pa.gov.",
    );
  });
});

describe('French Creek State Park sheet', () => {
  it('shows both lines, links line 1 to the DCNR hunting map, and never says open/public hunting', async () => {
    const spy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const onClose = jest.fn();
    await render(<StateParkSheet park={frenchCreek} onClose={onClose} />);
    expect(screen.getByText('French Creek State Park')).toBeTruthy();
    const line1 = screen.getByTestId('state-park-line-1');
    expect(line1).toHaveTextContent(STATE_PARK_LINE_1);
    expect(line1.props.accessibilityRole).toBe('link');
    expect(screen.getByTestId('state-park-line-2')).toHaveTextContent(STATE_PARK_LINE_2);
    await fireEvent.press(line1);
    expect(spy).toHaveBeenCalledWith(FRENCH_CREEK_HUNTING_MAP_URL);
    expect(FRENCH_CREEK_HUNTING_MAP_URL).toBe('https://elibrary.dcnr.pa.gov/GetDocument?docId=1737668&DocName=FRCR_ParkMap.pdf');
    const all = JSON.stringify(screen.toJSON());
    expect(all).not.toMatch(OPEN_WORDING);
    expect(all).not.toMatch(/season open|Pheasant open|Open today/);
    spy.mockRestore();
  });

  it('map data carries no open or access status for the park', () => {
    const fc = stateParksGeoJSON();
    expect(fc.features).toHaveLength(1);
    const props = fc.features[0].properties as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual(['id', 'name']);
    expect(JSON.stringify(props)).not.toMatch(OPEN_WORDING);
    expect(fc.features[0].geometry.type).toMatch(/Polygon/);
  });

  it('draws as its own dashed layer in a color no hunt-land pin uses, with no text labels', () => {
    expect(mapHtml).toContain("map.addSource('parks'");
    expect(mapHtml).toMatch(/id: 'parks-line'[^}]*'line-dasharray'/s);
    expect(Object.values(pinColor)).not.toContain(colors.park);
    expect(colors.park).not.toBe(colors.accent);
    const parkLayers = mapHtml.split('\n').filter((l) => l.includes("source: 'parks'"));
    expect(parkLayers.join('\n')).not.toMatch(/symbol|text-field|open/);
  });

  it('a tap on the park outline reaches onSelectPark through the bridge', async () => {
    const post = jest.fn();
    const onSelect = jest.fn();
    const onSelectPark = jest.fn();
    const { result } = await renderHook(() =>
      useMapBridge(post, { places: [], basemap: 'topo', onSelect, onSelectPark }),
    );
    await act(async () => result.current.receive(JSON.stringify({ type: 'ready' })));
    expect(post).toHaveBeenCalledWith({ type: 'parks', data: stateParksGeoJSON() });
    await act(async () => result.current.receive(JSON.stringify({ type: 'selectPark', id: 'park:french-creek' })));
    expect(onSelectPark).toHaveBeenCalledWith('park:french-creek');
    expect(onSelect).not.toHaveBeenCalledWith('park:french-creek');
  });
});

describe('data sources page', () => {
  it('lists the DCNR line', async () => {
    await renderRouter('./src/app', { initialUrl: '/data-sources' });
    expect(await screen.findByTestId('data-sources-dcnr')).toHaveTextContent(DCNR_SOURCES_TEXT(DCNR_LAYER_DATE));
  });
});
