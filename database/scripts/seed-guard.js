export function assertDemoSeedAllowed(env = process.env) {
  if (env.NODE_ENV === 'production' || env.RAILWAY_ENVIRONMENT_ID || env.RAILWAY_PROJECT_ID || env.VERCEL)
    throw new Error('Demo seed/setup is forbidden in production; no maintenance override is provided');
}
