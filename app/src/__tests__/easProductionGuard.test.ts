import { execFileSync } from 'child_process';
import path from 'path';

// Same guard EAS runs before every cloud build (eas-build-pre-install).
it('eas.json production profile never carries the field-test unlock', () => {
  expect(() =>
    execFileSync(process.execPath, [path.join(__dirname, '../../scripts/check-eas-production.mjs')], { stdio: 'pipe' }),
  ).not.toThrow();
});
