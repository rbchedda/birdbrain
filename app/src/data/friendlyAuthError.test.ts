import { friendlyAuthError } from './supabaseBackend';
it('maps auth errors to clear copy', () => {
  expect(friendlyAuthError('Email not confirmed')).toMatch(/isn’t confirmed/);
  expect(friendlyAuthError('Invalid login credentials')).toMatch(/don’t match/);
  expect(friendlyAuthError('User already registered')).toMatch(/Sign in instead/);
  expect(friendlyAuthError('')).toMatch(/try again/);
});
