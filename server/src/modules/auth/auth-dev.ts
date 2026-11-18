export function isDevAuthEnabled(
  env: { NODE_ENV?: string; ENABLE_DEMO_CREDENTIALS?: string } = process.env,
): boolean {
  return env.NODE_ENV === 'development' && env.ENABLE_DEMO_CREDENTIALS === 'true';
}
