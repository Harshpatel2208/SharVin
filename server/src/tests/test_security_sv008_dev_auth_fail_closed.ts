import assert from 'node:assert/strict';
import { isDevAuthEnabled } from '../modules/auth/auth-dev';

assert.equal(isDevAuthEnabled({ NODE_ENV: 'development', ENABLE_DEMO_CREDENTIALS: 'true' }), true);
for (const env of [
  { NODE_ENV: undefined, ENABLE_DEMO_CREDENTIALS: undefined },
  { NODE_ENV: 'production', ENABLE_DEMO_CREDENTIALS: 'true' },
  { NODE_ENV: 'test', ENABLE_DEMO_CREDENTIALS: 'true' },
  { NODE_ENV: 'staging', ENABLE_DEMO_CREDENTIALS: 'true' },
  { NODE_ENV: 'preview', ENABLE_DEMO_CREDENTIALS: 'true' },
  { NODE_ENV: 'developement', ENABLE_DEMO_CREDENTIALS: 'true' },
  { NODE_ENV: 'development', ENABLE_DEMO_CREDENTIALS: undefined },
  { NODE_ENV: 'development', ENABLE_DEMO_CREDENTIALS: 'false' },
]) {
  assert.equal(isDevAuthEnabled(env), false, `dev auth must fail closed for ${JSON.stringify(env)}`);
}

console.log('SV-008 regression tests passed');
