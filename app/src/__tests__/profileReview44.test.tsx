import { dayTicks } from '@/components/stats/charts';
import { summaryLine } from '@/components/profile/SeasonStatsView';
import { huntSummary, plansSummary, statsSummary } from '@/app/(tabs)/profile';

describe('Profile review beta-4.4 helpers', () => {
  it('days axis never has fractional ticks', () => {
    for (const raw of [0, 0.4, 1, 1.5, 2, 3, 5, 7, 11]) {
      const { mx, ticks } = dayTicks(raw);
      ticks.forEach((t) => expect(Number.isInteger(t)).toBe(true));
      expect(mx).toBeGreaterThanOrEqual(2);
      expect(ticks[ticks.length - 1]).toBe(mx);
    }
  });
  it('summary line hides zero counties', () => {
    const line = summaryLine({ hours: 3, miles: 1, shots: 0, counties: 0, dogRetrieves: 2 });
    expect(line).toBe('3 hours · 1 mile · 2 retrieves');
    expect(summaryLine({ hours: 0, miles: 0, shots: 0, counties: 0, dogRetrieves: 0 })).toBe('');
  });
  it('menu summaries', () => {
    expect(huntSummary(0)).toBe('No hunts yet');
    expect(huntSummary(5)).toBe('5 hunts · private diary');
    expect(statsSummary(0, 0)).toBe('Fills in after your first hunt');
    expect(statsSummary(5, 52)).toBe('5 days afield · 52 flushes');
    expect(plansSummary([] as never, false)).toBe('Sign in to plan hunts');
    expect(plansSummary([] as never, true)).toBe('Plan a hunt from any spot');
  });
});
