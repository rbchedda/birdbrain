import { render, screen } from '@testing-library/react-native';

import { PastSeasonsCardView } from '@/components/spot/PastSeasonsCard';
import type { PastSeasonsSummary } from '@/data/pastSeasons';
import type { DiaryWeather } from '@/data/types';

const weather = (w: Partial<DiaryWeather> = {}): DiaryWeather => ({
  tempF: 42,
  windMph: 8,
  windDir: 'NW',
  sky: 'partly cloudy',
  precip: null,
  ...w,
});

const base = (over: Partial<PastSeasonsSummary> = {}): PastSeasonsSummary => ({
  reference: '2026-11-05',
  placeId: 'sgl-211',
  hunts: [],
  huntCount: 0,
  seasons: 0,
  flushes: 0,
  harvest: 0,
  note: 'No hunts logged here for this calendar week in earlier seasons.',
  bestTime: null,
  bestWeather: null,
  empty: true,
  ...over,
});

describe('PastSeasonsCardView', () => {
  it('shows the honest empty state with no invented numbers', () => {
    render(<PastSeasonsCardView summary={base()} />);
    expect(screen.getByTestId('past-seasons-card-empty')).toBeTruthy();
    expect(screen.getByText('No history for this week yet')).toBeTruthy();
    expect(screen.getByText(/Nothing is invented/)).toBeTruthy();
    expect(screen.queryByTestId('past-seasons-card-tiles')).toBeNull();
    expect(screen.queryByTestId('past-seasons-card-best-time')).toBeNull();
    expect(screen.getByTestId('past-seasons-card-privacy')).toBeTruthy();
  });

  it('shows counts, note, and best hints when the sample is large enough', () => {
    render(
      <PastSeasonsCardView
        summary={base({
          empty: false,
          huntCount: 5,
          seasons: 2,
          flushes: 11,
          harvest: 3,
          note: '5 hunts across 2 prior seasons · 11 flushes, birds in hand on 2.',
          bestTime: { bucket: 'morning', label: 'Morning (before 10)', sample: 4 },
          bestWeather: { text: 'NW wind 8 mph · 42°F · partly cloudy', sample: 3, weather: weather() },
        })}
      />,
    );
    expect(screen.getByTestId('past-seasons-card-hunts')).toHaveTextContent('5');
    expect(screen.getByTestId('past-seasons-card-flushes')).toHaveTextContent('11');
    expect(screen.getByTestId('past-seasons-card-harvest')).toHaveTextContent('3');
    expect(screen.getByTestId('past-seasons-card-seasons')).toHaveTextContent('2');
    expect(screen.getByTestId('past-seasons-card-note')).toHaveTextContent(/5 hunts across 2 prior seasons/);
    expect(screen.getByTestId('past-seasons-card-best-time')).toHaveTextContent(/Morning/);
    expect(screen.getByTestId('past-seasons-card-best-weather')).toHaveTextContent(/NW wind 8 mph/);
    expect(screen.queryByTestId('past-seasons-card-no-hint')).toBeNull();
  });

  it('omits best hints below the sample threshold and says so', () => {
    render(
      <PastSeasonsCardView
        summary={base({
          empty: false,
          huntCount: 2,
          seasons: 1,
          flushes: 3,
          harvest: 0,
          note: '2 hunts across 1 prior season · 3 flushes.',
          bestTime: null,
          bestWeather: null,
        })}
      />,
    );
    expect(screen.getByTestId('past-seasons-card-tiles')).toBeTruthy();
    expect(screen.getByTestId('past-seasons-card-no-hint')).toHaveTextContent(/at least 3 hunts/);
    expect(screen.queryByTestId('past-seasons-card-best-time')).toBeNull();
  });
});
