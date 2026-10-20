import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import MapScreen from '@/app/(tabs)/index';
import FeedScreen from '@/app/(tabs)/feed';
import { samplePosts } from '@/data/posts';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (ui: React.ReactElement) => render(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);

describe('Map screen', () => {
  it('shows the nearby summary, then place details when a pin is tapped', async () => {
    await wrap(<MapScreen />);
    await fireEvent(screen.getByTestId('placeholder-map'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 700 } },
    });
    expect(screen.getByText('4 public spots nearby')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Managed dove field (sample C)'));
    expect(screen.getByText(/Managed Dove Field · York County/)).toBeTruthy();
    expect(screen.getByText(/No Sunday hunting for migratory game birds/)).toBeTruthy();
  });

  it('filters pins by place type', async () => {
    await wrap(<MapScreen />);
    await fireEvent(screen.getByTestId('placeholder-map'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 700 } },
    });
    await fireEvent.press(screen.getByText('Dove Fields'));
    expect(screen.getByText('1 public spots nearby')).toBeTruthy();
    expect(screen.queryByLabelText('State Game Lands (sample A)')).toBeNull();
  });
});

describe('Feed screen', () => {
  it('renders sample posts with blurred locations and toggles like', async () => {
    await wrap(<FeedScreen />);
    expect(screen.getByText(samplePosts[0].caption)).toBeTruthy();
    expect(screen.getAllByText('Location blurred').length).toBeGreaterThan(0);

    await fireEvent.press(screen.getAllByLabelText('Like')[0]);
    expect(screen.getByText(String(samplePosts[0].likes + 1))).toBeTruthy();
  });
});
