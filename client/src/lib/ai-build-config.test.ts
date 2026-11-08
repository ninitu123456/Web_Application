import { afterEach, expect, it, vi } from 'vitest';
import type { ConfigEnv } from 'vite';
import config from '../../vite.config';

const configure = config as (env: ConfigEnv) => unknown;
afterEach(() => vi.unstubAllEnvs());

it('rejects synthetic fixtures in production builds even with the local browser marker', () => {
  vi.stubEnv('VITE_AI_VISUAL_SUGGESTIONS_PREVIEW_FIXTURE', 'true');
  vi.stubEnv('FINDIT_FRONTEND_BROWSER_BUILD', '1');
  expect(() => configure({ command: 'build', mode: 'production' })).toThrow(/must be false/);
});

it('permits only an explicit local test build and rejects provider-scoped fixture builds', () => {
  vi.stubEnv('VITE_AI_VISUAL_SUGGESTIONS_PREVIEW_FIXTURE', 'true');
  vi.stubEnv('FINDIT_FRONTEND_BROWSER_BUILD', '1');
  vi.stubEnv('VERCEL', undefined);
  vi.stubEnv('RAILWAY_ENVIRONMENT_ID', undefined);
  expect(() => configure({ command: 'build', mode: 'test' })).not.toThrow();
  for (const provider of ['VERCEL', 'RAILWAY_ENVIRONMENT_ID']) {
    vi.stubEnv(provider, 'fixture-provider');
    expect(() => configure({ command: 'build', mode: 'test' })).toThrow(/must be false/);
    vi.stubEnv(provider, undefined);
  }
  vi.stubEnv('FINDIT_FRONTEND_BROWSER_BUILD', undefined);
  expect(() => configure({ command: 'build', mode: 'test' })).toThrow(/must be false/);
});
