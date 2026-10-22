import { render, screen } from '@testing-library/react-native';

import { RegsSection } from '@/components/guide/GuideSections';
import { HUNTFISHPA_URL } from '@/data/regs';

describe('Licenses: Buy on HuntFishPA link', () => {
  it('is null (hidden) until the URL is verified', async () => {
    expect(HUNTFISHPA_URL).toBeNull();
    await render(<RegsSection />);
    expect(screen.queryByText('Buy on HuntFishPA ›')).toBeNull();
  });

  it('shows on the Licenses card once a URL is set', async () => {
    await render(<RegsSection buyUrl="https://example.test/buy" />);
    expect(screen.getByText('Buy on HuntFishPA ›')).toBeTruthy();
  });
});
