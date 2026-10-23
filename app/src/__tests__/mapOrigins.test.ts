import { isMapDocument } from '../components/map/PlaceMap';
import { mapHtml } from '../components/map/mapHtml';

describe('map WebView navigation', () => {
  it('loads only the local map document', () => {
    expect(isMapDocument('https://birdbrain.local/')).toBe(true);
    expect(isMapDocument('about:blank')).toBe(true);
    expect(isMapDocument('https://evil.example/')).toBe(false);
    expect(isMapDocument('https://birdbrain.local.evil.example/')).toBe(false);
  });
  it('sends no referrer to tile servers', () => {
    expect(mapHtml).toContain('<meta name="referrer" content="no-referrer">');
  });
});
