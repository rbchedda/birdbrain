import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});

describe('species search on the map', () => {
  const go = () => renderRouter('./src/app', { initialUrl: '/' });

  it('suggests birds by alias and opens ranked results; ✕ clears', async () => {
    await go();
    await screen.findByText(/spots nearby/);
    const input = screen.getByLabelText('Search places');
    expect(input.props.placeholder).toBe('Search places or a bird…');
    await fireEvent.changeText(input, 'timberdoodle');
    await fireEvent.press(await screen.findByLabelText('Find spots for Woodcock'));
    expect(await screen.findByText('Woodcock near you')).toBeTruthy();
    expect(screen.getByText(/ranked by distance \+ habitat fit/)).toBeTruthy();
    expect(screen.getByText('Public only')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Clear search'));
    expect(screen.queryByText('Woodcock near you')).toBeNull();
  });

  it('says when a bird is not covered yet', async () => {
    await go();
    await screen.findByText(/spots nearby/);
    const input = screen.getByLabelText('Search places');
    await fireEvent.changeText(input, 'quail');
    await fireEvent(input, 'submitEditing');
    expect(await screen.findByText('We don’t cover quail yet')).toBeTruthy();
  });
});
