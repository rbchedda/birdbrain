import React from 'react';
import { render } from '@testing-library/react-native';

import { CrewSpotVerdictCard, SpotVerdictCardView } from '@/components/spot/SpotVerdictCard';
import type { SpotVerdict, SpotVerdictSnapshot } from '@/data/spotVerdict';
import { verdictShareActionsAllowed } from '@/data/spotVerdict';

const crewVerdict: SpotVerdict = {
  word: 'Productive',
  line: 'You flushed birds on 3 of your last 3 hunts here.',
  honestLine: 'Based on your 3 hunts here · not a prediction',
  crewHonestLine: "Alex's history here · 3 past hunts · not a prediction or a report of birds now",
  huntsCounted: 3,
  visits: [],
  dots: ['productive', 'productive', 'productive'],
  stockingLine: null,
  frozen: false,
  audience: 'crew',
};

const snap: SpotVerdictSnapshot = {
  word: 'Slow',
  line: 'Birds on 0 of your last 2 hunts here.',
  crewHonestLine: "Alex's history here · 2 past hunts · not a prediction or a report of birds now",
  stockingLine: null,
  dots: ['slow', 'slow'],
  huntsCounted: 2,
  frozen: false,
  computedAt: '2026-11-05T12:00:00.000Z',
  reference: '2026-11-08',
};

describe('SpotVerdictCard share / export guards', () => {
  it('renders no share, export, or screenshot-share control for crew', async () => {
    expect(verdictShareActionsAllowed('crew')).toBe(false);
    const sc = await render(<SpotVerdictCardView verdict={crewVerdict} testID="crew-spot-verdict" />);
    expect(sc.getByTestId('crew-spot-verdict')).toBeTruthy();
    expect(sc.queryByTestId('crew-spot-verdict-share')).toBeNull();
    expect(sc.queryByText(/^Share$/)).toBeNull();
    expect(sc.queryByText(/export/i)).toBeNull();
    expect(sc.queryByText(/screenshot/i)).toBeNull();
  });

  it('CrewSpotVerdictCard stays hidden when opt-in is off or snapshot missing', async () => {
    const off = await render(<CrewSpotVerdictCard snapshot={snap} showToCrew={false} />);
    expect(off.queryByTestId('crew-spot-verdict')).toBeNull();
    const missing = await render(<CrewSpotVerdictCard snapshot={null} showToCrew={true} />);
    expect(missing.queryByTestId('crew-spot-verdict')).toBeNull();
    const on = await render(<CrewSpotVerdictCard snapshot={snap} showToCrew={true} />);
    expect(on.getByTestId('crew-spot-verdict')).toBeTruthy();
    expect(on.queryByTestId('crew-spot-verdict-share')).toBeNull();
    expect(on.getByText(/not a prediction or a report of birds now/)).toBeTruthy();
  });
});
