import { expect, it } from 'vitest';
import { createDeploymentConfig } from '../deployment/config';

it('uses the env backend origin while preserving same-origin API requests and SPA routing', () => {
  const config = createDeploymentConfig('https://api.example.com/');
  expect(config.rewrites).toEqual([
    { source: '/api/:path*', destination: 'https://api.example.com/api/:path*' },
    { source: '/(.*)', destination: '/index.html' },
  ]);
  expect(createDeploymentConfig('https://other.example.com').rewrites?.[0]?.destination).toBe(
    'https://other.example.com/api/:path*',
  );
  expect(config.headers?.find((entry) => entry.source === '/(.*)')?.headers).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ key: 'Content-Security-Policy' }),
      expect.objectContaining({ key: 'X-Content-Type-Options', value: 'nosniff' }),
    ]),
  );
});

it.each([
  undefined,
  '',
  '   ',
  'invalid',
  'http://api.example.com',
  'https://localhost',
  'https://user:password@api.example.com',
  'https://api.example.com/api',
  'https://api.example.com?key=value',
  'https://api.example.com/#fragment',
])('rejects a missing or invalid backend origin: %s', (origin) => {
  expect(() => createDeploymentConfig(origin)).toThrow(/BACKEND_URL/);
});

it('keeps private pages excluded from search indexing', () => {
  const config = createDeploymentConfig('https://api.example.com');
  for (const source of ['/login','/register','/recover','/s/:path*','/vault','/vault/:path*']) {
    expect(config.headers.find((entry) => entry.source === source)?.headers).toContainEqual({key:'X-Robots-Tag',value:'noindex, nofollow'});
  }
});

it('permits local OCR WebAssembly workers without allowing remote workers or JavaScript eval', () => {
  const config = createDeploymentConfig('https://api.example.com');
  const csp = config.headers.find(entry => entry.source === '/(.*)')?.headers.find(header => header.key === 'Content-Security-Policy')?.value;
  expect(csp).toContain("worker-src 'self'");
  expect(csp).toContain("'wasm-unsafe-eval'");
  expect(csp).not.toContain("'unsafe-eval'");
});
