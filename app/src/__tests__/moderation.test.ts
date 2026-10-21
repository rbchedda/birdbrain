import { containsObjectionable } from '@/data/moderation';
import { createSampleBackend } from '@/data/sampleBackend';

describe('objectionable-content filter (mirrors the database)', () => {
  it('matches whole words, any case or punctuation', () => {
    expect(containsObjectionable('What the FUCK!')).toBe(true);
    expect(containsObjectionable('you retard')).toBe(true);
    expect(containsObjectionable('Scunthorpe pheasants near the fagus trees')).toBe(false);
    expect(containsObjectionable(null)).toBe(false);
  });

  it('sample backend records rules acceptance once', async () => {
    const b = createSampleBackend();
    expect(await b.rulesAccepted()).toBe(false);
    await b.acceptRules();
    await b.acceptRules();
    expect(await b.rulesAccepted()).toBe(true);
  });
});
