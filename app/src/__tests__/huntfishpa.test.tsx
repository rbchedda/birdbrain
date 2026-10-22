import { render, screen } from '@testing-library/react-native';

import { RegsSection } from '@/components/guide/GuideSections';
import { HUNTFISHPA_URL } from '@/data/regs';

describe('Licenses: Buy on HuntFishPA link', () => {
  it('points at the official HuntFishPA site and shows by default', async () => {
    expect(HUNTFISHPA_URL).toBe('https://huntfish.pa.gov/');
    await render(<RegsSection />);
    expect(screen.getByText('Buy on HuntFishPA ›')).toBeTruthy();
  });

  it('stays hidden when the URL is null', async () => {
    await render(<RegsSection buyUrl={null} />);
    expect(screen.queryByText('Buy on HuntFishPA ›')).toBeNull();
  });
});
